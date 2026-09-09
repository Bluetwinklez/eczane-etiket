# -*- mode: python ; coding: utf-8 -*-
# Windows'ta çift tıkla açılan tek dosyalık EczaneEtiket.exe üretmek için:
#   pip install -r requirements.txt -r requirements-dev.txt
#   pyinstaller eczane_etiket.spec
# Çıktı: dist/EczaneEtiket.exe (Windows'ta). PyInstaller çapraz derleme
# yapmaz — bu komut hangi işletim sisteminde çalıştırılırsa o sistemin
# çalıştırılabilir dosyasını üretir; gerçek bir .exe için Windows üzerinde
# çalıştırılmalıdır.

block_cipher = None

a = Analysis(
    ['run_app.py'],
    pathex=[],
    binaries=[],
    # DejaVu Sans fontları (Türkçe karakter desteği için) paket içine dahil edilir.
    datas=[('eczane_etiket/fonts', 'eczane_etiket/fonts')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='EczaneEtiket',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
