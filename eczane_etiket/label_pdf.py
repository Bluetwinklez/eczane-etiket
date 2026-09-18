"""Etiket PDF üretimi ve yazdırma.

Sayfa düzeni, kullanıcının referans gösterdiği piyasa eczane etiketinden
esinlenilen "banner" stilini takip eder: üst satır (ilaç + ambalaj + tarih),
koyu bant (tedavi amacı/tanı), kalın büyük ana talimat, normal punto detay
paragrafı, alt koyu bant (eczane adı + telefon). Adres YOK, emoji YOK.

Türkçe karakterler (ı, İ, ş, Ş, ğ, Ğ) standart PDF fontlarında (Helvetica)
doğru basılmadığından, `fonts/` altında gömülü DejaVu Sans kullanılır —
bu sayede yazıcı çıktısı, kullanıcının bilgisayarında hangi fontların
kurulu olduğundan bağımsız olarak her zaman doğru görünür.
"""

import datetime as _dt
import os
import platform
import subprocess
from dataclasses import dataclass
from typing import Optional

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

BANNER_COLOR = (0.10, 0.16, 0.30)  # koyu lacivert
WHITE = (1, 1, 1)
BLACK = (0, 0, 0)

DOZ_ZAMANI_KELIMELERI = ["sabah", "öğle", "ogle", "akşam", "aksam", "gece"]

LABEL_SIZES_MM = {
    "thermal_50x30": (50, 30),
    "thermal_60x40": (60, 40),
    "thermal_80x50": (80, 50),
}

# QR kod yalnızca A4 ızgara şablonunda gösterilir — küçük termal etiketlerde
# (50x30/60x40mm) okunabilir boyutta bir QR koda yetecek yer yoktur ve
# eklenirse etiket metni "büyük ve düzensiz" görünür (bkz. kullanıcı geri
# bildirimi). A4'te ise her hücre metin + QR için iki sütuna bölünür.
QR_COLUMN_WIDTH = 24 * mm
QR_MAX_SIZE = 20 * mm

_FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def _register_turkish_fonts() -> None:
    """Türkçe karakterleri tam destekleyen DejaVu Sans fontunu kaydeder.

    Font dosyaları (beklenmedik şekilde) bulunamazsa sessizce standart
    Helvetica'ya düşer — program yine çalışır, sadece ı/ş/ğ gibi harfler
    hatalı görünebilir.
    """
    global FONT_REGULAR, FONT_BOLD
    regular_path = os.path.join(_FONTS_DIR, "DejaVuSans.ttf")
    bold_path = os.path.join(_FONTS_DIR, "DejaVuSans-Bold.ttf")
    try:
        pdfmetrics.registerFont(TTFont("TurkishSans", regular_path))
        pdfmetrics.registerFont(TTFont("TurkishSans-Bold", bold_path))
        FONT_REGULAR = "TurkishSans"
        FONT_BOLD = "TurkishSans-Bold"
    except Exception:
        FONT_REGULAR = "Helvetica"
        FONT_BOLD = "Helvetica-Bold"


_register_turkish_fonts()


@dataclass
class LabelEntry:
    drug_name: str
    package_info: str = ""
    kullanim_amaci_tani: Optional[str] = None
    instructions: str = ""
    detail_note: Optional[str] = None
    storage_note: Optional[str] = None
    patient_name: Optional[str] = None
    patient_note: Optional[str] = None
    end_date: Optional[str] = None
    refill_date: Optional[str] = None
    dose_grid: Optional[dict] = None
    print_dose_grid: bool = False
    staff_name: Optional[str] = None
    warning_tags: Optional[list] = None
    print_barcode: bool = False
    barcode_value: Optional[str] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    copies: int = 1


