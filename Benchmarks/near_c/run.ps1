param(
    [int]$Runs = 5,
    [switch]$SkipBuild
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

function Build-CReference($CompilerInfo, $Name) {
    $Source = Join-Path $Root "c\$Name.c"
    $Target = Join-Path $Out "${Name}_c.exe"
    if ($CompilerInfo.Kind -eq "clang") {
        $Args = @("-O3", "-DNDEBUG", "-march=native", $Source, "-o", $Target)
    } else {
        $Args = @("/O2", "/DNDEBUG", "/clang:-march=native", $Source, "/Fe:$Target")
    }
    & $CompilerInfo.Path @Args
    if ($LASTEXITCODE -ne 0) { throw "C build failed for $Name" }
}

function Measure-Executable([string]$Path, [int]$Count) {
    # One warm-up keeps process startup and page faults from dominating the median.
    $warm = Start-Process -FilePath $Path -Wait -PassThru -NoNewWindow
    if ($warm.ExitCode -ne 0) { throw "$Path failed with exit code $($warm.ExitCode)" }
    $samples = @()
    for ($i = 0; $i -lt $Count; $i++) {
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $Path -Wait -PassThru -NoNewWindow
        $watch.Stop()
        if ($process.ExitCode -ne 0) { throw "$Path failed with exit code $($process.ExitCode)" }
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
        Build-CReference $CCompiler $Name
    }
}

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
        Target = $Benchmark.Cpu
        LSX_ms = [Math]::Round($LsxMs, 3)
        C_ms = [Math]::Round($CMs, 3)
        LSX_over_C = [Math]::Round($LsxMs / $CMs, 3)
    }
}

$Rows | Format-Table -AutoSize
$Csv = Join-Path $Out "near_c_results.csv"
$Rows | Export-Csv -NoTypeInformation $Csv
Write-Host "Results written to $Csv"
