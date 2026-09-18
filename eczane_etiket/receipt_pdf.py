"""Yazdırılabilir Eczane Satış Fişi / İlaç Teslim Makbuzu Motoru (ReportLab).

Termal 80mm POS rulo kâğıdı ve A4 Eczane Teslim Makbuzu formatlarında
yüksek kaliteli, Türkçe karakter destekli PDF satış fişi ve makbuz üretir.
"""

import datetime as _dt
import os
import uuid
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

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


def build_receipt_pdf(
    filename: str,
    profile: dict,
    items: List[dict],
    patient_name: str = "",
    receipt_no: Optional[str] = None,
    format_type: str = "thermal_80",
    staff_name: str = "",
    notes: str = "",
) -> str:
    """Satış fişi / makbuz PDF'i oluşturur.
    
    items: list of dicts with keys:
      - name: str (İlaç adı)
      - instructions: str (Doz/kullanım)
      - quantity: int
      - price: float (Birim fiyat ₺)
    """
    _register_fonts()
    pharmacy_name = profile.get("name") or "ECZANE"
    phone = profile.get("phone") or ""
    now = _dt.datetime.now()
    date_str = now.strftime("%d.%m.%Y %H:%M")
    rcp_id = receipt_no or f"RCP-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    if format_type == "thermal_80":
        return _build_thermal_receipt(
            filename, pharmacy_name, phone, items, patient_name, rcp_id, date_str, staff_name, notes
        )
    else:
        return _build_a4_receipt(
            filename, pharmacy_name, phone, items, patient_name, rcp_id, date_str, staff_name, notes
        )


