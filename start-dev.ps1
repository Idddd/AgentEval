[CmdletBinding()]
param(
  [int]$WebPort = 18082,
  [int]$ApiPort = 8000,
  [int]$PostgresPort = 55432
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$webRoot = Join-Path $projectRoot "web"
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$dataRoot = Join-Path $projectRoot "data"
$controlConfig = Join-Path $dataRoot "control.dev.toml"
$postgresContainer = "tasklattice-dev-postgres"

if (-not (Test-Path -LiteralPath $python)) {
  throw "Python virtual environment not found at $python"
}

$docker = (Get-Command docker -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null

Write-Host "Checking Docker..." -ForegroundColor Cyan
& $docker info | Out-Null

$existingContainer = & $docker ps -a --filter "name=^/$postgresContainer$" --format "{{.Names}}"
if (-not $existingContainer) {
  Write-Host "Creating PostgreSQL on host port $PostgresPort..." -ForegroundColor Cyan
  & $docker run -d `
    --name $postgresContainer `
    --restart unless-stopped `
    -e POSTGRES_USER=tasklattice `
    -e POSTGRES_PASSWORD=development `
    -e POSTGRES_DB=tasklattice `
    -p "127.0.0.1:${PostgresPort}:5432" `
    postgres:17-alpine | Out-Null
} else {
  $containerImage = & $docker inspect --format "{{.Config.Image}}" $postgresContainer
  $containerEnv = & $docker inspect --format "{{json .Config.Env}}" $postgresContainer | ConvertFrom-Json
  $requiredContainerEnv = @(
    "POSTGRES_USER=tasklattice",
    "POSTGRES_PASSWORD=development",
    "POSTGRES_DB=tasklattice"
  )
  if ($containerImage -ne "postgres:17-alpine" -or
      ($requiredContainerEnv | Where-Object { $_ -notin $containerEnv })) {
    throw "Container '$postgresContainer' exists with incompatible image or database settings. Rename or remove that container before starting AgentEval."
  }
  & $docker start $postgresContainer | Out-Null
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  & $docker exec $postgresContainer pg_isready -U tasklattice -d tasklattice | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  throw "PostgreSQL did not become ready."
}

$portBinding = & $docker port $postgresContainer "5432/tcp" | Select-Object -First 1
if ($portBinding -notmatch ':(\d+)$') {
  throw "Unable to determine the PostgreSQL host port from: $portBinding"
}
$postgresHostPort = [int]$Matches[1]

$configText = @"
schema_version = 1

[server]
public_url = "http://127.0.0.1:$WebPort"

[database]
url = "postgresql://tasklattice:development@127.0.0.1:$postgresHostPort/tasklattice"

[auth]
session_signing_key = "tasklattice-local-development-secret"

[auth.local]
enabled = true
initial_super_admin_username = "admin"
initial_super_admin_password_hash = "`$2b`$12`$Zx2mCLJZ0n/iY4Tq.Z3eXu0O.z5SHM.pKJyNNurKX/Z7CD5HHOg.e"

[auth.oidc]
enabled = false
display_name = "SSO"
issuer = ""
client_id = ""
client_secret = ""

[runner]
url = "http://127.0.0.1:9090"
token = "local-dev-token"

[litellm]
url = "http://127.0.0.1:4000"
master_key = ""

[smtp]
enabled = false
host = ""
port = 587
secure = false
username = ""
password = ""
from_address = ""
from_name = "TaskLattice"
reply_to = ""
"@
[System.IO.File]::WriteAllText(
  $controlConfig,
  $configText,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "Installing missing dependencies when needed..." -ForegroundColor Cyan
Push-Location $projectRoot
try {
  & $python -c "from src.api.main import app" 2>$null
} finally {
  Pop-Location
}
if ($LASTEXITCODE -ne 0) {
  & $python -m pip install -r (Join-Path $projectRoot "requirements.txt")
}
if (-not (Test-Path -LiteralPath (Join-Path $webRoot "node_modules"))) {
  Push-Location $webRoot
  try { & $npm ci } finally { Pop-Location }
}

Push-Location $webRoot
try {
  & $npm run build --workspace "@tasklattice/contracts"
  $env:TASKLATTICE_CONFIG = $controlConfig
  & $npm run db:generate:control
  & $npm run db:migrate:control
} finally {
  Pop-Location
}

$apiProcess = $null
try {
  $apiReady = $false
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$ApiPort/healthz" -TimeoutSec 2
    $apiReady = $health.StatusCode -eq 200
  } catch {}

  if (-not $apiReady) {
    Write-Host "Starting AgentEval API on http://127.0.0.1:$ApiPort ..." -ForegroundColor Cyan
    $apiProcess = Start-Process `
      -WindowStyle Hidden `
      -FilePath $python `
      -ArgumentList @("-m", "uvicorn", "src.api.main:app", "--host", "127.0.0.1", "--port", "$ApiPort") `
      -WorkingDirectory $projectRoot `
      -RedirectStandardOutput (Join-Path $dataRoot "fastapi.dev.stdout.log") `
      -RedirectStandardError (Join-Path $dataRoot "fastapi.dev.stderr.log") `
      -PassThru

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      if ($apiProcess.HasExited) {
        throw "AgentEval API exited during startup. See data/fastapi.dev.stderr.log."
      }
      try {
        $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$ApiPort/healthz" -TimeoutSec 2
        if ($health.StatusCode -eq 200) {
          $apiReady = $true
          break
        }
      } catch {}
      Start-Sleep -Seconds 1
    }
    if (-not $apiReady) {
      throw "AgentEval API did not become healthy within 30 seconds. See data/fastapi.dev.stderr.log."
    }
  }

  $env:TASKLATTICE_CONFIG = $controlConfig
  $env:EVAL_API_URL = "http://127.0.0.1:$ApiPort"
  $env:HOST = "0.0.0.0"
  $env:PORT = "$WebPort"

  Write-Host "TALI UI: http://127.0.0.1:$WebPort (admin / admin)" -ForegroundColor Green
  Write-Host "Press Ctrl+C to stop the Web UI. PostgreSQL will remain available." -ForegroundColor DarkGray
  Push-Location $webRoot
  try { & $npm run dev:control } finally { Pop-Location }
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
}
