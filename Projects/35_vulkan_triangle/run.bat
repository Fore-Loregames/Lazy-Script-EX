@echo off
setlocal
call "%~dp0build.bat"
if errorlevel 1 exit /b %errorlevel%
"%~dp0build\35_vulkan_triangle.exe"
endlocal
