[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)] [string] $BridgePath,
  [Parameter(Mandatory = $true)] [string] $InstallDirectory,
  [Parameter(Mandatory = $true)] [string] $ChromeExtensionId,
  [Parameter(Mandatory = $true)] [string] $EdgeExtensionId,
  [string] $ManifestDirectory = (Join-Path $env:LOCALAPPDATA 'SafeVault\NativeMessagingHosts')
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.safevault.bridge'
$extensionIdPattern = '^[a-p]{32}$'
$resolvedBridgePath = [IO.Path]::GetFullPath($BridgePath)
$resolvedInstallDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
$installPrefix = "$resolvedInstallDirectory\"

if (-not [IO.Path]::IsPathRooted($resolvedBridgePath) -or [IO.Path]::GetExtension($resolvedBridgePath) -ne '.exe') {
  throw 'BridgePath must be an absolute .exe path.'
}
if (-not $resolvedBridgePath.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'BridgePath must be inside InstallDirectory.'
}
if (-not (Test-Path -LiteralPath $resolvedBridgePath -PathType Leaf)) {
  throw 'Bridge executable does not exist.'
}
if ($ChromeExtensionId -notmatch $extensionIdPattern -or $EdgeExtensionId -notmatch $extensionIdPattern) {
  throw 'Extension IDs must contain exactly 32 a-p characters without wildcards.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$targets = @(
  @{
    Browser = 'Chrome'
    ExtensionId = $ChromeExtensionId
    Template = Join-Path $projectRoot 'native-bridge\manifests\chrome.template.json'
    Manifest = Join-Path $ManifestDirectory 'chrome.json'
    Registry = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  },
  @{
    Browser = 'Edge'
    ExtensionId = $EdgeExtensionId
    Template = Join-Path $projectRoot 'native-bridge\manifests\edge.template.json'
    Manifest = Join-Path $ManifestDirectory 'edge.json'
    Registry = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
  }
)

$createdRegistryKeys = [Collections.Generic.List[string]]::new()
$createdManifestFiles = [Collections.Generic.List[string]]::new()
$manifestBackups = @{}

try {
  if ($PSCmdlet.ShouldProcess($ManifestDirectory, 'Create Native Messaging manifest directory')) {
    New-Item -ItemType Directory -Path $ManifestDirectory -Force | Out-Null
  }

  foreach ($target in $targets) {
    $template = Get-Content -Raw -Encoding UTF8 -LiteralPath $target.Template
    $manifestJson = $template.Replace('__BRIDGE_PATH__', $resolvedBridgePath.Replace('\', '\\')).Replace('__EXTENSION_ID__', $target.ExtensionId)
    $manifest = $manifestJson | ConvertFrom-Json
    if ($manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -match '\*') {
      throw "$($target.Browser) manifest allowed_origins is invalid."
    }

    if (Test-Path -LiteralPath $target.Manifest) {
      $manifestBackups[$target.Manifest] = Get-Content -Raw -Encoding UTF8 -LiteralPath $target.Manifest
    } else {
      $createdManifestFiles.Add($target.Manifest)
    }
    if ($PSCmdlet.ShouldProcess($target.Manifest, 'Write Native Messaging manifest')) {
      [IO.File]::WriteAllText($target.Manifest, $manifestJson, [Text.UTF8Encoding]::new($false))
    }

    $registryExisted = Test-Path -LiteralPath $target.Registry
    if (-not $registryExisted) { $createdRegistryKeys.Add($target.Registry) }
    if ($PSCmdlet.ShouldProcess($target.Registry, 'Register current-user Native Messaging Host')) {
      New-Item -Path $target.Registry -Force | Out-Null
      Set-Item -LiteralPath $target.Registry -Value $target.Manifest
    }
  }
} catch {
  foreach ($registryPath in $createdRegistryKeys) {
    if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath -Force }
  }
  foreach ($manifestPath in $createdManifestFiles) {
    if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
  }
  foreach ($entry in $manifestBackups.GetEnumerator()) {
    [IO.File]::WriteAllText($entry.Key, $entry.Value, [Text.UTF8Encoding]::new($false))
  }
  throw
}

Write-Output 'SafeVault Native Messaging Host registered for the current user.'
