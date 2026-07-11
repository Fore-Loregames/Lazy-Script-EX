@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "FAILED=0"

for %%S in (Projects CompilerTests Benchmarks) do (
  if exist "%ROOT%%%S" (
    for /r "%ROOT%%%S" %%F in (lazyscriptex.json) do (
      echo ==== Checking %%S\%%~pF ====
      node "%ROOT%LazyScript\compiler\lazyscriptex.js" check-project "%%~dpF"
      if errorlevel 1 set "FAILED=1"
    )
  )
)

echo.
echo ==== Validating offline API ====
node "%ROOT%LazyScript\tools\validate_beginner_api.js"
if errorlevel 1 set "FAILED=1"

exit /b %FAILED%
