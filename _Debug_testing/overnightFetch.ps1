# Overnight fetch: wait for current batchFullFetch to finish, then run fetch daemon until queue empty.
# Logs to sacred_ring_data/catalog/overnight_fetch.log

$ErrorActionPreference = "Continue"
$Repo = "H:\Desktop\3_sacred_ring"
$LogDir = Join-Path $Repo "sacred_ring_data\catalog"
$LogFile = Join-Path $LogDir "overnight_fetch.log"
$WaitPid = 35168

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Set-Location $Repo
Log "overnightFetch.ps1 started"

if (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) {
    Log "waiting for batchFullFetch pid=$WaitPid"
    while (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) {
        Start-Sleep -Seconds 30
    }
    Log "batchFullFetch pid=$WaitPid finished"
} else {
    Log "batchFullFetch pid=$WaitPid not running; starting daemon when clear"
}

$deadline = (Get-Date).AddHours(10)
while ((Get-Date) -lt $deadline) {
    $fetchProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'batchFullFetch\.js' }
    if ($fetchProcs) {
        $pids = ($fetchProcs | ForEach-Object { $_.ProcessId }) -join ','
        Log "batchFullFetch still running pids=$pids; sleep 60s"
        Start-Sleep -Seconds 60
        continue
    }
    break
}

Log "launching runFetchDaemon --wave-size 20"
node "_Research_testing\hooktheory_catalog\cli\runFetchDaemon.js" --wave-size 20 2>&1 | ForEach-Object { Log $_ }
Log "runFetchDaemon exited"
Log "overnightFetch.ps1 done"
