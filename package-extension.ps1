$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root 'LazyScript\extension'
$output = Join-Path $root 'LazyScriptEX-Native-GameKit.vsix'
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('LazyScriptEX-VSIX-' + [Guid]::NewGuid().ToString('N'))
$extension = Join-Path $temp 'extension'

try {
    New-Item -ItemType Directory -Path $extension -Force | Out-Null

    Copy-Item (Join-Path $source 'extension.vsixmanifest') (Join-Path $temp 'extension.vsixmanifest')
    Copy-Item (Join-Path $source '[Content_Types].xml') (Join-Path $temp '[Content_Types].xml')

    foreach ($file in @('package.json', 'language-configuration.json', 'extension.js')) {
        Copy-Item (Join-Path $source $file) (Join-Path $extension $file)
    }
    Copy-Item (Join-Path $source 'README.md') (Join-Path $extension 'readme.md')
    Copy-Item (Join-Path $source 'LICENSE') (Join-Path $extension 'LICENSE.txt')

    foreach ($directory in @('api', 'compiler', 'icons', 'snippets', 'syntaxes')) {
        Copy-Item (Join-Path $source $directory) (Join-Path $extension $directory) -Recurse
    }

    $package = Get-Content (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
    [xml]$manifest = Get-Content (Join-Path $source 'extension.vsixmanifest') -Raw
    $ns = New-Object System.Xml.XmlNamespaceManager($manifest.NameTable)
    $ns.AddNamespace('v', 'http://schemas.microsoft.com/developer/vsx-schema/2011')
    $identity = $manifest.SelectSingleNode('//v:Identity', $ns)
    if ($null -eq $identity -or $identity.Version -ne $package.version) {
        throw "VSIX manifest version does not match package.json version $($package.version)."
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $output) { Remove-Item $output -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($temp, $output, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    Write-Host "Created $output"
}
finally {
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
}
