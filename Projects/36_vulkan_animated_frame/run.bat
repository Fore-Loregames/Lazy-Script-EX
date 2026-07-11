@echo off
setlocal
call "%~dp0build.bat"
if errorlevel 1 exit /b %errorlevel%
"%~dp0build\36_vulkan_animated_frame.exe"
endlocal
