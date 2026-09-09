@echo off
chcp 65001 >nul
echo ===================================
echo   卜桐乐 - 个人网站本地服务器
echo ===================================
echo.
echo 正在启动本地服务器...
echo.

set MAGAZINE_DIR=%~dp0

start /B "" npx serve "%MAGAZINE_DIR%" -l 3456 >nul 2>&1

timeout /t 3 >nul

echo 服务器已启动：http://localhost:3456
echo.
echo 正在打开浏览器...
start http://localhost:3456
echo.
echo 按任意键关闭服务器...
pause >nul

taskkill /F /IM node.exe >nul 2>&1
echo 服务器已关闭。
