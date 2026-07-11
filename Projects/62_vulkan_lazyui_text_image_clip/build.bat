@echo off
setlocal
cd /d "%~dp0"
node "..\..\LazyScript\compiler\lazyscriptex.js" build lazyscriptex.json
exit /b %errorlevel%
