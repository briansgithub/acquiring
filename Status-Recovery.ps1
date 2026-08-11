<#
    Show recovery-run progress: whether it is alive, how far the artist sweep
    has got, and the tail of the log.
#>
[CmdletBinding()]
param(
    [int]$Lines = 12
)

$ErrorActionPreference = 'Stop'

$CatalogDir = Join-Path $PSScriptRoot '_Research_testing\hooktheory_catalog'
$DataDir    = 'H:\Desktop\3_sacred_ring\sacred_ring_data\catalog'
$LogFile    = Join-Path $DataDir 'overnight_run.log'
$StateFile  = Join-Path $DataDir 'overnight_run_state.json'

$running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'overnight-run|run-full-recovery' })

if ($running.Count -gt 0) {
    Write-Host "STATUS: running (PID $(($running | ForEach-Object { $_.ProcessId }) -join ', '))" -ForegroundColor Green
} else {
    Write-Host "STATUS: not running" -ForegroundColor Red
}

if (Test-Path $StateFile) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    $sweep = $state.phases.'artist-sweep'
    if ($sweep) {
        $idx = [int]$sweep.progressIndex
        $pct = [math]::Round(($idx / 12144) * 100, 1)
        Write-Host ""
        Write-Host "Artist sweep: $idx / 12144  ($pct%)  status=$($sweep.status)  newSongsFound=$($sweep.found)"
    }
    $done = @($state.phases.PSObject.Properties | Where-Object { $_.Value.status -eq 'done' }).Count
    Write-Host "Phases complete: $done / 18"
}

if (Test-Path $LogFile) {
    Write-Host ""
    Write-Host "--- last $Lines log lines ---" -ForegroundColor Cyan
    Get-Content $LogFile -Tail $Lines
}
