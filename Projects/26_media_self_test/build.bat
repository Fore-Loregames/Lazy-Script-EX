@echo off
setlocal
cd /d "%~dp0"
node "..\..\LazyScript\compiler\lazyscriptex.js" build .
if errorlevel 1 pause
