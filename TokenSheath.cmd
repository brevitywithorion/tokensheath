@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo TokenSheath needs Node.js 22 or newer.
  echo Install it from https://nodejs.org then double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)

echo Starting TokenSheath...
node bin\sheath.mjs serve
if errorlevel 1 pause
