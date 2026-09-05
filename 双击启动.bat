@echo off
chcp 65001 >nul
echo.
echo ===========================================
echo    卜桐乐：Level 18 - 3D 个人介绍网站
echo ===========================================
echo.

set NPM="C:\Users\卜\AppData\Roaming\CherryStudio\Toolchain\mise\shims\npm"
set URL=http://localhost:5174

echo [1/3] 正在检查开发服务器...

:: 检查端口是否已有服务在跑
curl -s -o nul -w "%%{http_code}" %URL% > %TEMP%\level18_port_check.txt 2>nul
set /p PORT_STATUS=<%TEMP%\level18_port_check.txt

if "%PORT_STATUS%"=="200" (
    echo     服务器已经在运行！
    echo     正在打开浏览器...
    start "" %URL%
    echo.
    echo ===========================================
    echo    网站已打开，可以关闭此窗口。
    echo ===========================================
    pause >nul
    exit
)

echo [2/3] 正在启动开发服务器...
echo     首次启动可能需要 5~10 秒...
echo.

start /min cmd /c %NPM% run dev

echo [3/3] 等待服务器就绪...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s -o nul -w "%%{http_code}" %URL% > %TEMP%\level18_port_check.txt 2>nul
set /p PORT_STATUS=<%TEMP%\level18_port_check.txt
if not "%PORT_STATUS%"=="200" goto WAIT_LOOP

echo     服务器已就绪！正在打开浏览器...
start "" %URL%

echo.
echo ===========================================
echo    网站已打开，可以关闭此窗口。
echo ===========================================
pause >nul
