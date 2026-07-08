@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
set "FAILED=0"
for /d %%D in ("%ROOT%Projects\*") do (
  if exist "%%D\build.bat" (
    echo.
    echo ==== Building %%~nxD ====
    call "%%D\build.bat"
    if errorlevel 1 set "FAILED=1"
  )
)
exit /b %FAILED%
