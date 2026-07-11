@echo off
setlocal
cd /d "%~dp0"
where clang >nul 2>nul || (
  echo clang was not found. Install LLVM and place clang.exe on PATH.
  exit /b 1
)
where lld-link >nul 2>nul || (
  echo lld-link was not found. Install LLVM and place lld-link.exe on PATH.
  exit /b 1
)
clang --target=x86_64-pc-windows-msvc -ffreestanding -fms-extensions -O2 -c lsx_vulkan.c -o lsx_vulkan.obj
if errorlevel 1 exit /b %errorlevel%
lld-link /dll /noentry /out:LSXVulkan.dll lsx_vulkan.obj kernel32.lib
set "RESULT=%errorlevel%"
del /q lsx_vulkan.obj >nul 2>nul
exit /b %RESULT%
