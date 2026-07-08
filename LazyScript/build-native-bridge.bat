@echo off
setlocal
set "ROOT=%~dp0"
set "SOURCES=%ROOT%native\lsx_gamekit_bridge.c %ROOT%native\lsx_gamekit_helpers.c"
where clang-cl >nul 2>nul
if not errorlevel 1 (
  clang-cl /nologo /LD /O2 /I"%ROOT%native" %SOURCES% /link /OUT:"%ROOT%native\LSXGameKit.dll" /IMPLIB:"%ROOT%native\LSXGameKit.lib"
  if errorlevel 1 exit /b %errorlevel%
  call "%ROOT%build-native-gl-abi.bat"
  if errorlevel 1 exit /b %errorlevel%
  call "%ROOT%build-native-media.bat"
  exit /b %errorlevel%
)
where cl >nul 2>nul
if not errorlevel 1 (
  cl /nologo /LD /O2 /I"%ROOT%native" %SOURCES% /link /OUT:"%ROOT%native\LSXGameKit.dll" /IMPLIB:"%ROOT%native\LSXGameKit.lib"
  if errorlevel 1 exit /b %errorlevel%
  call "%ROOT%build-native-gl-abi.bat"
  if errorlevel 1 exit /b %errorlevel%
  call "%ROOT%build-native-media.bat"
  exit /b %errorlevel%
)
echo clang-cl or cl was not found. Run this from a Visual Studio Developer Command Prompt.
exit /b 1
