@echo off
setlocal
cd /d "%~dp0"
node "tools\build_freetype_bridge.js"
exit /b %errorlevel%
