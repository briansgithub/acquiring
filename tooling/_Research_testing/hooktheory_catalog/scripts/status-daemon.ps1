# Catalog daemon + DB status
$CatalogRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $CatalogRoot) -eq 'scripts') {
  $CatalogRoot = Split-Path -Parent $CatalogRoot
}
Set-Location $CatalogRoot

$DataDir = Join-Path $CatalogRoot "data"
$PidFile = Join-Path $DataDir "daemon.pid"
$StateFile = Join-Path $DataDir "daemon_state.json"
$StopFile = Join-Path $DataDir ".catalog_stop"

Write-Host "=== Catalog Daemon Status ==="

if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile -Raw
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) { Write-Host "Process: RUNNING (PID $pid)" }
    else { Write-Host "Process: STOPPED (stale pid $pid)" }
} else {
    Write-Host "Process: STOPPED (no pid file)"
}

if (Test-Path $StopFile) { Write-Host "Stop requested: YES" }

if (Test-Path $StateFile) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    Write-Host "Phase: $($state.phase)  discovery_complete: $($state.discovery_complete)"
    Write-Host "discover_offset: $($state.discover_offset)  enriched_session: $($state.songs_enriched_session)"
    Write-Host "last_slug: $($state.last_slug)"
    Write-Host "running: $($state.running)  updated: $($state.updated_at)"
}

Write-Host ""
node cli/status.js