def _build_thermal_receipt(
    filename: str,
    pharmacy_name: str,
    phone: str,
    items: List[dict],
    patient_name: str,
    rcp_id: str,
    date_str: str,
    staff_name: str,
    notes: str,
) -> str:
    width = 80 * mm
    # Dinamik yükseklik: minimum 140mm + her ürün için ~15mm
    height = max(160 * mm, (120 + len(items) * 16) * mm)

    c = canvas.Canvas(filename, pagesize=(width, height))
    margin = 4 * mm
    printable_w = width - (2 * margin)
    y = height - 8 * mm

    # Eczane Başlığı
    c.setFont(FONT_BOLD, 12)
    c.drawCentredString(width / 2, y, pharmacy_name.upper())
    y -= 4.5 * mm

    if phone:
        c.setFont(FONT_REGULAR, 8)
        c.drawCentredString(width / 2, y, f"Tel: {phone}")
        y -= 4 * mm

    c.setFont(FONT_BOLD, 9)
    c.drawCentredString(width / 2, y, "İLAÇ TESLİM VE SATIŞ FİŞİ")
    y -= 3.5 * mm

    # Ayırıcı çizgi
    c.setLineWidth(0.8)
    c.setDash(2, 2)
    c.line(margin, y, width - margin, y)
    c.setDash()
    y -= 4.5 * mm

    # Fiş Bilgileri
    c.setFont(FONT_REGULAR, 7.5)
    c.drawString(margin, y, f"Fiş No: {rcp_id}")
    y -= 3.5 * mm
    c.drawString(margin, y, f"Tarih : {date_str}")
    y -= 3.5 * mm
    if patient_name:
        c.setFont(FONT_BOLD, 7.5)
        c.drawString(margin, y, f"Hasta : {patient_name.upper()}")
        y -= 3.5 * mm
    if staff_name:
        c.setFont(FONT_REGULAR, 7.5)
        c.drawString(margin, y, f"Personel: {staff_name}")
        y -= 3.5 * mm

    # Tablo Başlığı
    y -= 2 * mm
    c.setLineWidth(0.6)
    c.line(margin, y, width - margin, y)
    y -= 3.5 * mm
    c.setFont(FONT_BOLD, 7.5)
    c.drawString(margin, y, "İlaç / Doz")
    c.drawRightString(margin + printable_w * 0.72, y, "Adet")
    c.drawRightString(width - margin, y, "Tutar (TL)")
    y -= 1.5 * mm
    c.line(margin, y, width - margin, y)
    y -= 4 * mm

    total_amount = 0.0

    # Ürün Satırları
    for item in items:
        name = item.get("name", "İlaç")
        qty = item.get("quantity", 1)
        price = float(item.get("price", 95.0))
        subtotal = qty * price
        total_amount += subtotal

        c.setFont(FONT_BOLD, 7.5)
        # Uzun isimleri kırp
        disp_name = name[:26] + ".." if len(name) > 28 else name
        c.drawString(margin, y, disp_name)
        c.drawRightString(margin + printable_w * 0.72, y, f"{qty}")
        c.drawRightString(width - margin, y, f"{subtotal:,.2f}")
        y -= 3.5 * mm

        instr = item.get("instructions", "").strip()
        if instr:
            c.setFont(FONT_REGULAR, 6.5)
            disp_instr = instr[:34] + ".." if len(instr) > 36 else instr
            c.drawString(margin + 2 * mm, y, f"↳ {disp_instr}")
            y -= 3.5 * mm

    # Toplam Alanı
    y -= 1 * mm
    c.setDash(2, 2)
    c.line(margin, y, width - margin, y)
    c.setDash()
    y -= 5 * mm

    c.setFont(FONT_BOLD, 9)
    c.drawString(margin, y, "GENEL TOPLAM:")
    c.drawRightString(width - margin, y, f"{total_amount:,.2f} TL")
    y -= 4 * mm

    c.setFont(FONT_REGULAR, 7)
    c.drawString(margin, y, "Hasta Katılım Payı (KDV Dahil)")
    y -= 5 * mm

    if notes:
        c.setFont(FONT_REGULAR, 6.5)
        c.drawString(margin, y, f"Not: {notes}")
        y -= 4 * mm

    # Alt Bilgilendirme
    c.setLineWidth(0.4)
    c.line(margin, y, width - margin, y)
    y -= 4 * mm
    c.setFont(FONT_REGULAR, 6.5)
    c.drawCentredString(width / 2, y, "İlaçlarınızı hekiminizin tarif ettiği şekilde kullanınız.")
    y -= 3 * mm
    c.drawCentredString(width / 2, y, "Bizi tercih ettiğiniz için teşekkür ederiz.")
    y -= 3 * mm
    c.setFont(FONT_BOLD, 7)
    c.drawCentredString(width / 2, y, "SAĞLIKLI GÜNLER DİLERİZ")

    c.save()
    return filename


