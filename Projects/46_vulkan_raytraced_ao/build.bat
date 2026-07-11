@echo off
setlocal
node "%~dp0..\..\LazyScript\compiler\lazyscriptex.js" build "%~dp0"
endlocal
