<#
    Find and add any songs on hooktheory.com that we don't already have.

    Safe to run on demand, as often as you like: songs we already hold playable
    and links already confirmed dead are skipped before any request is made, and
    the Internet Archive index is only re-pulled once it goes stale.

    Updates the database only, unless -Publish is given.

      .\Sync-Catalog.ps1                 # update the catalog
      .\Sync-Catalog.ps1 -Publish        # ...and ship the Android asset
      .\Sync-Catalog.ps1 -DryRun         # report only, zero requests
      .\Sync-Catalog.ps1 -WithArtistSweep    # add the slow, low-yield channel
      .\Sync-Catalog.ps1 -CdxMaxAgeDays 7    # re-pull the archive index sooner
#>
[CmdletBinding()]
param(
    [switch]$Publish,
    [switch]$DryRun,
    [switch]$WithArtistSweep,
    [int]$CdxMaxAgeDays = 30,
    [switch]$Resume
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

Write-Host ""
Write-Host "Syncing catalog: node $($syncArgs -join ' ')" -ForegroundColor Cyan
if (-not $Publish -and -not $DryRun) {
    Write-Host "(database only - re-run with -Publish to ship the Android asset)" -ForegroundColor DarkGray
}
Write-Host ""

Push-Location $catalogRoot
try {
    & node @syncArgs
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

Write-Host ""
if ($code -eq 0) {
    Write-Host "Sync complete." -ForegroundColor Green
} else {
    Write-Host "Sync exited with code $code - see sacred_ring_data\catalog\overnight_run.log" -ForegroundColor Red
}
exit $code
