<#
    Resume the Hooktheory catalog recovery run.

    Safe to run repeatedly: it resumes the phase ledger rather than restarting,
    so a crash/reboot costs only the artists in flight at the time.

    Usage:
        .\Start-Recovery.ps1              # run detached, survives closing this window
        .\Start-Recovery.ps1 -Foreground  # run in this window, live output, Ctrl+C stops
#>
[CmdletBinding()]
param(
    [switch]$Foreground
)

$ErrorActionPreference = 'Stop'

$CatalogDir = Join-Path $PSScriptRoot '_Research_testing\hooktheory_catalog'
$DataDir    = 'H:\Desktop\3_sacred_ring\sacred_ring_data\catalog'
$StopFile   = Join-Path $DataDir '.overnight_stop'

if (-not (Test-Path $CatalogDir)) {
    throw "Catalog directory not found: $CatalogDir"
}

# Refuse to start a second copy: two sweeps sharing one SQLite catalog and one
# phase ledger would corrupt each other's progress counters.
$running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'overnight-run|run-full-recovery' })
if ($running.Count -gt 0) {
    Write-Host "Already running (PID $($running[0].ProcessId)). Nothing to do." -ForegroundColor Yellow
    Write-Host "To stop it:  .\Stop-Recovery.ps1"
    return
}

# A stop file left over from a previous clean halt would make overnight-run
# refuse to start, which looks like a silent no-op.
if (Test-Path $StopFile) {
    Write-Host "Clearing previous stop file." -ForegroundColor Yellow
    Remove-Item $StopFile -Force
}

Set-Location $CatalogDir

if ($Foreground) {
    Write-Host "Running in this window. Ctrl+C stops it." -ForegroundColor Cyan
    & node scripts/run-full-recovery.js --resume
    return
}

# -WindowStyle Hidden detaches from this console, so closing the terminal (or
# logging out of the shell) does not take the run with it.
$proc = Start-Process -FilePath 'node' `
    -ArgumentList 'scripts/run-full-recovery.js', '--resume' `
    -WorkingDirectory $CatalogDir `
    -WindowStyle Hidden `
    -PassThru

Write-Host "Started detached (PID $($proc.Id))." -ForegroundColor Green
Write-Host ""
Write-Host "Check progress:  .\Status-Recovery.ps1"
Write-Host "Stop cleanly:    .\Stop-Recovery.ps1"
Write-Host "Log file:        $DataDir\overnight_run.log"
