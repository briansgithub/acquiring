# Run interactively in your own PowerShell window. Never paste passwords in chat.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRepository = 'briansgithub/acquiring'
$expectedSha1 = '2CDF87160C0306AD304F4F97E8A1A4AD6EFC4272'

function Invoke-PrivateProcess {
    param([string]$Executable, [string]$Arguments, [string]$InputValue)
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if ($null -ne $InputValue) { $process.StandardInput.Write($InputValue) }
    $process.StandardInput.Close()
    $process.WaitForExit()
    $out = $stdout.GetAwaiter().GetResult()
    [void]$stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw "Secure operation failed (exit $($process.ExitCode)). Details withheld to protect credentials." }
    return $out
}

function Convert-SecretForChild {
    param([Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$keytool = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { $keytool = (Get-Command keytool.exe).Source }
$github = (Get-Command gh.exe).Source
$environmentState = Invoke-PrivateProcess $github "api repos/$taskRepository/environments/android-beta" $null | ConvertFrom-Json
$branchState = Invoke-PrivateProcess $github "api repos/$taskRepository/environments/android-beta/deployment-branch-policies" $null | ConvertFrom-Json
if (-not $environmentState.deployment_branch_policy.custom_branch_policies -or
    $branchState.branch_policies.Count -ne 1 -or
    $branchState.branch_policies[0].name -cne 'main' -or
    $branchState.branch_policies[0].type -cne 'branch') {
    throw 'GitHub android-beta environment must already be restricted to the main branch only.'
}
Write-Host 'This saves the ORIGINAL upload key to the android-beta GitHub environment only.'
Write-Host 'Passwords are masked, remain in process memory, and are not written to local files.'
$keyPath = (Resolve-Path -LiteralPath (Read-Host 'Original upload keystore full path')).Path
if ($keyPath.Contains('"')) { throw 'Invalid file path' }
$alias = Read-Host 'Upload key alias'
if ($alias.Contains('"') -or $alias.Contains("`n") -or [string]::IsNullOrWhiteSpace($alias)) { throw 'Invalid key alias' }
$storeSecret = Read-Host 'Keystore password' -AsSecureString
$keySecret = Read-Host 'Key password (enter it even if identical)' -AsSecureString
try {
    $env:ACQ_SETUP_STORE_PASSWORD = Convert-SecretForChild $storeSecret
    $env:ACQ_SETUP_KEY_PASSWORD = Convert-SecretForChild $keySecret
    $cert = Invoke-PrivateProcess $keytool "-J-Duser.language=en -list -v -keystore `"$keyPath`" -alias `"$alias`" -storepass:env ACQ_SETUP_STORE_PASSWORD" $null
    if ($cert -notmatch 'SHA1:\s*([0-9A-F:]+)' -or $Matches[1].Replace(':', '') -ne $expectedSha1) {
        throw 'Wrong upload certificate. Nothing was saved. Select the original Play upload keystore.'
    }
    # A discarded in-memory CSR proves the private key password unlocks this alias.
    [void](Invoke-PrivateProcess $keytool "-certreq -keystore `"$keyPath`" -alias `"$alias`" -storepass:env ACQ_SETUP_STORE_PASSWORD -keypass:env ACQ_SETUP_KEY_PASSWORD" $null)
    $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keyPath))
    if ($encoded.Length -gt 48000) { throw 'Keystore too large for a GitHub secret; do not split or upload publicly.' }
    $approved = Read-Host 'Certificate matches. Save these four secrets to briansgithub/acquiring environment android-beta? Type SAVE'
    if ($approved -cne 'SAVE') { throw 'Cancelled; no GitHub secrets changed.' }
    $values = @{
        ANDROID_UPLOAD_KEYSTORE_BASE64 = $encoded
        ANDROID_UPLOAD_STORE_PASSWORD = $env:ACQ_SETUP_STORE_PASSWORD
        ANDROID_UPLOAD_KEY_ALIAS = $alias
        ANDROID_UPLOAD_KEY_PASSWORD = $env:ACQ_SETUP_KEY_PASSWORD
    }
    foreach ($name in $values.Keys) {
        [void](Invoke-PrivateProcess $github "secret set $name --repo $taskRepository --env android-beta" $values[$name])
    }
    Write-Host 'All four environment secrets saved. No release was started.'
} finally {
    Remove-Item Env:ACQ_SETUP_STORE_PASSWORD,Env:ACQ_SETUP_KEY_PASSWORD -ErrorAction SilentlyContinue
    $encoded = $null
    $values = $null
    $cert = $null
    if ($storeSecret) { $storeSecret.Dispose() }
    if ($keySecret) { $keySecret.Dispose() }
}
