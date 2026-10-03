"""Eczane Gün Sonu Kapanış ve Z-Raporu Üreticisi (Z-Report Engine).

Günün sonunda eczacının günlük basım sayısını, personel performansını,
tahmini ciroyu ve kritik stok hareketlerini tek sayfada özetleyen
resmi A4 veya 80mm termal formatta Gün Sonu Z-Raporu PDF'i üretir.
"""

import datetime as _dt
import os
import uuid
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from . import history, stats

_FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def _register_fonts():
    global FONT_REGULAR, FONT_BOLD
    reg = os.path.join(_FONTS_DIR, "DejaVuSans.ttf")
    bld = os.path.join(_FONTS_DIR, "DejaVuSans-Bold.ttf")
    if os.path.isfile(reg) and os.path.isfile(bld):
        try:
            pdfmetrics.registerFont(TTFont("DejaVuSans", reg))
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", bld))
            FONT_REGULAR = "DejaVuSans"
            FONT_BOLD = "DejaVuSans-Bold"
        except Exception:
            pass


_register_fonts()


def build_z_report_pdf(
    filename: str,
    profile: dict,
    target_date: Optional[str] = None,
) -> str:
    """Gün Sonu Z-Raporu PDF'i oluşturur."""
    _register_fonts()
    pharmacy_name = profile.get("name") or "ECZANEM"
    phone = profile.get("phone") or ""

    today_str = target_date or _dt.date.today().isoformat()
    display_date = _dt.datetime.strptime(today_str, "%Y-%m-%d").strftime("%d.%m.%Y") if "-" in today_str else today_str
    now_time = _dt.datetime.now().strftime("%H:%M:%S")

    # Verileri hazırla
    all_records = history.load_history()
    today_records = [r for r in all_records if (r.get("timestamp") or "")[:10] == today_str]
    today_count = len(today_records)
    today_turnover = stats.daily_turnover(day=today_str, records=all_records)
    top_today_drugs = stats.top_drugs(limit=5, records=today_records)
    top_today_staff = stats.top_staff(limit=5, records=today_records)
    stock_al = stats.stock_alerts_summary()

    # A4 Sayfası
    c = canvas.Canvas(filename, pagesize=A4)
    w, h = A4

    # Üst Başlık (Lacivert Kurumsal Bant)
    c.setFillColorRGB(0.06, 0.12, 0.25)
    c.rect(0, h - 32 * mm, w, 32 * mm, fill=1, stroke=0)

    c.setFillColorRGB(1, 1, 1)
    c.setFont(FONT_BOLD, 18)
    c.drawString(20 * mm, h - 16 * mm, pharmacy_name.upper())

    c.setFont(FONT_REGULAR, 10)
    c.drawString(20 * mm, h - 24 * mm, f"Tel: {phone}   |   GÜN SONU KAPANIŞ VE Z-RAPORU")

    z_id = f"Z-{today_str.replace('-', '')}-001"
    c.drawRightString(w - 20 * mm, h - 16 * mm, f"Rapor No: {z_id}")
    c.drawRightString(w - 20 * mm, h - 24 * mm, f"Tarih: {display_date}  {now_time}")

    # Özet KPI Kartları
    y = h - 48 * mm
    card_w = (w - 46 * mm) / 3
    card_h = 24 * mm

    # Kart 1: Toplam Etiket
    c.setFillColorRGB(0.95, 0.97, 1.0)
    c.roundRect(20 * mm, y - card_h, card_w, card_h, 3 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0.1, 0.3, 0.7)
    c.setFont(FONT_BOLD, 9)
    c.drawString(25 * mm, y - 8 * mm, "TOPLAM BASILAN ETİKET")
    c.setFont(FONT_BOLD, 16)
    c.drawString(25 * mm, y - 18 * mm, f"{today_count} Adet")

    # Kart 2: Günlük Ciro
    c.setFillColorRGB(0.93, 0.98, 0.94)
    c.roundRect(20 * mm + card_w + 3 * mm, y - card_h, card_w, card_h, 3 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0.05, 0.5, 0.2)
    c.setFont(FONT_BOLD, 9)
    c.drawString(25 * mm + card_w + 3 * mm, y - 8 * mm, "GÜNLÜK TAHMİNİ CİRO")
    c.setFont(FONT_BOLD, 16)
    c.drawString(25 * mm + card_w + 3 * mm, y - 18 * mm, f"₺ {today_turnover:,.2f}")

    # Kart 3: Kritik Stok
    c.setFillColorRGB(1.0, 0.95, 0.95)
    c.roundRect(20 * mm + 2 * (card_w + 3 * mm), y - card_h, card_w, card_h, 3 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0.7, 0.1, 0.1)
    c.setFont(FONT_BOLD, 9)
    c.drawString(25 * mm + 2 * (card_w + 3 * mm), y - 8 * mm, "KRİTİK / SKT UYARILARI")
    c.setFont(FONT_BOLD, 14)
    c.drawString(25 * mm + 2 * (card_w + 3 * mm), y - 18 * mm, f"{stock_al['expired_count']} SKT / {stock_al['low_stock_count']} Stok")

    # 1. Bölüm: En Çok Basılan İlaçlar
    y -= 38 * mm
    c.setFillColorRGB(0.1, 0.15, 0.25)
    c.setFont(FONT_BOLD, 12)
    c.drawString(20 * mm, y, "🏆 Bugün En Çok Verilen İlaçlar")
    y -= 4 * mm
    c.setLineWidth(0.8)
    c.setStrokeColorRGB(0.8, 0.85, 0.9)
    c.line(20 * mm, y, w - 20 * mm, y)
    y -= 8 * mm

    if not top_today_drugs:
        c.setFont(FONT_REGULAR, 9)
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.drawString(25 * mm, y, "Bugün henüz etiket kaydı bulunmuyor.")
        y -= 8 * mm
    else:
        for idx, (drug, count) in enumerate(top_today_drugs, 1):
            c.setFont(FONT_REGULAR, 9.5)
            c.setFillColorRGB(0.1, 0.1, 0.1)
            c.drawString(25 * mm, y, f"{idx}. {drug}")
            c.setFont(FONT_BOLD, 9.5)
            c.drawRightString(w - 25 * mm, y, f"{count} adet")
            y -= 6 * mm

    # 2. Bölüm: Personel Aktivitesi
    y -= 8 * mm
    c.setFillColorRGB(0.1, 0.15, 0.25)
    c.setFont(FONT_BOLD, 12)
    c.drawString(20 * mm, y, "👤 Personel İşlem Dağılımı")
    y -= 4 * mm
    c.line(20 * mm, y, w - 20 * mm, y)
    y -= 8 * mm

    if not top_today_staff:
        c.setFont(FONT_REGULAR, 9)
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.drawString(25 * mm, y, "Personel kaydı bulunmuyor.")
        y -= 8 * mm
    else:
        for idx, (staff_name, count) in enumerate(top_today_staff, 1):
            c.setFont(FONT_REGULAR, 9.5)
            c.setFillColorRGB(0.1, 0.1, 0.1)
            c.drawString(25 * mm, y, f"• {staff_name}")
            c.setFont(FONT_BOLD, 9.5)
            c.drawRightString(w - 25 * mm, y, f"{count} işlem")
            y -= 6 * mm

    # İmzalar ve Onay Kutusu
    y_sign = 50 * mm
    c.setFillColorRGB(0.98, 0.98, 0.98)
    c.roundRect(20 * mm, y_sign - 30 * mm, w - 40 * mm, 32 * mm, 3 * mm, fill=1, stroke=0)

    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont(FONT_BOLD, 9.5)
    c.drawString(30 * mm, y_sign - 8 * mm, "Mesul Müdür / Eczacı Onayı:")
    c.drawString(w - 95 * mm, y_sign - 8 * mm, "Eczane Kaşe & Mühür:")

    c.setLineWidth(0.5)
    c.setDash(2, 2)
    c.rect(w - 95 * mm, y_sign - 26 * mm, 65 * mm, 14 * mm, fill=0, stroke=1)
    c.setDash()

    # Alt Bilgi
    c.setFont(FONT_REGULAR, 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(w / 2, 14 * mm, "Eczane İlaç Etiketi & POS Otomasyonu - Günlük Kapanış Resmi Raporudur.")

    c.save()
    return filename
