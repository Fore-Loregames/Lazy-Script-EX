@echo off
for /d %%D in ("%~dp0Projects\*") do if exist "%%D\build" rmdir /s /q "%%D\build"
