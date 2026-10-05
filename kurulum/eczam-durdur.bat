@echo off
rem Eczam sunucusunu durdurur (yeniden başlatma döngüsü de kapanır)
cd /d "%~dp0..\web"
if not exist data mkdir data
echo dur > data\durdur.bayrak
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
if not "%~1"=="sessiz" echo Eczam sunucusu durduruldu.
