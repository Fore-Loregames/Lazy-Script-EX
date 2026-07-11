@echo off
setlocal EnableExtensions
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-extension.ps1"
exit /b %ERRORLEVEL%
