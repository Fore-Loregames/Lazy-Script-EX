@echo off
setlocal EnableExtensions
set "VSIX=%~dp0LazyScriptEX-Native-GameKit.vsix"
set "CODE_CLI="

if not exist "%VSIX%" (
  echo ERROR: The VS Code extension package was not found:
  echo   %VSIX%
  pause
  exit /b 1
)

for %%C in (code.cmd code-insiders.cmd codium.cmd cursor.cmd code code-insiders codium cursor) do (
  if not defined CODE_CLI for /f "delims=" %%P in ('where %%C 2^>nul') do if not defined CODE_CLI set "CODE_CLI=%%P"
)
if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if not defined CODE_CLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" set "CODE_CLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
if not defined CODE_CLI if exist "%ProgramFiles%\Microsoft VS Code\Code.exe" set "CODE_CLI=%ProgramFiles%\Microsoft VS Code\Code.exe"

if not defined CODE_CLI (
  echo ERROR: VS Code, VS Code Insiders, VSCodium, or Cursor was not found.
  echo Install the VSIX manually from the Extensions panel:
  echo   %VSIX%
  pause
  exit /b 1
)

call "%CODE_CLI%" --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo ERROR: Extension installation failed.
  pause
  exit /b 1
)

echo LazyScriptEX Native GameKit 0.21.6 is installed.
echo Restart or reload the editor.
pause
exit /b 0
