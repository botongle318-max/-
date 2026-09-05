@echo off
chcp 65001 >nul
echo ======================================
echo   卜桐乐：Level 18
echo   3D 个人介绍网站
echo ======================================
echo.
echo 正在启动开发服务器...
echo.
cd /d "%~dp0"
"C:\Users\卜\AppData\Roaming\CherryStudio\Toolchain\mise\shims\npm" run dev
pause
