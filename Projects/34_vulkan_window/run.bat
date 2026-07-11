@echo off
setlocal
call "%~dp0build.bat"
if errorlevel 1 exit /b %errorlevel%
"%~dp0build\34_vulkan_window.exe"
endlocal
