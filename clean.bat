@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"

for %%R in (Projects CompilerTests Benchmarks) do (
  if exist "%ROOT%%%R" (
    for /d /r "%ROOT%%%R" %%D in (build out dist coverage .cache node_modules __pycache__) do (
      if exist "%%D" rmdir /s /q "%%D"
    )
  )
)

echo Generated build and cache directories removed.
exit /b 0
