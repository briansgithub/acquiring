<#
    Shared helpers for the Start/Status/Stop recovery scripts.
    Dot-sourced, not run directly.
#>

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:AcquiringDataRoot = if ($env:ACQUIRING_DATA) {
    [IO.Path]::GetFullPath($env:ACQUIRING_DATA)
} else {
    Join-Path $script:RepoRoot 'acquiring_data'
}
$script:RecoveryDataDir   = Join-Path $script:AcquiringDataRoot 'catalog'
$script:RecoveryLogFile   = Join-Path $script:RecoveryDataDir 'overnight_run.log'
$script:RecoveryStateFile = Join-Path $script:RecoveryDataDir 'overnight_run_state.json'
$script:RecoveryStopFile  = Join-Path $script:RecoveryDataDir '.overnight_stop'
$script:RecoveryTotalArtists = 12144

# The full phase list, in execution order, so we can show what is done and what
# still has to happen rather than just a bare count.
$script:RecoveryPhaseOrder = @(
    'alt-lookup', 'alt-harvest',
    'wayback-ingest', 'wayback-harvest', 'verify-1', 'export-1', 'publish-1',
    'unknown-artists', 'artist-detect', 'artist-sweep', 'artist-harvest',
    'verify-2', 'export-2', 'publish-2',
    'meili-refresh', 'meili-harvest', 'verify-final', 'export-final', 'publish-final'
)

function Get-RecoveryProcess {
    @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'overnight-run|run-full-recovery' })
}

function Get-RecoveryState {
    if (-not (Test-Path $script:RecoveryStateFile)) { return $null }
    try {
        return Get-Content $script:RecoveryStateFile -Raw | ConvertFrom-Json
    } catch {
        # A crash mid-write can leave truncated JSON; the run rebuilds it.
        return $null
    }
}

function Write-RecoveryProgress {
    param(
        [switch]$IncludeRemaining
    )

    $state = Get-RecoveryState
    if (-not $state) {
        Write-Host "  (no run state yet)" -ForegroundColor DarkGray
        return
    }

    $sweep = $state.phases.'artist-sweep'
    if ($sweep -and $null -ne $sweep.progressIndex) {
        $idx = [int]$sweep.progressIndex
        $pct = [math]::Round(($idx / $script:RecoveryTotalArtists) * 100, 1)
        $barWidth = 30
        $filled = [int][math]::Round(($idx / $script:RecoveryTotalArtists) * $barWidth)
        $bar = ('#' * $filled) + ('-' * ($barWidth - $filled))
        $colour = 'Gray'
        if ($sweep.status -eq 'done') { $colour = 'Green' }
        elseif ($sweep.status -eq 'interrupted' -or $sweep.status -eq 'error') { $colour = 'Yellow' }
        Write-Host "  Artist sweep [$bar] $pct%  ($($sweep.status))" -ForegroundColor $colour
        Write-Host "               $idx of $script:RecoveryTotalArtists artists, $($sweep.found) new songs found"
    }

    $doneNames = @($state.phases.PSObject.Properties |
        Where-Object { $_.Value.status -eq 'done' } | ForEach-Object { $_.Name })
    Write-Host "  Phases done: $($doneNames.Count) of $($script:RecoveryPhaseOrder.Count)"

    # An interrupted phase is NOT done and will be re-entered; call it out so a
    # partial sweep is never mistaken for a finished one.
    $stalled = @($state.phases.PSObject.Properties |
        Where-Object { $_.Value.status -eq 'interrupted' -or $_.Value.status -eq 'error' } |
        ForEach-Object { "$($_.Name)=$($_.Value.status)" })
    if ($stalled.Count -gt 0) {
        Write-Host "  Will be retried: $($stalled -join ', ')" -ForegroundColor Yellow
    }

    if ($IncludeRemaining) {
        $remaining = @($script:RecoveryPhaseOrder | Where-Object { $doneNames -notcontains $_ })
        if ($remaining.Count -gt 0) {
            Write-Host "  Still to run: $($remaining -join ' -> ')" -ForegroundColor DarkGray
        }
    }
}

function Write-RecoveryLogTail {
    param([int]$Lines = 6)
    if (-not (Test-Path $script:RecoveryLogFile)) { return }
    Write-Host ""
    Write-Host "--- last $Lines log lines ---" -ForegroundColor Cyan
    Get-Content $script:RecoveryLogFile -Tail $Lines
}