def _draw_dose_grid(c: canvas.Canvas, x: float, y: float, w: float, h: float, grid: dict) -> None:
    """4 sütunlu (SABAH | ÖĞLE | AKŞAM | GECE) görsel doz çizelgesi tablosu çizer."""
    cols = ["SABAH", "ÖĞLE", "AKŞAM", "GECE"]
    keys = ["sabah", "öğle", "akşam", "gece"]
    col_w = w / 4.0

    c.setStrokeColorRGB(0.60, 0.65, 0.75)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, fill=0, stroke=1)

    mid_y = y + h * 0.44
    c.line(x, mid_y, x + w, mid_y)

    for i in range(1, 4):
        c.line(x + i * col_w, y, x + i * col_w, y + h)

    c.setFont(FONT_BOLD, 3.8)
    c.setFillColorRGB(0.20, 0.25, 0.35)
    header_y = mid_y + (h * 0.56 - 3.8) / 2 + 0.3
    for i, col_name in enumerate(cols):
        tw = c.stringWidth(col_name, FONT_BOLD, 3.8)
        c.drawString(x + i * col_w + (col_w - tw) / 2, header_y, col_name)

    c.setFont(FONT_BOLD, 4.8)
    c.setFillColorRGB(*BLACK)
    val_y = y + (h * 0.44 - 4.8) / 2 + 0.5
    for i, key in enumerate(keys):
        val = str(grid.get(key, "-")).strip() if grid else "-"
        tw = c.stringWidth(val, FONT_BOLD, 4.8)
        c.drawString(x + i * col_w + (col_w - tw) / 2, val_y, val)


def _vurgula_doz_zamani(text: str) -> str:
    """Sabah/öğle/akşam gibi doz zamanı kelimelerini büyük harfle vurgular (emoji yok)."""
    words = text.split(" ")
    out = []
    for w in words:
        stripped = w.strip(",.;:")
        if stripped.casefold() in DOZ_ZAMANI_KELIMELERI:
            out.append(w.upper())
        else:
            out.append(w)
    return " ".join(out)


def _wrap_text(c: canvas.Canvas, text: str, font_name: str, font_size: float, max_width: float) -> list:
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if c.stringWidth(candidate, font_name, font_size) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _draw_banner(c: canvas.Canvas, x: float, y: float, width: float, height: float, text: str, font_size: float) -> None:
    c.setFillColorRGB(*BANNER_COLOR)
    c.rect(x, y, width, height, fill=1, stroke=0)
    c.setFillColorRGB(*WHITE)
    display_text = text.upper()
    while c.stringWidth(display_text, FONT_BOLD, font_size) > width - 4 * mm and font_size > 4:
        font_size -= 0.5
    c.setFont(FONT_BOLD, font_size)
    text_width = c.stringWidth(display_text, FONT_BOLD, font_size)
    c.drawString(x + (width - text_width) / 2, y + height / 2 - font_size / 3, display_text)
    c.setFillColorRGB(*BLACK)


