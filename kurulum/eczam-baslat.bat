@echo off
chcp 65001 >nul
title Eczam
set URL=http://localhost:3000
curl -sf -o nul -m 2 %URL%/api/health && goto ac
echo Eczam sunucusu başlatılıyor...
wscript "%~dp0eczam-gizli-baslat.vbs"
set /a deneme=0
:bekle
timeout /t 1 /nobreak >nul
curl -sf -o nul -m 2 %URL%/api/health && goto ac
set /a deneme+=1
if %deneme% GEQ 40 goto hata
goto bekle
:ac
start "" %URL%
exit /b 0
:hata
echo.
echo Sunucu başlatılamadı. Ayrıntı: %~dp0..\web\data\sunucu.log
echo Bu dosyanın son satırlarını destek sohbetine gönderebilirsiniz.
pause
exit /b 1
