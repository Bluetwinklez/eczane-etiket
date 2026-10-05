@echo off
chcp 65001 >nul
title Eczam Güncelle
cd /d "%~dp0.."
echo === Eczam güncelleniyor ===
echo.
echo 1/4 Sunucu durduruluyor...
call "%~dp0eczam-durdur.bat" sessiz
timeout /t 2 /nobreak >nul
echo 2/4 Veritabanı yedekleniyor...
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set ZAMAN=%%t
if exist web\data\eczane.db (
  if not exist web\data\yedekler mkdir web\data\yedekler
  copy /y web\data\eczane.db "web\data\yedekler\guncelleme-oncesi-%ZAMAN%.db" >nul
)
echo 3/4 Yeni sürüm alınıyor...
git pull --ff-only
if errorlevel 1 goto hata
cd web
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 goto hata
cd ..
echo 4/4 Program yeniden başlatılıyor...
call "%~dp0eczam-baslat.bat"
echo.
echo Güncelleme tamamlandı.
timeout /t 3 >nul
exit /b 0
:hata
echo.
echo GÜNCELLEME BAŞARISIZ. Yukarıdaki mesajı destek sohbetine gönderin.
echo Veritabanınız korunuyor; program eski sürümle açılıyor.
call "%~dp0eczam-baslat.bat"
pause
exit /b 1
