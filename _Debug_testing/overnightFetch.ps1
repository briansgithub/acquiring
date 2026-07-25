# Deprecated — use overnightSupervisor.ps1 instead.
#   powershell -File _Debug_testing/overnightSupervisor.ps1 start
Write-Host "overnightFetch.ps1 is deprecated. Use: powershell -File _Debug_testing/overnightSupervisor.ps1 start"
& "$PSScriptRoot/overnightSupervisor.ps1" start @args
