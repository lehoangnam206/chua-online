@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Dang cai dat lan dau...
  call npm install
)
where cloudflared 1>NUL 2>nul
if errorlevel 1 (
  echo Dang cai cloudflared lan dau...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo Cai xong. Hay DONG cua so nay va bam dup start-public.bat lan nua.
  pause
  exit /b
)
start "Chua Online - server" cmd /k node server.js
timeout /t 3 >nul
echo.
echo ================================================================
echo  Doi vai giay, tim dong co dang https://....trycloudflare.com
echo  Link game cong khai = link do + /scene.html?room=USERNAME
echo  Giu ca 2 cua so mo trong suot buoi live.
echo ================================================================
echo.
cloudflared tunnel --url http://localhost:8080
pause
