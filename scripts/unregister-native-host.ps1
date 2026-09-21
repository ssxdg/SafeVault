[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string] $ManifestDirectory = (Join-Path $env:LOCALAPPDATA 'SafeVault\NativeMessagingHosts')
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.safevault.bridge'
$registryPaths = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)
$manifestPaths = @(
  (Join-Path $ManifestDirectory 'chrome.json'),
  (Join-Path $ManifestDirectory 'edge.json')
)

foreach ($registryPath in $registryPaths) {
  if ((Test-Path -LiteralPath $registryPath) -and $PSCmdlet.ShouldProcess($registryPath, 'Remove SafeVault Native Messaging registry key')) {
    Remove-Item -LiteralPath $registryPath -Force
  }
}
foreach ($manifestPath in $manifestPaths) {
  if ((Test-Path -LiteralPath $manifestPath) -and $PSCmdlet.ShouldProcess($manifestPath, 'Remove SafeVault Native Messaging manifest')) {
    Remove-Item -LiteralPath $manifestPath -Force
  }
}

Write-Output 'SafeVault Native Messaging Host registration removed; vault data was not modified.'