def _draw_single_label(c: canvas.Canvas, ox: float, oy: float, w: float, h: float, profile: dict, entry: LabelEntry) -> None:
    """(ox, oy) sol-alt köşe olacak şekilde w x h boyutundaki alana tek bir etiket çizer."""
    pad = 1.5 * mm
    cursor_y = oy + h - pad

    header = entry.drug_name
    if entry.package_info:
        header = f"{entry.drug_name} {entry.package_info}"
    date_str = _dt.datetime.now().strftime("%d.%m.%Y %H:%M")
    if entry.end_date:
        date_str += f"  Bitiş: {entry.end_date}"
    if entry.refill_date:
        date_str += f"  Tekrar: {entry.refill_date}"

    footer_h = 3.6 * mm
    footer_top = oy + pad * 0.5 + footer_h + 1.3  # bu çizginin üstüne taşılmaz

    # Üst satır: hasta adı (varsa)
    if entry.patient_name:
        size = 4.5
        c.setFont(FONT_REGULAR, size)
        c.drawString(ox + pad, cursor_y - size, "Hasta: " + entry.patient_name)
        cursor_y -= (size + 1.0)

    # Hasta notu / bilinen alerji (varsa) — bilgi amaçlıdır, otomatik kontrol yapılmaz.
    if entry.patient_note:
        size = 4.3
        note_text = "Not: " + entry.patient_note
        while c.stringWidth(note_text, FONT_BOLD, size) > w - pad * 2 and len(note_text) > 5:
            note_text = note_text[:-2] + "…"
        c.setFont(FONT_BOLD, size)
        c.drawString(ox + pad, cursor_y - size, note_text)
        cursor_y -= (size + 1.0)

    # Üst satır: ilaç adı (sola) + tarih (sağa)
    date_font_size = 4.3
    date_width = c.stringWidth(date_str, FONT_REGULAR, date_font_size)
    header_font_size = 6
    max_header_width = w - pad * 2 - date_width - 2 * mm
    while c.stringWidth(header, FONT_BOLD, header_font_size) > max_header_width and header_font_size > 4:
        header_font_size -= 0.5
    c.setFont(FONT_BOLD, header_font_size)
    c.drawString(ox + pad, cursor_y - header_font_size, header)
    c.setFont(FONT_REGULAR, date_font_size)
    c.drawString(ox + w - pad - date_width, cursor_y - header_font_size, date_str)
    cursor_y -= (header_font_size + 1.4)

    # Koyu bant: kullanım amacı / tanı — "NEDEN kullanılır" (kısa)
    if entry.kullanim_amaci_tani:
        banner_h = 3.6 * mm
        cursor_y -= banner_h
        _draw_banner(c, ox + pad, cursor_y, w - pad * 2, banner_h, entry.kullanim_amaci_tani, 5.2)
        cursor_y -= 1.0

    # Özel Eczane Uyarı Etiketleri (Varsa: Çalkalayınız, Uyku Yapabilir vb.)
    if entry.warning_tags:
        w_text = "⚠️ " + " • ".join(entry.warning_tags)
        c.setFillColorRGB(0.80, 0.12, 0.12)
        c.setFont(FONT_BOLD, 4.3)
        w_lines = _wrap_text(c, w_text, FONT_BOLD, 4.3, w - pad * 2)
        for line in w_lines[:2]:
            cursor_y -= 4.3
            c.drawString(ox + pad, cursor_y, line)
            cursor_y -= 0.4
        cursor_y -= 0.5
        c.setFillColorRGB(*BLACK)

    # Neden kullanıldığının uzun anlatımı (kısa prospektüs / ek not) —
    # talimattan ÖNCE gelir, yer açmak için en fazla 2 satırla sınırlanır.
    if entry.detail_note:
        font_size = 4.3
        lines = _wrap_text(c, entry.detail_note, FONT_REGULAR, font_size, w - pad * 2)
        c.setFont(FONT_REGULAR, font_size)
        max_lines = 2
        for i, line in enumerate(lines[:max_lines]):
            if i == max_lines - 1 and len(lines) > max_lines:
                while c.stringWidth(line + "…", FONT_REGULAR, font_size) > w - pad * 2 and len(line) > 1:
                    line = line[:-1]
                line += "…"
            cursor_y -= font_size
            c.drawString(ox + pad, cursor_y, line)
            cursor_y -= 0.4
        cursor_y -= 0.6

    # Ana talimat (kalın, büyük, vurgulu) — "NASIL kullanılır"; gerekirse sığana kadar küçültülür
    if entry.instructions:
        instr = _vurgula_doz_zamani(entry.instructions.upper())
        font_size = 5.8
        while font_size > 4:
            lines = _wrap_text(c, instr, FONT_BOLD, font_size, w - pad * 2)
            if len(lines) <= 3 or font_size <= 4:
                break
            font_size -= 0.3
        c.setFont(FONT_BOLD, font_size)
        for line in lines:
            cursor_y -= font_size
            line_width = c.stringWidth(line, FONT_BOLD, font_size)
            c.drawString(ox + (w - line_width) / 2, cursor_y, line)
        cursor_y -= 1.0

    # Görsel Doz Çizelgesi Tablosu (SABAH | ÖĞLE | AKŞAM | GECE)
    if entry.print_dose_grid and entry.dose_grid:
        grid_h = 3.8 * mm
        if cursor_y - grid_h > footer_top:
            cursor_y -= grid_h
            _draw_dose_grid(c, ox + pad, cursor_y, w - pad * 2, grid_h, entry.dose_grid)
            cursor_y -= 0.6

    # Saklama koşulu — alt banta taşmayacak kadar satır basılır
    if entry.storage_note:
        font_size = 4
        text = "Saklama: " + entry.storage_note
        lines = _wrap_text(c, text, FONT_REGULAR, font_size, w - pad * 2)
        c.setFont(FONT_REGULAR, font_size)
        for line in lines:
            if cursor_y - font_size < footer_top:
                break
            cursor_y -= font_size
            c.drawString(ox + pad, cursor_y, line)
            cursor_y -= 0.3

    # İsteğe bağlı Barkod Basımı (Code128)
    if entry.print_barcode and entry.barcode_value:
        try:
            from reportlab.graphics.barcode import createBarcodeDrawing
            bw = min(30 * mm, w - pad * 2)
            bh = 3.6 * mm
            if cursor_y - bh > footer_top:
                clean_val = "".join(ch for ch in str(entry.barcode_value) if ch.isalnum())[:20]
                if clean_val:
                    b_drawing = createBarcodeDrawing("Code128", value=clean_val, width=bw, height=bh, humanReadable=False)
                    cursor_y -= (bh + 0.5)
                    bx = ox + (w - bw) / 2
                    renderPDF.draw(b_drawing, c, bx, cursor_y)
        except Exception:
            pass

    # İsteğe bağlı Parti No ve SKT (Karekoddan gelen)
    lot_exp = []
    if entry.lot_number:
        lot_exp.append(f"Parti: {entry.lot_number}")
    if entry.expiry_date:
        lot_exp.append(f"SKT: {entry.expiry_date}")
    if lot_exp and cursor_y - 4.5 > footer_top:
        lot_str = "  |  ".join(lot_exp)
        c.setFont(FONT_REGULAR, 4.0)
        c.setFillColorRGB(0.35, 0.40, 0.50)
        c.drawString(ox + pad, cursor_y - 4.0, lot_str)
        c.setFillColorRGB(*BLACK)
        cursor_y -= 4.5

    # Alt koyu bant: SADECE eczane adı + telefon numarası (Eczanem yok, personel yok)
    footer_text = format_label_footer(profile)
    if footer_text:
        _draw_banner(c, ox + pad, oy + pad * 0.5, w - pad * 2, footer_h, footer_text, 5.2)


