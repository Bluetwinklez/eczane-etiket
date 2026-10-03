@echo off
title Eczane İlaç Etiketi
chcp 65001 >nul

if not exist .venv (
    echo [BİLGİ] İlk kurulum yapılıyor, sanal ortam oluşturuluyor...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo [BİLGİ] Gerekli kütüphaneler yükleniyor...
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

echo [BİLGİ] Program başlatılıyor...
python run_app.py
