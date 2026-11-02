@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title mychess
set PORT=8787

echo ============================================================
echo   mychess : screenshot -> FEN -> En Croissant
echo.
echo   Keep this window open: it IS the server.
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js 22+ not found. Install from https://nodejs.org
  goto :fail
)

if not exist node_modules (
  echo [.] first run: npm install ...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist dist (
  echo [.] first run: npm run build ...
  call npm run build
  if errorlevel 1 goto :fail
)

echo [.] starting http://127.0.0.1:%PORT%/
echo     the browser opens automatically; if not, copy that address.
echo.
echo ------------------------------------------------------------
node src/server.mjs
set EXITCODE=%errorlevel%
echo ------------------------------------------------------------

if not "%EXITCODE%"=="0" (
  echo.
  echo [!] server exited with code %EXITCODE%.
  echo     If it said the port is busy, an older mychess is still running:
  echo     use that one instead - opening http://127.0.0.1:%PORT%/ now ...
  start "" "http://127.0.0.1:%PORT%/"
)

:fail
echo.
echo Press any key to close this window.
pause >nul
endlocal
