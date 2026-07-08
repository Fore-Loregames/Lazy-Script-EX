$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runtime = Join-Path $Root 'LazyScript\runtime'
$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ('lsx-native-gamekit-' + [guid]::NewGuid().ToString('N'))
$GlfwZip = Join-Path $Temp 'glfw.zip'
$OpenAlZip = Join-Path $Temp 'openal.zip'
$GlfwUrl = 'https://github.com/glfw/glfw/releases/download/3.4/glfw-3.4.bin.WIN64.zip'
$OpenAlUrl = 'https://openal-soft.org/openal-binaries/openal-soft-1.25.2-bin.zip'

function Assert-X64PE([string] $Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 0x40 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
        throw "$Path is not a PE file."
    }
    $pe = [BitConverter]::ToInt32($bytes, 0x3C)
    $machine = [BitConverter]::ToUInt16($bytes, $pe + 4)
    if ($machine -ne 0x8664) { throw "$Path is not an x64 DLL." }
}

try {
    New-Item -ItemType Directory -Force -Path $Runtime, $Temp | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Write-Host 'Downloading official GLFW 3.4 Windows x64 binaries...'
    Invoke-WebRequest -UseBasicParsing -Uri $GlfwUrl -OutFile $GlfwZip
    Write-Host 'Downloading official OpenAL Soft 1.25.2 binaries...'
    Invoke-WebRequest -UseBasicParsing -Uri $OpenAlUrl -OutFile $OpenAlZip

    Expand-Archive -Path $GlfwZip -DestinationPath (Join-Path $Temp 'glfw') -Force
    Expand-Archive -Path $OpenAlZip -DestinationPath (Join-Path $Temp 'openal') -Force

    $glfw = Get-ChildItem (Join-Path $Temp 'glfw') -Recurse -Filter glfw3.dll |
        Sort-Object @{ Expression = { if ($_.FullName -match 'lib-vc2022') { 0 } elseif ($_.FullName -match 'lib-vc') { 1 } else { 2 } } }, FullName |
        Select-Object -First 1
    if (-not $glfw) { throw 'glfw3.dll was not found in the official archive.' }

    # The archive also contains router\Win64\OpenAL32.dll. That router is
    # intended for a system-wide OpenAL installation and can load successfully
    # while alcOpenDevice(NULL) still returns null when no driver is registered.
    # For app-local use we need the actual OpenAL Soft implementation.
    $openal = Get-ChildItem (Join-Path $Temp 'openal') -Recurse -File -Filter soft_oal.dll |
        Where-Object { $_.FullName -match '(?i)[\\/]bin[\\/]Win64[\\/]' } |
        Select-Object -First 1
    if (-not $openal) { throw 'bin\Win64\soft_oal.dll was not found in the official OpenAL Soft archive.' }

    Copy-Item $glfw.FullName (Join-Path $Runtime 'glfw3.dll') -Force
    # OpenAL keeps the historical OpenAL32.dll filename for both 32-bit and
    # 64-bit applications. Rename the Win64 implementation for app-local use.
    Copy-Item $openal.FullName (Join-Path $Runtime 'OpenAL32.dll') -Force
    Assert-X64PE (Join-Path $Runtime 'glfw3.dll')
    Assert-X64PE (Join-Path $Runtime 'OpenAL32.dll')

    $openalLicense = Get-ChildItem (Join-Path $Temp 'openal') -Recurse -File |
        Where-Object { $_.Name -match '^(COPYING|LICENSE)(\..*)?$' } |
        Select-Object -First 1
    if ($openalLicense) { Copy-Item $openalLicense.FullName (Join-Path $Runtime 'OPENAL-SOFT-LICENSE.txt') -Force }

    Write-Host ''
    Write-Host 'Runtime ready:'
    Write-Host ('  ' + (Join-Path $Runtime 'glfw3.dll'))
    Write-Host ('  ' + (Join-Path $Runtime 'OpenAL32.dll') + '  (Win64 soft_oal.dll implementation)')
    Write-Host 'Run build-all.bat or an example build.bat next.'
}
finally {
    if (Test-Path $Temp) { Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue }
}
