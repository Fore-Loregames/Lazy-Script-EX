@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
set "FAILED=0"
for /d %%D in ("%ROOT%Projects\*") do (
  if exist "%%D\lazyscriptex.json" (
    echo ==== Checking %%~nxD ====
    node "%ROOT%LazyScript\compiler\lazyscriptex.js" check-project "%%D"
    if errorlevel 1 set "FAILED=1"
  )
)

echo.
echo ==== Validating beginner API metadata ====
node "%ROOT%LazyScript\tools\validate_beginner_api.js"
if errorlevel 1 set "FAILED=1"

exit /b %FAILED%
