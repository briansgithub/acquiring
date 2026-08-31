# Start Hooktheory catalog daemon in background
$ErrorActionPreference = "Stop"
$CatalogRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $CatalogRoot) -eq 'scripts') {
  $CatalogRoot = Split-Path -Parent $CatalogRoot
}
Set-Location $CatalogRoot

$DataDir = Join-Path $CatalogRoot "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }

$StopFile = Join-Path $DataDir ".catalog_stop"
$PidFile = Join-Path $DataDir "daemon.pid"
$LogOut = Join-Path $DataDir "daemon.log"
$LogErr = Join-Path $DataDir "daemon.err"

if (Test-Path $StopFile) { Remove-Item $StopFile -Force }

if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -Raw
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Daemon already running (PID $oldPid)"
        exit 1
    }
}

$phase = "auto"
if ($args -contains "--discover-only") { $phase = "discover" }
if ($args -contains "--enrich-only") { $phase = "enrich" }

$nodeArgs = @("cli/catalogDaemon.js", "--phase", $phase)
if ($env:CATALOG_INTERVAL_MS) { $nodeArgs += @("--interval-ms", $env:CATALOG_INTERVAL_MS) }

$p = Start-Process -FilePath "node" -ArgumentList $nodeArgs -WorkingDirectory $CatalogRoot `
    -WindowStyle Hidden -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr -PassThru

Set-Content -Path $PidFile -Value $p.Id -NoNewline
Write-Host "Catalog daemon started PID $($p.Id) phase=$phase"
Write-Host "Log: $LogOut"
