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
    [int]$MaxRestarts = 25,
    [int]$MaxFutileRestarts = 2,
    [int]$RestartDelaySec = 60
)

$ErrorActionPreference = "Continue"
$catalogRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path (Split-Path -Parent (Split-Path -Parent $catalogRoot)) "sacred_ring_data\catalog"
$stopFile = Join-Path $dataDir ".overnight_stop"
$watchdogLog = Join-Path $dataDir "overnight_watchdog.log"

$stateFile = Join-Path $dataDir "overnight_run_state.json"

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "o"), $msg
    Write-Output $line
    Add-Content -Path $watchdogLog -Value $line -Encoding utf8
}

# A restart is only worth making if the last attempt actually advanced the work.
# A plain restart counter cannot tell a transient crash from a deterministic
# crash loop -- and a loop re-sends the same requests to hooktheory.com every
# cycle. This token (phases completed + artist-sweep index) is compared across
# attempts: unchanged twice in a row means we are looping, so stop.
function Get-ProgressToken {
    if (-not (Test-Path $stateFile)) { return "no-state" }
    try {
        $st = Get-Content $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json
        $done = 0
        foreach ($p in $st.phases.PSObject.Properties) {
            if ($p.Value.status -eq 'done') { $done++ }
        }
        $idx = 0
        $sweep = $st.phases.PSObject.Properties | Where-Object { $_.Name -eq 'artist-sweep' }
        if ($sweep -and $sweep.Value.progressIndex) { $idx = [int]$sweep.Value.progressIndex }
        return "$done-$idx"
    } catch {
        return "unreadable"
    }
}

Write-Log "watchdog start; runArgs='$RunArgs' maxRestarts=$MaxRestarts maxFutileRestarts=$MaxFutileRestarts"

$attempt = 0
$futile = 0
while ($attempt -le $MaxRestarts) {
    if (Test-Path $stopFile) {
        Write-Log "stop file present - not starting (remove $stopFile to allow runs)"
        break
    }

    $attempt++
    $tokenBefore = Get-ProgressToken
    Write-Log "starting overnight-run attempt $attempt (progress token: $tokenBefore)"

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

    $tokenAfter = Get-ProgressToken
    if ($tokenAfter -eq $tokenBefore) {
        $futile++
        Write-Log "overnight-run exited code $code with NO progress (token still $tokenAfter) - futile restart $futile/$MaxFutileRestarts"
        if ($futile -ge $MaxFutileRestarts) {
            Write-Log "crash loop detected: $futile consecutive attempts made no progress - giving up rather than re-sending the same requests"
            break
        }
    } else {
        if ($futile -gt 0) { Write-Log "progress resumed ($tokenBefore -> $tokenAfter) - clearing futile counter" }
        $futile = 0
    }

    if ($attempt -gt $MaxRestarts) {
        Write-Log "overnight-run exited code $code - max restarts reached, giving up"
        break
    }

    Write-Log "overnight-run exited code $code - restarting in ${RestartDelaySec}s (resumes from saved phase state)"
    Start-Sleep -Seconds $RestartDelaySec
}

Write-Log "watchdog finished"