def format_label_footer(profile: dict) -> str:
    """Etiket alt koyu bandı için SADECE eczane adı ve telefon numarasını döndürür.
    
    'Eczanem' veya 'ECZANEM' gibi jenerik varsayılanlar gösterilmez.
    Personel adı vb. eklenmez, sadece eczane adı ve telefon numarası yer alır.
    """
    if not profile:
        return ""
    name = (profile.get("name") or "").strip()
    if name.lower() in ("eczanem", "eczane"):
        name = ""
    phone = (profile.get("phone") or "").strip()

    parts = []
    if name:
        parts.append(name)
    if phone:
        parts.append(phone)
    return "  /  ".join(parts)


def _qr_payload(entry: LabelEntry) -> str:
    """QR koda gömülecek metni oluşturur.

    Herhangi bir sunucuya/internete bağlanmaz — QR tamamen çevrimdışı,
    telefonun kamerasıyla okutulduğunda doğrudan bu metni (ilaç adı +
    kısa bilgiler) gösterir; bir web adresine yönlendirmez.
    """
    parts = [entry.drug_name]
    if entry.kullanim_amaci_tani:
        parts.append(entry.kullanim_amaci_tani)
    if entry.detail_note:
        parts.append(entry.detail_note)
    if entry.instructions:
        parts.append(entry.instructions)
    return "\n".join(p for p in parts if p)[:500]


