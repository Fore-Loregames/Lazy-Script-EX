@echo off
setlocal
set "ROOT=%~dp0"
set "SOURCE=%ROOT%native\lsx_media.c"
set "OBJECT=%ROOT%native\lsx_media.obj"
set "OUTPUT=%ROOT%native\LSXMedia.dll"
set "IMPORT=%ROOT%native\LSXMedia.lib"

where clang-cl >nul 2>nul
if not errorlevel 1 (
  where lld-link >nul 2>nul
  if errorlevel 1 goto :no_linker
  clang-cl /nologo /c /O2 /GS- /W3 /Fo:"%OBJECT%" "%SOURCE%"
  if errorlevel 1 exit /b %errorlevel%
  lld-link /dll /entry:DllMain /machine:x64 /nodefaultlib /out:"%OUTPUT%" /implib:"%IMPORT%" "%OBJECT%" kernel32.lib
  exit /b %errorlevel%
)

where cl >nul 2>nul
if not errorlevel 1 (
  where link >nul 2>nul
  if errorlevel 1 goto :no_linker
  cl /nologo /c /O2 /GS- /W3 /Fo"%OBJECT%" "%SOURCE%"
  if errorlevel 1 exit /b %errorlevel%
  link /dll /entry:DllMain /machine:x64 /nodefaultlib /out:"%OUTPUT%" /implib:"%IMPORT%" "%OBJECT%" kernel32.lib
  exit /b %errorlevel%
)

echo clang-cl or cl was not found. Run this from a Visual Studio Developer Command Prompt.
exit /b 1

:no_linker
echo A compatible linker was not found. Install lld-link or use a Visual Studio Developer Command Prompt.
exit /b 1
