@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行：正在安装依赖...
  call npm install || goto :error
)
if not exist dist (
  echo 首次运行：正在构建页面...
  call npm run build || goto :error
)
node src/server.mjs
goto :eof
:error
echo.
echo 启动失败。请确认已安装 Node.js 22+，然后重试。
pause
