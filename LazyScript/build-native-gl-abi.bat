@echo off
setlocal
set "ROOT=%~dp0"
set "SOURCE=%ROOT%native\lsx_gl_abi.c"
set "OBJECT=%ROOT%native\lsx_gl_abi.obj"
set "OUTPUT=%ROOT%native\LSXGLABI.dll"
set "IMPORTLIB=%ROOT%native\LSXGLABI.lib"

where clang-cl >nul 2>nul
if not errorlevel 1 (
  clang-cl /nologo /c /O2 /GS- /GR- /EHs-c- /Fo:"%OBJECT%" "%SOURCE%"
  if errorlevel 1 exit /b %errorlevel%
  where lld-link >nul 2>nul
  if not errorlevel 1 (
    lld-link /dll /noentry /nodefaultlib /machine:x64 /out:"%OUTPUT%" /implib:"%IMPORTLIB%" /export:lsxGlTexImage2DCall "%OBJECT%"
    exit /b %errorlevel%
  )
  where link >nul 2>nul
  if not errorlevel 1 (
    link /nologo /dll /noentry /nodefaultlib /machine:x64 /out:"%OUTPUT%" /implib:"%IMPORTLIB%" /export:lsxGlTexImage2DCall "%OBJECT%"
    exit /b %errorlevel%
  )
)

where cl >nul 2>nul
if not errorlevel 1 (
  cl /nologo /c /O2 /GS- /GR- /EHs-c- /Fo:"%OBJECT%" "%SOURCE%"
  if errorlevel 1 exit /b %errorlevel%
  link /nologo /dll /noentry /nodefaultlib /machine:x64 /out:"%OUTPUT%" /implib:"%IMPORTLIB%" /export:lsxGlTexImage2DCall "%OBJECT%"
  exit /b %errorlevel%
)

echo clang-cl/lld-link or cl/link was not found. Run this from a Visual Studio or LLVM developer prompt.
exit /b 1