def _draw_qr_code(c: canvas.Canvas, x: float, y: float, size: float, payload: str) -> None:
    if not payload.strip() or size <= 0:
        return
    widget = QrCodeWidget(payload)
    bounds = widget.getBounds()
    native_w = bounds[2] - bounds[0]
    native_h = bounds[3] - bounds[1]
    if native_w <= 0 or native_h <= 0:
        return
    drawing = Drawing(size, size, transform=[size / native_w, 0, 0, size / native_h, 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, c, x, y)


def build_label_pdf(profile: dict, entries: list, output_path: str) -> str:
    """entries: list[LabelEntry]. Toplu mod için birden fazla ilaç/etiket taşıyabilir.

    Her `entry.copies` kadar tekrarlanır. `profile["label_template"]`'e göre
    sayfa boyutu belirlenir. Dönüş: yazılan PDF dosyasının yolu.
    """
    template = profile.get("label_template", "thermal_50x30")
    expanded_entries = []
    for entry in entries:
        expanded_entries.extend([entry] * max(1, entry.copies))

    if template == "a4_grid_6":
        _build_a4_grid_pdf(profile, expanded_entries, output_path)
    else:
        size_mm = LABEL_SIZES_MM.get(template, LABEL_SIZES_MM["thermal_50x30"])
        _build_thermal_pdf(profile, expanded_entries, output_path, size_mm)
    return output_path


def _build_thermal_pdf(profile: dict, entries: list, output_path: str, size_mm: tuple) -> None:
    w, h = size_mm[0] * mm, size_mm[1] * mm
    c = canvas.Canvas(output_path, pagesize=(w, h))
    for entry in entries:
        _draw_single_label(c, 0, 0, w, h, profile, entry)
        c.showPage()
    c.save()


A4_CONTENT_HEIGHT = 48 * mm  # her etiketin içerik yüksekliği (hücre bundan uzun olsa da içerik üstte kalır)


def _build_a4_grid_pdf(profile: dict, entries: list, output_path: str) -> None:
    page_w, page_h = A4
    cols, rows = 2, 3
    margin = 8 * mm
    cell_w = (page_w - 2 * margin) / cols
    cell_h = (page_h - 2 * margin) / rows
    content_h = min(cell_h - 4 * mm, A4_CONTENT_HEIGHT)

    # QR açıksa hücre metin+QR olmak üzere iki sütuna bölünür; metin alanı
    # otomatik olarak daralır (_draw_single_label zaten metni verilen
    # genişliğe göre küçültüp sarmalıyor), böylece hiçbir zaman QR ile üst
    # üste binmez.
    qr_enabled = bool(profile.get("qr_enabled"))
    qr_col = QR_COLUMN_WIDTH if qr_enabled else 0
    text_w = cell_w - 4 * mm - qr_col

    c = canvas.Canvas(output_path, pagesize=A4)
    for i, entry in enumerate(entries):
        idx_in_page = i % (cols * rows)
        if i > 0 and idx_in_page == 0:
            c.showPage()
        col = idx_in_page % cols
        row = idx_in_page // cols
        ox = margin + col * cell_w
        cell_top = page_h - margin - row * cell_h
        # İçerik hücrenin ÜSTÜNE hizalanır (sabit yükseklik) — hücre daha uzun
        # olsa bile etiket gereksiz uzamaz, altında boş kesim payı kalır.
        oy = cell_top - 2 * mm - content_h
        _draw_single_label(c, ox + 2 * mm, oy, text_w, content_h, profile, entry)
        if qr_enabled:
            payload = _qr_payload(entry)
            qr_size = min(QR_MAX_SIZE, content_h - 4 * mm, qr_col - 4 * mm)
            qr_x = ox + 2 * mm + text_w + (qr_col - qr_size) / 2
            qr_y = oy + (content_h - qr_size) / 2
            _draw_qr_code(c, qr_x, qr_y, qr_size, payload)
        c.setStrokeColorRGB(0.75, 0.75, 0.75)
        c.rect(ox + 2 * mm, oy, cell_w - 4 * mm, content_h, fill=0, stroke=1)
    c.save()


def get_system_printers() -> list:
    """İşletim sisteminde kurulu yazıcıların adlarını döndürür."""
    system = platform.system()
    printers = []
    try:
        if system == "Windows":
            cmd = ["powershell", "-NoProfile", "-NonInteractive", "-Command",
                   "(Get-CimInstance Win32_Printer).Name"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    line = line.strip()
                    if line and line not in printers:
                        printers.append(line)
        elif system in ("Darwin", "Linux"):
            res = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    parts = line.split()
                    if parts and parts[0] not in printers:
                        printers.append(parts[0])
    except Exception:
        pass
    return printers


def print_pdf(path: str, printer_name: Optional[str] = None) -> tuple:
    """Platforma göre PDF'i yazıcıya gönderir. (success: bool, error: str|None) döner."""
    try:
        system = platform.system()
        if system == "Windows":
            if printer_name:
                import ctypes
                ret = ctypes.windll.shell32.ShellExecuteW(None, "printto", path, f'"{printer_name}"', None, 0)
                if ret <= 32:
                    os.startfile(path, "print")  # type: ignore[attr-defined]
            else:
                os.startfile(path, "print")  # type: ignore[attr-defined]
        elif system == "Darwin":
            cmd = ["lpr"]
            if printer_name:
                cmd.extend(["-P", printer_name])
            cmd.append(path)
            subprocess.run(cmd, check=True)
        else:
            cmd = ["lp"]
            if printer_name:
                cmd.extend(["-d", printer_name])
            cmd.append(path)
            subprocess.run(cmd, check=True)
        return True, None
    except Exception as exc:  # yazıcı yok/izin yok/komut bulunamadı vb.
        return False, str(exc)


def build_patient_schedule_pdf(
    patient_name: str,
    pharmacy_name: str,
    phone: str,
    entries: list[LabelEntry],
    output_path: str,
) -> None:
    output_path = str(output_path)
    page_w, page_h = A4
    c = canvas.Canvas(output_path, pagesize=A4)
    margin = 15 * mm
    usable_w = page_w - 2 * margin
    cursor_y = page_h - margin

    # 1. Başlık Banner (Eczane & Çizelge Adı)
    banner_h = 16 * mm
    c.setFillColorRGB(*BANNER_COLOR)
    c.rect(margin, cursor_y - banner_h, usable_w, banner_h, fill=1, stroke=0)

    c.setFillColorRGB(*WHITE)
    c.setFont(FONT_BOLD, 13)
    header_title = f"{pharmacy_name.upper()} — HASTA İLAÇ KULLANIM ÇİZELGESİ"
    c.drawCentredString(margin + usable_w / 2.0, cursor_y - 10 * mm, header_title)
    cursor_y -= (banner_h + 2 * mm)

    # 2. Üst Bilgi Kartı (Hasta Adı, Tarih, İletişim)
    info_card_h = 13 * mm
    c.setFillColorRGB(0.93, 0.96, 1.0)  # açık mavi
    c.setStrokeColorRGB(0.60, 0.78, 0.98)
    c.rect(margin, cursor_y - info_card_h, usable_w, info_card_h, fill=1, stroke=1)

    c.setFillColorRGB(0.08, 0.20, 0.40)
    c.setFont(FONT_BOLD, 10)
    display_patient = patient_name.strip().upper() if patient_name else "SAYIN HASTAMIZ"
    c.drawString(margin + 4 * mm, cursor_y - 5.5 * mm, f"HASTA: {display_patient}")

    c.setFont(FONT_REGULAR, 8.5)
    date_str = _dt.datetime.now().strftime("%d.%m.%Y")
    c.drawString(margin + 4 * mm, cursor_y - 10 * mm, f"Tarih: {date_str}   |   İletişim: {phone or 'Belirtilmedi'}")

    sub_note = "Bu çizelge ilaçlarınızı doğru zamanda ve dozda kullanmanızı kolaylaştırmak için hazırlanmıştır."
    c.drawRightString(margin + usable_w - 4 * mm, cursor_y - 8 * mm, sub_note)
    cursor_y -= (info_card_h + 4 * mm)

    # 3. İlaç Çizelge Tablosu
    col_widths = [55 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 40 * mm, 29 * mm]
    headers = ["İlaç Adı ve Ambalaj", "SABAH", "ÖĞLE", "AKŞAM", "GECE", "Kullanım Şekli & Zamanı", "Kullanım Amacı / SGK"]

    # Tablo Başlığı
    th_h = 7.5 * mm
    c.setFillColorRGB(0.15, 0.23, 0.38)
    c.rect(margin, cursor_y - th_h, usable_w, th_h, fill=1, stroke=0)

    cur_x = margin
    c.setFillColorRGB(*WHITE)
    c.setFont(FONT_BOLD, 7.5)
    for i, (col_w, h_text) in enumerate(zip(col_widths, headers)):
        if 1 <= i <= 4:
            c.drawCentredString(cur_x + col_w / 2.0, cursor_y - 5 * mm, h_text)
        else:
            c.drawString(cur_x + 2 * mm, cursor_y - 5 * mm, h_text)
        cur_x += col_w
    cursor_y -= th_h

    # Tablo Satırları
    row_h = 13.5 * mm
    for idx, entry in enumerate(entries):
        if cursor_y - row_h < margin + 35 * mm:
            c.showPage()
            cursor_y = page_h - margin

        bg_color = (0.98, 0.98, 0.99) if idx % 2 == 1 else (1.0, 1.0, 1.0)
        c.setFillColorRGB(*bg_color)
        c.setStrokeColorRGB(0.85, 0.88, 0.92)
        c.rect(margin, cursor_y - row_h, usable_w, row_h, fill=1, stroke=1)

        # Doz Grid Verisi
        grid = entry.dose_grid or {}
        if not grid and entry.instructions:
            from .data import parse_dose_grid
            grid = parse_dose_grid(entry.instructions)

        cur_x = margin
        # 1. İlaç Adı
        c.setFillColorRGB(0.10, 0.15, 0.25)
        c.setFont(FONT_BOLD, 8)
        drug_label = entry.drug_name
        if entry.package_info:
            drug_label += f" ({entry.package_info})"
        while c.stringWidth(drug_label, FONT_BOLD, 8) > col_widths[0] - 4 * mm and len(drug_label) > 10:
            drug_label = drug_label[:-3] + "…"
        c.drawString(cur_x + 2 * mm, cursor_y - 5.5 * mm, drug_label)

        if entry.patient_note:
            c.setFont(FONT_REGULAR, 6.5)
            c.setFillColorRGB(0.80, 0.20, 0.20)
            c.drawString(cur_x + 2 * mm, cursor_y - 10 * mm, f"Not: {entry.patient_note[:30]}")
        cur_x += col_widths[0]

        # 2-5. Sabah, Öğle, Akşam, Gece
        dose_keys = ["sabah", "öğle", "akşam", "gece"]
        for k in dose_keys:
            val = str(grid.get(k, "-"))
            if val != "-":
                c.setFillColorRGB(0.05, 0.35, 0.75)
                c.setFont(FONT_BOLD, 10.5)
            else:
                c.setFillColorRGB(0.65, 0.70, 0.78)
                c.setFont(FONT_REGULAR, 8.5)
            c.drawCentredString(cur_x + col_widths[1] / 2.0, cursor_y - 8 * mm, val)
            cur_x += col_widths[1]

        # 6. Kullanım Şekli & Zamanı
        c.setFillColorRGB(0.12, 0.16, 0.24)
        c.setFont(FONT_REGULAR, 7.5)
        instr = entry.instructions or "Doktorun belirttiği şekilde"
        lines = _wrap_text(c, instr, FONT_REGULAR, 7.5, col_widths[5] - 3 * mm)[:2]
        iy = cursor_y - 5 * mm
        for ln in lines:
            c.drawString(cur_x + 1.5 * mm, iy, ln)
            iy -= 3.6 * mm
        cur_x += col_widths[5]

        # 7. Kullanım Amacı & SGK
        c.setFillColorRGB(0.30, 0.35, 0.45)
        c.setFont(FONT_REGULAR, 7.0)
        purp = entry.kullanim_amaci_tani or "-"
        if len(purp) > 24:
            purp = purp[:22] + "…"
        c.drawString(cur_x + 1.5 * mm, cursor_y - 5 * mm, purp)
        if entry.refill_date:
            c.setFont(FONT_BOLD, 6.8)
            c.setFillColorRGB(0.05, 0.50, 0.35)
            c.drawString(cur_x + 1.5 * mm, cursor_y - 9.5 * mm, f"SGK: {entry.refill_date}")

        cursor_y -= row_h

    cursor_y -= 4 * mm

    # 4. Alt Bilgi & Uyarı Kartı
    warn_box_h = 24 * mm
    if cursor_y - warn_box_h < margin:
        c.showPage()
        cursor_y = page_h - margin

    c.setFillColorRGB(0.99, 0.98, 0.93)
    c.setStrokeColorRGB(0.95, 0.75, 0.30)
    c.rect(margin, cursor_y - warn_box_h, usable_w, warn_box_h, fill=1, stroke=1)

    c.setFillColorRGB(0.70, 0.40, 0.05)
    c.setFont(FONT_BOLD, 8)
    c.drawString(margin + 4 * mm, cursor_y - 5.5 * mm, "⚠️ ÖNEMLİ HASTA GÜVENLİK HATIRLATMALARI")

    c.setFillColorRGB(0.25, 0.30, 0.38)
    c.setFont(FONT_REGULAR, 7.2)
    bullets = [
        "• İlaçlarınızı hekiminizin ve eczacınızın tarif ettiği zaman ve dozda, kutuyu tamamlayarak kullanınız.",
        "• Antibiyotik ve şurupları buzdolabında (2-8°C) veya serin yerde saklayınız; açıldıktan sonra süresine dikkat ediniz.",
        "• İlaçlarınızı çocukların kesinlikle ulaşamayacağı güvenli yerlerde muhafaza ediniz.",
        "• Beklenmeyen bir yan etki, alerji veya şikayet durumunda derhal eczacınıza veya hekiminize başvurunuz.",
    ]
    by = cursor_y - 9.5 * mm
    for b in bullets:
        c.drawString(margin + 4 * mm, by, b)
        by -= 3.6 * mm

    cursor_y -= (warn_box_h + 6 * mm)

    # 5. Eczacı Vurgusu ve İyi Dilekler
    c.setFont(FONT_BOLD, 9)
    c.setFillColorRGB(*BANNER_COLOR)
    c.drawCentredString(margin + usable_w / 2.0, cursor_y - 2 * mm, f"★ {pharmacy_name} • Sağlıklı ve Mutlu Günler Dileriz ★")

    c.save()
    return output_path
