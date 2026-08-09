# AgentEval Web UI (merged console) quick start.
# Starts Postgres (console shell), the FastAPI evaluation backend, and the web UI.
# Stop: press Ctrl+C in this window, then `docker stop tasklattice-dev-postgres`.
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\95602\IdeaProjects\AgentEval"

# 1. Console shell database (projects/auth). Ignore failures when Docker is absent.
try {
  & "C:\Program Files\Docker\Docker\resources\bin\docker.exe" start tasklattice-dev-postgres | Out-Null
} catch {
  Write-Host "Postgres not started; create it once with:" -ForegroundColor Yellow
  Write-Host "  docker run -d --name tasklattice-dev-postgres --restart unless-stopped -e POSTGRES_USER=tasklattice -e POSTGRES_PASSWORD=development -e POSTGRES_DB=tasklattice -p 5432:5432 postgres:17-alpine" -ForegroundColor Yellow
}

# 2. AgentEval Web API (real evaluation backend) on port 8000.
Write-Host "Starting AgentEval Web API on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Start-Process -WindowStyle Hidden -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "src.api.main:app", "--port", "8000"

# 3. Web UI on port 18082 (admin / admin).
Set-Location "C:\Users\95602\IdeaProjects\AgentEval\web"
Remove-Item Env:TASKLATTICE_CONFIG -ErrorAction SilentlyContinue
$env:PORT = "18082"
Write-Host "Web UI: http://127.0.0.1:18082 (login: admin / admin)" -ForegroundColor Cyan
npm run dev:control
