@echo off
setlocal EnableExtensions
set "VSIX=%~dp0LazyScriptEX-Native-GameKit-0.18.14.vsix"
set "CODE_CLI="

if not exist "%VSIX%" (
  echo ERROR: The VS Code extension package was not found:
  echo   %VSIX%
  echo.
  echo Keep this installer in the toolkit root beside the .vsix file.
  pause
  exit /b 1
)

for %%C in (code.cmd code-insiders.cmd codium.cmd cursor.cmd code code-insiders codium cursor) do (
  if not defined CODE_CLI for /f "delims=" %%P in ('where %%C 2^>nul') do if not defined CODE_CLI set "CODE_CLI=%%P"
)

if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code Insiders\bin\code-insiders.cmd" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code Insiders\bin\code-insiders.cmd"
if not defined CODE_CLI if exist "%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd" set "CODE_CLI=%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd"
if not defined CODE_CLI if exist "%ProgramFiles(x86)%\Microsoft VS Code Insiders\bin\code-insiders.cmd" set "CODE_CLI=%ProgramFiles(x86)%\Microsoft VS Code Insiders\bin\code-insiders.cmd"
if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders\Code - Insiders.exe" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders\Code - Insiders.exe"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code\Code.exe" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code\Code.exe"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code Insiders\Code - Insiders.exe" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code Insiders\Code - Insiders.exe"

if not defined CODE_CLI (
  echo ERROR: Visual Studio Code or Visual Studio Code Insiders was not found.
  echo.
  echo Open Visual Studio Code manually and use:
  echo   Extensions ^> ... ^> Install from VSIX...
  echo.
  echo Select:
  echo   %VSIX%
  pause
  exit /b 1
)

echo Installing LazyScriptEX Native GameKit 0.18.14 into Visual Studio Code...
echo Using: %CODE_CLI%
echo.
call "%CODE_CLI%" --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo.
  echo ERROR: Visual Studio Code reported that extension installation failed.
  echo Close all VS Code windows and run this installer again, or use
  echo Extensions ^> ... ^> Install from VSIX... inside VS Code.
  pause
  exit /b 1
)

echo.
echo SUCCESS: LazyScriptEX Native GameKit 0.18.14 is installed.
echo Restart Visual Studio Code, then open the toolkit root folder.
pause
exit /b 0
