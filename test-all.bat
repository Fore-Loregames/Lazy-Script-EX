@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "FAILED=0"

for %%T in ("%ROOT%LazyScript\compiler\test*.js") do (
  echo.
  echo ==== %%~nxT ====
  node "%%~fT"
  if errorlevel 1 set "FAILED=1"
)

echo.
echo ==== API validation ====
node "%ROOT%LazyScript\tools\validate_beginner_api.js"
if errorlevel 1 set "FAILED=1"

echo.
echo ==== VS Code extension validation ====
node "%ROOT%LazyScript\extension\test_extension.js"
if errorlevel 1 set "FAILED=1"

echo.
echo ==== Project graph validation ====
call "%ROOT%check-all.bat"
if errorlevel 1 set "FAILED=1"

exit /b %FAILED%
