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
    staff_name: Optional[str] = None
    copies: int = 1


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
            cursor_y -= 0.5
        cursor_y -= 1.0

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

    # Alt koyu bant: eczane adı + telefon (adres YOK) [+ personel]
    footer_text = profile.get("name", "")
    if profile.get("phone"):
        footer_text += f"  /  {profile['phone']}"
    if entry.staff_name:
        footer_text += f"   ({entry.staff_name})"
    _draw_banner(c, ox + pad, oy + pad * 0.5, w - pad * 2, footer_h, footer_text, 5.2)


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


A4_CONTENT_HEIGHT = 34 * mm  # her etiketin gerçek içerik yüksekliği (hücre bundan uzun olsa da içerik üstte kalır)


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


def print_pdf(path: str) -> tuple:
    """Platforma göre PDF'i yazıcıya gönderir. (success: bool, error: str|None) döner."""
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(path, "print")  # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.run(["lpr", path], check=True)
        else:
            subprocess.run(["lp", path], check=True)
        return True, None
    except Exception as exc:  # yazıcı yok/izin yok/komut bulunamadı vb.
        return False, str(exc)
