@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"

node "%ROOT%LazyScript\tools\generate_api_docs.js"
if errorlevel 1 exit /b 1

node "%ROOT%LazyScript\tools\enrich_beginner_api.js"
if errorlevel 1 exit /b 1

if exist "%ROOT%LazyScript\extension\api" rmdir /s /q "%ROOT%LazyScript\extension\api"
mkdir "%ROOT%LazyScript\extension\api"
xcopy "%ROOT%LazyScript\api\*" "%ROOT%LazyScript\extension\api\" /E /I /Q /Y >nul
if errorlevel 1 exit /b 1

node "%ROOT%LazyScript\tools\validate_beginner_api.js"
if errorlevel 1 exit /b 1

echo Offline API and extension API are synchronized.
exit /b 0
