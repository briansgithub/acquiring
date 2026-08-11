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
. (Join-Path $PSScriptRoot '_RecoveryCommon.ps1')

$CatalogDir = Join-Path $PSScriptRoot '_Research_testing\hooktheory_catalog'

if (-not (Test-Path $CatalogDir)) {
    throw "Catalog directory not found: $CatalogDir"
}

Write-Host ""
Write-Host "=== Catalog recovery: current state ===" -ForegroundColor Cyan
Write-RecoveryProgress -IncludeRemaining

# Refuse to start a second copy: two sweeps sharing one SQLite catalog and one
# phase ledger would corrupt each other's progress counters.
$running = Get-RecoveryProcess
if ($running.Count -gt 0) {
    Write-Host ""
    Write-Host "Already running (PID $(($running | ForEach-Object { $_.ProcessId }) -join ', ')). Nothing to do." -ForegroundColor Yellow
    Write-Host "To stop it:  .\Stop-Recovery.ps1"
    return
}

# A stop file left over from a previous clean halt would make overnight-run
# refuse to start, which looks like a silent no-op.
if (Test-Path $script:RecoveryStopFile) {
    Write-Host ""
    Write-Host "Clearing previous stop file." -ForegroundColor Yellow
    Remove-Item $script:RecoveryStopFile -Force
}

if ($Foreground) {
    Write-Host ""
    Write-Host "Running in this window. Ctrl+C stops it." -ForegroundColor Cyan
    Write-Host ""
    Set-Location $CatalogDir
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

Write-Host ""
Write-Host "Started detached (PID $($proc.Id))." -ForegroundColor Green

# Give the run a moment to load its ledger, then confirm it actually picked up
# where it left off -- a silent no-op here is the failure mode worth catching.
Start-Sleep -Seconds 6
$confirm = Get-RecoveryProcess
if ($confirm.Count -eq 0) {
    Write-Host "WARNING: process exited immediately. Check the log:" -ForegroundColor Red
    Write-Host "  $script:RecoveryLogFile"
    Write-RecoveryLogTail -Lines 10
    return
}

Write-Host "Confirmed alive. Resumed from:" -ForegroundColor Green
Write-RecoveryProgress
Write-RecoveryLogTail -Lines 4

Write-Host ""
Write-Host "Check progress:  .\Status-Recovery.ps1"
Write-Host "Stop cleanly:    .\Stop-Recovery.ps1"
Write-Host "Log file:        $script:RecoveryLogFile"
