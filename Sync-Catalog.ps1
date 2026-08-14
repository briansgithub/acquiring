<#
    Find and add any songs on hooktheory.com that we don't already have.

    Safe to run on demand, as often as you like: songs we already hold playable
    and links already confirmed dead are skipped before any request is made, and
    the Internet Archive index is only re-pulled once it goes stale.

    Updates the database only, unless -Publish is given.

      .\Sync-Catalog.ps1                 # update the catalog
      .\Sync-Catalog.ps1 -Publish        # ...and ship the Android asset
      .\Sync-Catalog.ps1 -DryRun         # report only, zero requests
      .\Sync-Catalog.ps1 -ConfirmHooktheoryAuthorization # authorized live run
      .\Sync-Catalog.ps1 -WithArtistSweep    # add the slow, low-yield channel
      .\Sync-Catalog.ps1 -CdxMaxAgeDays 7    # re-pull the archive index sooner
#>
[CmdletBinding()]
param(
    [switch]$Publish,
    [switch]$DryRun,
    [switch]$WithArtistSweep,
    [int]$CdxMaxAgeDays = 30,
    [switch]$Resume,
    [switch]$ConfirmHooktheoryAuthorization
)

$ErrorActionPreference = 'Stop'

$catalogRoot = Join-Path $PSScriptRoot '_Research_testing\hooktheory_catalog'
if (-not (Test-Path $catalogRoot)) {
    throw "Catalog module not found at $catalogRoot"
}

$syncArgs = @('cli/sync-catalog.js', '--cdx-max-age-days', "$CdxMaxAgeDays")
if ($Publish)         { $syncArgs += '--publish' }
if ($DryRun)          { $syncArgs += '--dry-run' }
if ($WithArtistSweep) { $syncArgs += '--with-artist-sweep' }
if ($Resume)          { $syncArgs += '--resume' }

if (-not $DryRun -and -not $ConfirmHooktheoryAuthorization) {
    throw @"
Remote catalog discovery is disabled unless Hooktheory has expressly authorized
this project's catalog access. After obtaining written data-license or API
authorization, re-run with -ConfirmHooktheoryAuthorization.

You can inspect the local plan safely with: .\Sync-Catalog.ps1 -DryRun
"@
}

Write-Host ""
Write-Host "Syncing catalog: node $($syncArgs -join ' ')" -ForegroundColor Cyan
if (-not $Publish -and -not $DryRun) {
    Write-Host "(database only - re-run with -Publish to ship the Android asset)" -ForegroundColor DarkGray
}
Write-Host ""

Push-Location $catalogRoot
try {
    $previousAuthorization = $env:HOOKTHEORY_CATALOG_AUTHORIZED
    if ($ConfirmHooktheoryAuthorization) {
        $env:HOOKTHEORY_CATALOG_AUTHORIZED = '1'
    }
    & node @syncArgs
    $code = $LASTEXITCODE
} finally {
    if ($null -eq $previousAuthorization) {
        Remove-Item Env:\HOOKTHEORY_CATALOG_AUTHORIZED -ErrorAction SilentlyContinue
    } else {
        $env:HOOKTHEORY_CATALOG_AUTHORIZED = $previousAuthorization
    }
    Pop-Location
}

Write-Host ""
if ($code -eq 0) {
    Write-Host "Sync complete." -ForegroundColor Green
} else {
    Write-Host "Sync exited with code $code - see sacred_ring_data\catalog\overnight_run.log" -ForegroundColor Red
}
exit $code
