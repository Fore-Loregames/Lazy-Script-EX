@echo off
setlocal EnableExtensions
set "VSIX=%~dp0LazyScriptEX-Native-GameKit-0.18.28-nested-static-object-fix.vsix"
set "CODE_CLI="

if not exist "%VSIX%" (
  echo ERROR: The VS Code extension package was not found:
  echo   %VSIX%
  echo.
  echo Keep this installer beside the .vsix file.
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
  echo ERROR: Visual Studio Code, VS Code Insiders, VSCodium, or Cursor was not found.
  echo.
  echo Open VS Code manually and choose:
  echo   Extensions ^> ... ^> Install from VSIX...
  echo.
  echo Then select:
  echo   %VSIX%
  pause
  exit /b 1
)

echo Installing LazyScriptEX Native GameKit 0.18.28...
echo Using: %CODE_CLI%
echo.
call "%CODE_CLI%" --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo.
  echo ERROR: Extension installation failed.
  echo Close all VS Code windows and run this installer again, or install
  echo the VSIX manually from the Extensions panel.
  pause
  exit /b 1
)

echo.
echo SUCCESS: LazyScriptEX Native GameKit 0.18.28 is installed.
echo Restart or reload VS Code before testing nested static-object completion.
pause
exit /b 0
