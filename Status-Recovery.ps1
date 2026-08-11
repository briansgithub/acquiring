<#
    Show recovery-run progress: whether it is alive, how far the artist sweep
    has got, which phases remain, and the tail of the log.
#>
[CmdletBinding()]
param(
    [int]$Lines = 12
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_RecoveryCommon.ps1')

$running = Get-RecoveryProcess

Write-Host ""
if ($running.Count -gt 0) {
    Write-Host "STATUS: running (PID $(($running | ForEach-Object { $_.ProcessId }) -join ', '))" -ForegroundColor Green
} else {
    Write-Host "STATUS: not running" -ForegroundColor Red
}

Write-Host ""
Write-RecoveryProgress -IncludeRemaining
Write-RecoveryLogTail -Lines $Lines

if ($running.Count -eq 0) {
    Write-Host ""
    Write-Host "Resume with:  .\Start-Recovery.ps1" -ForegroundColor Yellow
}
