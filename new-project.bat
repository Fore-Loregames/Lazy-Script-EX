@echo off
setlocal
if "%~1"=="" (
  echo Usage: new-project.bat ProjectName
  exit /b 1
)
set "DEST=%~dp0Projects\%~1"
if exist "%DEST%" (
  echo Project already exists: %DEST%
  exit /b 1
)
xcopy "%~dp0Projects\ProjectTemplate" "%DEST%\" /E /I /Q >nul
powershell -NoProfile -Command "$p='%DEST%\lazyscriptex.json'; $j=Get-Content $p -Raw | ConvertFrom-Json; $j.output='build/%~1.exe'; $j | ConvertTo-Json -Depth 8 | Set-Content $p -Encoding UTF8"
echo Created %DEST%
echo Open this toolkit root in VS Code so @LazyScript imports and recursive indexing are available.
