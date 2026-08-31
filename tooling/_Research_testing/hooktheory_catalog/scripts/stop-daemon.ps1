# Graceful stop for catalog daemon
$ErrorActionPreference = "Stop"
$CatalogRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $CatalogRoot) -eq 'scripts') {
  $CatalogRoot = Split-Path -Parent $CatalogRoot
}
Set-Location $CatalogRoot

$DataDir = Join-Path $CatalogRoot "data"
$StopFile = Join-Path $DataDir ".catalog_stop"
$PidFile = Join-Path $DataDir "daemon.pid"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }

Set-Content -Path $StopFile -Value (Get-Date -Format o)
Write-Host "Stop signal written (data/.catalog_stop). Daemon will exit after current song."

if (Test-Path $PidFile) {
    $pid = [int](Get-Content $PidFile -Raw)
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if (-not $proc) {
            Write-Host "Daemon exited gracefully (PID $pid)"
            if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
            exit 0
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "Daemon still running after 90s; force stopping PID $pid"
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "No daemon.pid found (may already be stopped)"
}
