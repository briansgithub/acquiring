<#
    Register (or remove) a Windows Scheduled Task that keeps the song catalog
    current by running Sync-Catalog.ps1 once a day.

    Chosen over a resident daemon deliberately: a long-lived background process
    is something that can die silently, whereas Task Scheduler survives reboots
    and reports its own run history.

    Daily is the right cadence because a sync costs ~210 requests (~0.16% of
    Hooktheory's documented daily budget), so frequency is effectively free and
    the only thing being traded is how long a newly-published song sits
    unharvested before it could be deleted upstream. Daily caps that at 24h.
    Once a song is harvested the risk is gone for good - the chord data is local.

    Runs WITHOUT -Publish: the database is kept current automatically, and
    shipping the ~62MB Android release asset stays a deliberate manual step
    (.\tooling\commands\Sync-Catalog.ps1 -Publish).

      .\tooling\commands\Register-SyncTask.ps1 -ConfirmHooktheoryAuthorization
      .\tooling\commands\Register-SyncTask.ps1 -At 02:30 -ConfirmHooktheoryAuthorization
      .\tooling\commands\Register-SyncTask.ps1 -Unregister     # remove it
      Get-ScheduledTask SacredRingCatalogSync # confirm it exists
      Start-ScheduledTask SacredRingCatalogSync   # run it now
#>
[CmdletBinding()]
param(
    [string]$At = '04:00',
    [switch]$Unregister,
    [switch]$ConfirmHooktheoryAuthorization
)

$ErrorActionPreference = 'Stop'

$TaskName = 'SacredRingCatalogSync'

if ($Unregister) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Task '$TaskName' is not registered - nothing to do." -ForegroundColor Yellow
        exit 0
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    exit 0
}

if (-not $ConfirmHooktheoryAuthorization) {
    throw @"
The scheduled catalog sync makes recurring access to Hooktheory's catalog.
Register it only after Hooktheory has expressly authorized this project's use,
then re-run with -ConfirmHooktheoryAuthorization.
"@
}

$syncScript = Join-Path $PSScriptRoot 'Sync-Catalog.ps1'
if (-not (Test-Path $syncScript)) {
    throw "Sync-Catalog.ps1 not found at $syncScript"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dataRoot = if ($env:ACQUIRING_DATA) {
    [IO.Path]::GetFullPath($env:ACQUIRING_DATA)
} else {
    Join-Path $repoRoot 'acquiring_data'
}
$logDir = Join-Path $dataRoot 'catalog'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'sync-task.log'

# Both streams into one appended log; without a log a scheduled failure is
# invisible until someone thinks to look.
#
# Out-File -Encoding utf8 rather than Tee-Object: on Windows PowerShell 5.1
# Tee-Object has no -Encoding and writes UTF-16LE, which renders as spaced-out
# nonsense in git bash / grep / tail - exactly the tools reached for when a
# scheduled run has failed and the log is the only evidence.
$inner = "& '$syncScript' -ConfirmHooktheoryAuthorization *>&1 | Out-File -FilePath '$logFile' -Append -Encoding utf8"
$psArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ""$inner"""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $At

# StartWhenAvailable matters on a desktop: without it a run missed because the
# machine was asleep or off is simply skipped, and the catalog silently drifts.
# DontStopIfGoingOnBatteries likewise - the default is to kill the run.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
    -MultipleInstances IgnoreNew

$description = 'Finds and adds any songs on hooktheory.com not already in the local catalog. Database only; does not publish.'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Replacing existing task '$TaskName'..." -ForegroundColor DarkGray
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description $description | Out-Null

Write-Host ""
Write-Host "Registered '$TaskName' - runs daily at $At (database only, no publish)." -ForegroundColor Green
Write-Host "  log:      $logFile"
Write-Host "  run now:  Start-ScheduledTask $TaskName"
Write-Host "  check:    node tooling\_Research_testing\hooktheory_catalog\cli\coverage.js"
Write-Host "  remove:   .\tooling\commands\Register-SyncTask.ps1 -Unregister"
Write-Host ""
