<#
    Halt the recovery run cleanly.

    Drops a stop file that the run checks between items, so it finishes the
    artist in flight and saves its progress instead of being killed mid-write.
    Progress is preserved either way; this just avoids re-doing the last chunk.

    Usage:
        .\Stop-Recovery.ps1           # ask it to stop, wait for it to wind down
        .\Stop-Recovery.ps1 -Force    # also kill the processes if it lingers
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_RecoveryCommon.ps1')

Write-Host ""
Write-Host "=== Catalog recovery: state before stopping ===" -ForegroundColor Cyan
Write-RecoveryProgress

$running = Get-RecoveryProcess
if ($running.Count -eq 0) {
    Write-Host ""
    Write-Host "Not running -- nothing to stop." -ForegroundColor Yellow
    return
}

New-Item -ItemType File -Path $script:RecoveryStopFile -Force | Out-Null
Write-Host ""
Write-Host "Stop requested. Waiting for it to finish the artist in flight..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$stopped = $false
while ((Get-Date) -lt $deadline) {
    if ((Get-RecoveryProcess).Count -eq 0) { $stopped = $true; break }
    Start-Sleep -Seconds 3
}

if (-not $stopped -and $Force) {
    Get-RecoveryProcess | ForEach-Object {
        Write-Host "Killing PID $($_.ProcessId)" -ForegroundColor Red
        Stop-Process -Id $_.ProcessId -Force -Confirm:$false
    }
    Start-Sleep -Seconds 2
    $stopped = (Get-RecoveryProcess).Count -eq 0
}

# Always clear the stop file: leaving it behind would make the next start look
# like a silent no-op.
Remove-Item $script:RecoveryStopFile -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($stopped) {
    if ($Force) {
        Write-Host "Forced stop. Progress up to the last checkpoint is saved." -ForegroundColor Yellow
    } else {
        Write-Host "Stopped cleanly." -ForegroundColor Green
    }
} else {
    Write-Host "Still running after ${TimeoutSeconds}s (likely mid-fetch)." -ForegroundColor Yellow
    Write-Host "It will halt at the next item, or re-run with -Force to kill it now."
}

Write-Host ""
Write-Host "=== State at stop ===" -ForegroundColor Cyan
Write-RecoveryProgress -IncludeRemaining
Write-RecoveryLogTail -Lines 5

Write-Host ""
Write-Host "Resume with:  .\Start-Recovery.ps1"
