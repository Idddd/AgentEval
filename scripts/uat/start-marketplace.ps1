param(
  [switch]$Build,
  [ValidateSet('marketplace','marketplace-nemo-strict','marketplace-nemo-ui','marketplace-nemo-demo')][string]$Profile = 'marketplace'
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$appRoot = Join-Path $taskRoot 'web/apps/control'
$runtimeRoot = Join-Path $taskRoot '.artifacts/uat-nemo'
$configFile = Join-Path $runtimeRoot "$Profile.env"
$port = if ($Profile -eq 'marketplace-nemo-strict') { 18086 } else { 18082 }
$entryFile = Join-Path $appRoot '.output/server/index.mjs'
if (-not (Test-Path -LiteralPath $configFile)) { throw 'Configure marketplace.env first.' }
if ($Build) {
  Push-Location $appRoot
  try {
    & node '../../node_modules/vite/bin/vite.js' build *> (Join-Path $runtimeRoot 'marketplace-build.log')
    if ($LASTEXITCODE -ne 0) { throw 'Marketplace build failed. See marketplace-build.log.' }
  } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $entryFile)) { throw 'Run this script with -Build first.' }
$pidFile = Join-Path $runtimeRoot "$Profile.pid"
if (Test-Path -LiteralPath $pidFile) {
  $taskPid = [int](Get-Content -LiteralPath $pidFile)
  $previous = Get-CimInstance Win32_Process -Filter "ProcessId = $taskPid"
  if ($previous -and $previous.Name -eq 'node.exe' -and $previous.CommandLine -like "*$Profile.env*" -and $previous.CommandLine -like '*.output/server/index.mjs*') {
    taskkill.exe /PID $taskPid /F
    if ($LASTEXITCODE -ne 0) { throw "Could not stop the previous $Profile process." }
  }
}
$arguments = @('--env-file="' + $configFile + '"', '"' + ($entryFile.Replace('\','/')) + '"')
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot "$Profile.stdout.log") -RedirectStandardError (Join-Path $runtimeRoot "$Profile.stderr.log") -PassThru
$process.Id | Set-Content -LiteralPath $pidFile
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if ($process.HasExited) { break }
  try { $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2; if ($response.StatusCode -eq 200 -and !$process.HasExited) { $ready = $true; break } } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "Marketplace did not become healthy. See $Profile.stderr.log." }
Write-Output "Marketplace test process started (PID $($process.Id)). Local URL: http://127.0.0.1:$port/v3/guardrails"