def _build_a4_receipt(
    filename: str,
    pharmacy_name: str,
    phone: str,
    items: List[dict],
    patient_name: str,
    rcp_id: str,
    date_str: str,
    staff_name: str,
    notes: str,
) -> str:
    c = canvas.Canvas(filename, pagesize=A4)
    w, h = A4

    # Üst Banner (Lacivert)
    c.setFillColorRGB(0.06, 0.12, 0.25)
    c.rect(0, h - 30 * mm, w, 30 * mm, fill=1, stroke=0)

    c.setFillColorRGB(1, 1, 1)
    c.setFont(FONT_BOLD, 18)
    c.drawString(20 * mm, h - 16 * mm, pharmacy_name.upper())

    c.setFont(FONT_REGULAR, 10)
    c.drawString(20 * mm, h - 23 * mm, f"Tel: {phone}   |   Eczane İlaç Teslim & Satış Makbuzu")

    c.drawRightString(w - 20 * mm, h - 16 * mm, f"Makbuz No: {rcp_id}")
    c.drawRightString(w - 20 * mm, h - 23 * mm, f"Tarih: {date_str}")

    # Hasta & İşlem Kartı
    y = h - 45 * mm
    c.setFillColorRGB(0.96, 0.97, 0.98)
    c.roundRect(20 * mm, y - 18 * mm, w - 40 * mm, 24 * mm, 3 * mm, fill=1, stroke=0)

    c.setFillColorRGB(0.1, 0.15, 0.25)
    c.setFont(FONT_BOLD, 11)
    c.drawString(25 * mm, y, f"Hasta Adı / Soyadı: {patient_name.upper() if patient_name else '(Perakende / Belirtilmemiş)'}")
    c.drawString(w / 2 + 10 * mm, y, f"İşlemi Yapan: {staff_name if staff_name else 'Eczacı'}")

    # Tablo Başlığı
    y -= 26 * mm
    c.setFont(FONT_BOLD, 10)
    c.setFillColorRGB(0.2, 0.3, 0.4)
    c.drawString(22 * mm, y, "S.No")
    c.drawString(32 * mm, y, "İlaç Adı ve Formu")
    c.drawString(100 * mm, y, "Kullanım Şekli ve Doz")
    c.drawRightString(150 * mm, y, "Adet")
    c.drawRightString(w - 22 * mm, y, "Tutar (TL)")

    c.setLineWidth(1)
    c.setStrokeColorRGB(0.8, 0.85, 0.9)
    c.line(20 * mm, y - 2 * mm, w - 20 * mm, y - 2 * mm)
    y -= 8 * mm

    total_amount = 0.0

    for idx, item in enumerate(items, 1):
        name = item.get("name", "İlaç")
        qty = item.get("quantity", 1)
        price = float(item.get("price", 95.0))
        subtotal = qty * price
        total_amount += subtotal
        instr = item.get("instructions", "-")

        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont(FONT_REGULAR, 9)
        c.drawString(22 * mm, y, f"{idx}")
        c.setFont(FONT_BOLD, 9)
        c.drawString(32 * mm, y, name[:38])
        c.setFont(FONT_REGULAR, 8.5)
        c.drawString(100 * mm, y, instr[:35])
        c.drawRightString(150 * mm, y, f"{qty}")
        c.setFont(FONT_BOLD, 9)
        c.drawRightString(w - 22 * mm, y, f"{subtotal:,.2f}")

        y -= 4 * mm
        c.setLineWidth(0.3)
        c.setStrokeColorRGB(0.9, 0.92, 0.95)
        c.line(20 * mm, y, w - 20 * mm, y)
        y -= 5 * mm

        if y < 60 * mm:
            break

    # Genel Toplam Kutusu
    y_tot = max(y - 5 * mm, 55 * mm)
    c.setFillColorRGB(0.94, 0.97, 1.0)
    c.roundRect(w - 90 * mm, y_tot - 20 * mm, 70 * mm, 22 * mm, 3 * mm, fill=1, stroke=0)

    c.setFillColorRGB(0.1, 0.2, 0.4)
    c.setFont(FONT_REGULAR, 9)
    c.drawString(w - 85 * mm, y_tot - 6 * mm, "Toplam İlaç Adedi:")
    c.drawRightString(w - 25 * mm, y_tot - 6 * mm, f"{len(items)}")

    c.setFont(FONT_BOLD, 12)
    c.setFillColorRGB(0.05, 0.4, 0.2)
    c.drawString(w - 85 * mm, y_tot - 14 * mm, "ÖDENECEK TUTAR:")
    c.drawRightString(w - 25 * mm, y_tot - 14 * mm, f"{total_amount:,.2f} TL")

    # Kaşe / İmza Kutusu
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont(FONT_REGULAR, 8.5)
    c.drawString(25 * mm, y_tot - 6 * mm, "Teslim Eden Eczacı Kaşe / İmza:")
    c.setLineWidth(0.5)
    c.setDash(2, 2)
    c.rect(25 * mm, y_tot - 22 * mm, 50 * mm, 14 * mm, fill=0, stroke=1)
    c.setDash()

    # Alt Bilgi
    c.setFont(FONT_REGULAR, 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(w / 2, 16 * mm, "Bu makbuz eczanemiz tarafından bilgilendirme ve teslim amacıyla tanzim edilmiştir.")
    c.drawCentredString(w / 2, 12 * mm, "Sağlıklı günler dileriz.")

    c.save()
    return filename
