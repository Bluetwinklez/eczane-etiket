"""Programı başlatan üst seviye giriş betiği.

PyInstaller ile paketlerken bu dosya hedeflenmelidir (`eczane_etiket/main.py`
değil) — paket içi göreli importların (`from . import ...`) doğru çalışması
için `eczane_etiket` bir paket olarak içe aktarılmalı, doğrudan betik olarak
çalıştırılmamalıdır.
"""

from eczane_etiket.main import main

if __name__ == "__main__":
    main()
