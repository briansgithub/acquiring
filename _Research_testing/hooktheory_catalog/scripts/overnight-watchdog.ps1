# Local watchdog for overnight-run.js — no AI supervision required.
#
# Restarts the run if the process dies unexpectedly. Completed phases are
# recorded in overnight_run_state.json, so a restart resumes rather than
# redoing work. Stops immediately (no restart) if the run exits cleanly or if
# a .overnight_stop file is present.
#
#   powershell -ExecutionPolicy Bypass -File scripts\overnight-watchdog.ps1 -RunArgs "--with-artist-sweep --publish"

param(
    [string]$RunArgs = "",
    [int]$MaxRestarts = 12,
    [int]$RestartDelaySec = 60
)

$ErrorActionPreference = "Continue"
$catalogRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path (Split-Path -Parent (Split-Path -Parent $catalogRoot)) "sacred_ring_data\catalog"
$stopFile = Join-Path $dataDir ".overnight_stop"
$watchdogLog = Join-Path $dataDir "overnight_watchdog.log"

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "o"), $msg
    Write-Output $line
    Add-Content -Path $watchdogLog -Value $line -Encoding utf8
}

Write-Log "watchdog start; runArgs='$RunArgs' maxRestarts=$MaxRestarts"

$attempt = 0
while ($attempt -le $MaxRestarts) {
    if (Test-Path $stopFile) {
        Write-Log "stop file present - not starting (remove $stopFile to allow runs)"
        break
    }

    $attempt++
    Write-Log "starting overnight-run attempt $attempt"

    $argList = @("cli/overnight-run.js")
    if ($RunArgs -ne "") { $argList += $RunArgs.Split(" ") | Where-Object { $_ -ne "" } }

    $proc = Start-Process -FilePath "node" -ArgumentList $argList -WorkingDirectory $catalogRoot `
        -NoNewWindow -PassThru -Wait
    $code = $proc.ExitCode

    if ($code -eq 0) {
        Write-Log "overnight-run exited cleanly (code 0) - watchdog done"
        break
    }

    if (Test-Path $stopFile) {
        Write-Log "overnight-run exited code $code but stop file present - not restarting"
        break
    }

    if ($attempt -gt $MaxRestarts) {
        Write-Log "overnight-run exited code $code - max restarts reached, giving up"
        break
    }

    Write-Log "overnight-run exited code $code - restarting in ${RestartDelaySec}s (resumes from saved phase state)"
    Start-Sleep -Seconds $RestartDelaySec
}

Write-Log "watchdog finished"
