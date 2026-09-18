"""Eczane İstasyonu Sistem Sağlığı ve Kendi Kendini Teşhis Modülü (Self-Diagnostics).

Uygulamanın sorunsuz çalışmasını güvenceye almak için:
- Python ve Tkinter / Tcl çalışma ortamı
- Türkçe DejaVu Sans PDF fontlarının durumu
- Yerel JSON veri tabanlarının okuma/yazma izinleri
- ReportLab PDF derleme motoru
- Bağlı yazıcıların tespiti
testlerini yapar ve detaylı sağlık raporu sunar.
"""

import os
import platform
import sys
from typing import Any, Dict, List, Optional

from .label_pdf import get_system_printers
from .paths import DRUGS_FILE, HISTORY_FILE, PROFILES_FILE, STOCK_FILE

_FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")


def run_system_diagnostics() -> Dict[str, any]:
    """Sistem bileşenlerini test eder ve durum raporu döner."""
    checks = []

    # 1. Python & İşletim Sistemi
    py_ver = sys.version.split()[0]
    os_name = f"{platform.system()} {platform.release()}"
    checks.append({
        "component": "Python & OS",
        "status": "OK",
        "detail": f"Python {py_ver} ({os_name})",
    })

    # 2. Tkinter & GUI
    try:
        import tkinter as tk
        tk_ver = tk.TkVersion
        checks.append({
            "component": "Tkinter GUI",
            "status": "OK",
            "detail": f"Tcl/Tk v{tk_ver} aktif",
        })
    except Exception as e:
        checks.append({
            "component": "Tkinter GUI",
            "status": "FAIL",
            "detail": f"Hata: {e}",
        })

    # 3. DejaVu Sans Türkçe Fontları
    font_reg = os.path.join(_FONTS_DIR, "DejaVuSans.ttf")
    font_bld = os.path.join(_FONTS_DIR, "DejaVuSans-Bold.ttf")
    has_fonts = os.path.isfile(font_reg) and os.path.isfile(font_bld)
    checks.append({
        "component": "Türkçe DejaVu Fontları",
        "status": "OK" if has_fonts else "WARNING",
        "detail": "Fontlar mevcut (Türkçe karakterler %100 destekli)" if has_fonts else "Font dosyaları eksik, Helvetica kullanılacak",
    })

    # 4. JSON Veritabanı Yazma İzinleri
    storage_ok = True
    storage_err = ""
    for name, path in [("İlaçlar", DRUGS_FILE), ("Geçmiş", HISTORY_FILE), ("Profiller", PROFILES_FILE), ("Stok", STOCK_FILE)]:
        try:
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            # Test yazma
            test_file = os.path.join(parent, ".perm_test")
            with open(test_file, "w") as f:
                f.write("ok")
            os.remove(test_file)
        except Exception as e:
            storage_ok = False
            storage_err = str(e)
            break

    checks.append({
        "component": "Veri Depolama & İzinler",
        "status": "OK" if storage_ok else "FAIL",
        "detail": "Yerel JSON veri tabanları yazılabilir durumda" if storage_ok else f"Yazma hatası: {storage_err}",
    })

    # 5. ReportLab PDF Motoru
    try:
        import reportlab
        checks.append({
            "component": "ReportLab PDF",
            "status": "OK",
            "detail": f"ReportLab v{reportlab.__version__} hazır",
        })
    except Exception as e:
        checks.append({
            "component": "ReportLab PDF",
            "status": "FAIL",
            "detail": f"PDF motoru yüklenemedi: {e}",
        })

    # 6. Sistem Yazıcıları
    try:
        printers = get_system_printers()
        checks.append({
            "component": "Yazıcı Servisi",
            "status": "OK",
            "detail": f"{len(printers)} adet yazıcı tespit edildi ({', '.join(printers[:2]) if printers else 'Yazıcı yok'})",
        })
    except Exception as e:
        checks.append({
            "component": "Yazıcı Servisi",
            "status": "WARNING",
            "detail": f"Yazıcılar listelenemedi: {e}",
        })

    all_ok = all(c["status"] == "OK" for c in checks)
    return {
        "overall_status": "HEALTHY" if all_ok else "ATTENTION_REQUIRED",
        "checks": checks,
    }


def generate_diagnostic_summary_text() -> str:
    """Metin formatında teşhis raporu üretir."""
    return format_diagnostics_report()


def format_diagnostics_report(res: Optional[Dict[str, any]] = None) -> str:
    """Metin formatında sistem sağlık ve tanı raporu üretir."""
    if res is None:
        res = run_system_diagnostics()
    lines = [
        "========================================",
        "SİSTEM SAĞLIK VE TANI RAPORU",
        f"Genel Durum: {'✅ SAĞLIKLI' if res.get('overall_status') == 'HEALTHY' else '⚠️ DİKKAT GEREKLİ'}",
        "========================================",
    ]
    for c in res.get("checks", []):
        icon = "✓" if c["status"] == "OK" else ("⚠" if c["status"] == "WARNING" else "✕")
        lines.append(f"[{icon}] {c['component']}: {c['detail']}")
    lines.append("========================================")
    return "\n".join(lines)

