@echo off
setlocal
set "SEARCH=%~dp0"
:find_lazyscript
if exist "%SEARCH%LazyScript\compiler\lazyscriptex.js" (
  set "LAZYSCRIPT=%SEARCH%LazyScript"
  goto found_lazyscript
)
for %%I in ("%SEARCH%..") do set "PARENT=%%~fI\"
if /I "%PARENT%"=="%SEARCH%" (
  echo Could not find a LazyScript folder above or beside this project.
  echo Keep LazyScript and the project under the same workspace tree.
  exit /b 1
)
set "SEARCH=%PARENT%"
goto find_lazyscript

:found_lazyscript
node "%LAZYSCRIPT%\compiler\lazyscriptex.js" build "%~dp0lazyscriptex.json"
exit /b %errorlevel%
