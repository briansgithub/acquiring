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

$DataDir  = 'H:\Desktop\3_sacred_ring\sacred_ring_data\catalog'
$StopFile = Join-Path $DataDir '.overnight_stop'

New-Item -ItemType File -Path $StopFile -Force | Out-Null
Write-Host "Stop requested. Waiting for the run to wind down..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    $running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'overnight-run|run-full-recovery' })
    if ($running.Count -eq 0) {
        Write-Host "Stopped cleanly." -ForegroundColor Green
        Remove-Item $StopFile -Force -ErrorAction SilentlyContinue
        return
    }
    Start-Sleep -Seconds 3
}

if ($Force) {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'overnight-run|run-full-recovery' } |
        ForEach-Object {
            Write-Host "Killing PID $($_.ProcessId)" -ForegroundColor Red
            Stop-Process -Id $_.ProcessId -Force -Confirm:$false
        }
    Write-Host "Forced. Progress up to the last checkpoint is saved." -ForegroundColor Yellow
} else {
    Write-Host "Still running after ${TimeoutSeconds}s (it may be mid-fetch)." -ForegroundColor Yellow
    Write-Host "It will halt at the next item. Re-run with -Force to kill it now."
}

Remove-Item $StopFile -Force -ErrorAction SilentlyContinue
