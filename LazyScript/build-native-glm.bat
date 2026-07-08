@echo off
setlocal
set "ROOT=%~dp0"
set "SOURCE=%ROOT%native\lsx_glm_bridge.cpp"
set "OBJECT=%ROOT%native\lsx_glm_bridge.obj"
set "OUTPUT=%ROOT%native\LSXMath.dll"
set "IMPORT=%ROOT%native\LSXMath.lib"
set "INCLUDE=%ROOT%native\include"

where cl >nul 2>nul
if errorlevel 1 goto :try_clang
where link >nul 2>nul
if errorlevel 1 goto :try_clang
cl /nologo /c /O2 /EHsc- /GR- /GS- /std:c++17 /DGLM_FORCE_PURE /I"%INCLUDE%" /Fo"%OBJECT%" "%SOURCE%"
if errorlevel 1 exit /b %errorlevel%
link /nologo /dll /machine:x64 /opt:ref /opt:icf /out:"%OUTPUT%" /implib:"%IMPORT%" "%OBJECT%"
exit /b %errorlevel%

:try_clang
where clang-cl >nul 2>nul
if errorlevel 1 goto :missing
where lld-link >nul 2>nul
if errorlevel 1 goto :missing
clang-cl /nologo /c /O2 /EHsc- /GR- /GS- /std:c++17 /DGLM_FORCE_PURE /I"%INCLUDE%" /Fo:"%OBJECT%" "%SOURCE%"
if errorlevel 1 exit /b %errorlevel%
lld-link /dll /machine:x64 /opt:ref /opt:icf /out:"%OUTPUT%" /implib:"%IMPORT%" "%OBJECT%" msvcrt.lib
exit /b %errorlevel%

:missing
echo A Visual Studio C++ x64 build environment or clang-cl with lld-link is required.
exit /b 1
