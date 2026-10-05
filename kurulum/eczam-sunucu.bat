@echo off
rem Eczam sunucusu: kapanırsa 5 saniye sonra yeniden başlar. eczam-durdur.bat ile durdurulur.
cd /d "%~dp0..\web"
if not exist data mkdir data
del data\durdur.bayrak 2>nul
:dongu
for %%A in (data\sunucu.log) do if %%~zA GTR 5000000 move /y data\sunucu.log data\sunucu.log.1 >nul
echo [%date% %time%] sunucu baslatiliyor >> data\sunucu.log
node server\index.js >> data\sunucu.log 2>&1
if exist data\durdur.bayrak goto son
echo [%date% %time%] sunucu kapandi, 5 sn sonra yeniden baslatiliyor >> data\sunucu.log
timeout /t 5 /nobreak >nul
goto dongu
:son
del data\durdur.bayrak 2>nul
