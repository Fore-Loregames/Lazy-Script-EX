param(
    [int]$Runs = 5,
    [switch]$SkipBuild,
    [switch]$NativeC
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Toolkit = Resolve-Path (Join-Path $Root "..\..")
$Compiler = Join-Path $Toolkit "LazyScript\compiler\lazyscriptex.js"
$Out = Join-Path $Root "build"
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$Benchmarks = @(
    @{ Name = "scalar_int"; Cpu = "baseline" },
    @{ Name = "scalar_f32"; Cpu = "baseline" },
    @{ Name = "typed_table"; Cpu = "baseline" },
    @{ Name = "vector_fma"; Cpu = "avx2-fma" },
    @{ Name = "retained_objects"; Cpu = "baseline" }
)

function Find-CCompiler {
    $clang = Get-Command clang.exe -ErrorAction SilentlyContinue
    if ($clang) { return @{ Kind = "clang"; Path = $clang.Source } }
    $clangCl = Get-Command clang-cl.exe -ErrorAction SilentlyContinue
    if ($clangCl) { return @{ Kind = "clang-cl"; Path = $clangCl.Source } }
    throw "clang.exe or clang-cl.exe is required for the C reference builds."
}

function Get-CArchitectureArgs([string]$Kind, [string]$Cpu, [bool]$UseNative) {
    if ($Kind -eq "clang") {
        if ($UseNative) { return @("-march=native") }
        if ($Cpu -eq "avx2-fma") { return @("-march=x86-64", "-mavx2", "-mfma") }
        return @("-march=x86-64", "-mno-avx", "-mno-avx2", "-mno-fma")
    }
    if ($UseNative) { return @("/clang:-march=native") }
    if ($Cpu -eq "avx2-fma") { return @("/clang:-march=x86-64", "/clang:-mavx2", "/clang:-mfma") }
    return @("/clang:-march=x86-64", "/clang:-mno-avx", "/clang:-mno-avx2", "/clang:-mno-fma")
}

function Build-CReference($CompilerInfo, [string]$Name, [string]$Cpu, [bool]$UseNative) {
    $Source = Join-Path $Root "c\$Name.c"
    $Target = Join-Path $Out "${Name}_c.exe"
    $ArchitectureArgs = Get-CArchitectureArgs $CompilerInfo.Kind $Cpu $UseNative
    if ($CompilerInfo.Kind -eq "clang") {
        $Args = @("-O3", "-DNDEBUG") + $ArchitectureArgs + @($Source, "-o", $Target)
    } else {
        $Args = @("/O2", "/DNDEBUG") + $ArchitectureArgs + @($Source, "/Fe:$Target")
    }
    & $CompilerInfo.Path @Args
    if ($LASTEXITCODE -ne 0) { throw "C build failed for $Name" }
}

function Measure-Executable([string]$Path, [int]$Count) {
    # One warm-up keeps process startup and page faults from dominating the median.
    # Every executable also validates its final checksum before a timing is accepted.
    $warm = Start-Process -FilePath $Path -Wait -PassThru -NoNewWindow
    if ($warm.ExitCode -ne 0) { throw "$Path failed its correctness check with exit code $($warm.ExitCode)" }
    $samples = @()
    for ($i = 0; $i -lt $Count; $i++) {
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $Path -Wait -PassThru -NoNewWindow
        $watch.Stop()
        if ($process.ExitCode -ne 0) { throw "$Path failed its correctness check with exit code $($process.ExitCode)" }
        $samples += $watch.Elapsed.TotalMilliseconds
    }
    $sorted = $samples | Sort-Object
    return [double]$sorted[[int][Math]::Floor($sorted.Count / 2)]
}

if (-not $SkipBuild) {
    $CCompiler = Find-CCompiler
    foreach ($Benchmark in $Benchmarks) {
        $Name = $Benchmark.Name
        Write-Host "Building LSX $Name ($($Benchmark.Cpu))..."
        & node $Compiler build (Join-Path $Root "$Name\lazyscriptex.json")
        if ($LASTEXITCODE -ne 0) { throw "LSX build failed for $Name" }
        Build-CReference $CCompiler $Name $Benchmark.Cpu $NativeC.IsPresent
    }
}

$CMode = if ($NativeC) { "native" } else { "matched" }
$Rows = foreach ($Benchmark in $Benchmarks) {
    $Name = $Benchmark.Name
    $LsxExe = Join-Path $Root "$Name\build\${Name}_lsx.exe"
    $CExe = Join-Path $Out "${Name}_c.exe"
    if (-not (Test-Path $LsxExe)) { throw "Missing LSX executable: $LsxExe" }
    if (-not (Test-Path $CExe)) { throw "Missing C executable: $CExe" }
    Write-Host "Timing $Name..."
    $LsxMs = Measure-Executable $LsxExe $Runs
    $CMs = Measure-Executable $CExe $Runs
    [PSCustomObject]@{
        Benchmark = $Name
        LSX_Target = $Benchmark.Cpu
        C_Mode = $CMode
        LSX_ms = [Math]::Round($LsxMs, 3)
        C_ms = [Math]::Round($CMs, 3)
        LSX_over_C = [Math]::Round($LsxMs / $CMs, 3)
    }
}

$Rows | Format-Table -AutoSize
$Csv = Join-Path $Out "near_c_results.csv"
$Rows | Export-Csv -NoTypeInformation $Csv
Write-Host "Results written to $Csv"
