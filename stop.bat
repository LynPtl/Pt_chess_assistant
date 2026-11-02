@echo off
chcp 65001 >nul
setlocal
set PORT=8787
set FOUND=

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /C:":%PORT%" ^| findstr /C:"LISTENING"') do set FOUND=%%p

if not defined FOUND (
  echo [.] port %PORT% is free - there is no mychess server to stop.
  goto :end
)

echo [.] port %PORT% is held by PID %FOUND%
tasklist /FI "PID eq %FOUND%" /FO TABLE | findstr /I /C:"node.exe" >nul
if errorlevel 1 (
  echo [!] that process is not node.exe, so it is not mychess.
  echo     refusing to kill it. details:
  tasklist /FI "PID eq %FOUND%"
  goto :end
)

taskkill /F /PID %FOUND%
if errorlevel 1 (
  echo [!] failed to stop PID %FOUND%
) else (
  echo [.] stopped mychess ^(PID %FOUND%^)
)

:end
echo.
echo Press any key to close this window.
pause >nul
endlocal
