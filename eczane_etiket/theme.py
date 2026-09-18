"""Modern UI tema ve stil yapılandırması.

Sağlık/eczacılık standartlarına uygun modern, sade ve göz alıcı bir tasarım
sistemi sunar. Windows High-DPI ekranlarda net görüntü sağlar.
3 farklı tema seçeneği desteklenir:
- light: Ferah Medikal (Modern Slate & Mavi)
- dark: Gece Nöbeti (Dark Mode / Göz Yormayan Koyu Antrasit)
- emerald: Eczane Yeşili (Geleneksel Sağlık Yeşili)
"""

import ctypes
import platform
import tkinter as tk
from tkinter import ttk

FONT_FAMILY = "Segoe UI"

THEMES = {
    "light": {
        "name": "☀️ Gündüz (Medikal Mavi)",
        "bg_app": "#f1f5f9",
        "bg_card": "#ffffff",
        "bg_card_hover": "#f8fafc",
        "bg_header": "#0f172a",
        "bg_label_navy": "#0f2042",
        "primary": "#2563eb",
        "primary_hover": "#1d4ed8",
        "primary_active": "#1e40af",
        "success": "#059669",
        "success_hover": "#047857",
        "success_active": "#065f46",
        "danger": "#dc2626",
        "danger_hover": "#b91c1c",
        "secondary": "#64748b",
        "secondary_hover": "#475569",
        "secondary_light": "#e2e8f0",
        "border": "#cbd5e1",
        "border_light": "#e2e8f0",
        "border_focus": "#3b82f6",
        "text_primary": "#0f172a",
        "text_secondary": "#475569",
        "text_muted": "#94a3b8",
        "text_white": "#ffffff",
        "tree_select_bg": "#dbeafe",
        "tree_select_fg": "#1e3a8a",
    },
    "dark": {
        "name": "🌙 Gece Nöbeti (Karanlık Mod)",
        "bg_app": "#0b1329",
        "bg_card": "#152238",
        "bg_card_hover": "#1c2c48",
        "bg_header": "#070b18",
        "bg_label_navy": "#071022",
        "primary": "#38bdf8",
        "primary_hover": "#0ea5e9",
        "primary_active": "#0284c7",
        "success": "#10b981",
        "success_hover": "#059669",
        "success_active": "#047857",
        "danger": "#f87171",
        "danger_hover": "#ef4444",
        "secondary": "#94a3b8",
        "secondary_hover": "#cbd5e1",
        "secondary_light": "#1e293b",
        "border": "#2d3e5a",
        "border_light": "#1e293b",
        "border_focus": "#38bdf8",
        "text_primary": "#f8fafc",
        "text_secondary": "#cbd5e1",
        "text_muted": "#64748b",
        "text_white": "#ffffff",
        "tree_select_bg": "#1e3a8a",
        "tree_select_fg": "#f8fafc",
    },
    "emerald": {
        "name": "🌿 Eczane Yeşili (Sağlık Teması)",
        "bg_app": "#f0fdf4",
        "bg_card": "#ffffff",
        "bg_card_hover": "#f7fee7",
        "bg_header": "#064e3b",
        "bg_label_navy": "#064e3b",
        "primary": "#059669",
        "primary_hover": "#047857",
        "primary_active": "#065f46",
        "success": "#059669",
        "success_hover": "#047857",
        "success_active": "#065f46",
        "danger": "#dc2626",
        "danger_hover": "#b91c1c",
        "secondary": "#64748b",
        "secondary_hover": "#475569",
        "secondary_light": "#dcfce7",
        "border": "#bbf7d0",
        "border_light": "#dcfce7",
        "border_focus": "#10b981",
        "text_primary": "#064e3b",
        "text_secondary": "#166534",
        "text_muted": "#86efac",
        "text_white": "#ffffff",
        "tree_select_bg": "#d1fae5",
        "tree_select_fg": "#065f46",
    },
    "ocean": {
        "name": "🌊 Okyanus (Mavi & Turkuaz)",
        "bg_app": "#f0f9ff",
        "bg_card": "#ffffff",
        "bg_card_hover": "#e0f2fe",
        "bg_header": "#0369a1",
        "bg_label_navy": "#0c4a6e",
        "primary": "#0284c7",
        "primary_hover": "#0369a1",
        "primary_active": "#075985",
        "success": "#0d9488",
        "success_hover": "#0f766e",
        "success_active": "#115e59",
        "danger": "#e11d48",
        "danger_hover": "#be123c",
        "secondary": "#64748b",
        "secondary_hover": "#475569",
        "secondary_light": "#e0f2fe",
        "border": "#bae6fd",
        "border_light": "#e0f2fe",
        "border_focus": "#0284c7",
        "text_primary": "#0c4a6e",
        "text_secondary": "#0369a1",
        "text_muted": "#7dd3fc",
        "text_white": "#ffffff",
        "tree_select_bg": "#bae6fd",
        "tree_select_fg": "#0369a1",
    },
    "cosmic": {
        "name": "🌌 Kozmik Gece (OLED Neon)",
        "bg_app": "#05070e",
        "bg_card": "#0c101c",
        "bg_card_hover": "#141a2e",
        "bg_header": "#020308",
        "bg_label_navy": "#02040a",
        "primary": "#00f2fe",
        "primary_hover": "#4facfe",
        "primary_active": "#00c6ff",
        "success": "#00f5a0",
        "success_hover": "#00d98b",
        "success_active": "#00b374",
        "danger": "#ff0844",
        "danger_hover": "#ff4e50",
        "secondary": "#8a99ad",
        "secondary_hover": "#b0c0d6",
        "secondary_light": "#141a2e",
        "border": "#1e2742",
        "border_light": "#141a2e",
        "border_focus": "#00f2fe",
        "text_primary": "#f0f6fc",
        "text_secondary": "#8a99ad",
        "text_muted": "#52627a",
        "text_white": "#ffffff",
        "tree_select_bg": "#1e2742",
        "tree_select_fg": "#00f2fe",
    },
}

# Varsayılan modül seviyesi renk değişkenleri (Geriye uyumluluk için)
BG_APP = THEMES["light"]["bg_app"]
BG_CARD = THEMES["light"]["bg_card"]
BG_CARD_HOVER = THEMES["light"]["bg_card_hover"]
BG_HEADER = THEMES["light"]["bg_header"]
BG_LABEL_NAVY = THEMES["light"]["bg_label_navy"]

PRIMARY = THEMES["light"]["primary"]
PRIMARY_HOVER = THEMES["light"]["primary_hover"]
PRIMARY_ACTIVE = THEMES["light"]["primary_active"]

SUCCESS = THEMES["light"]["success"]
SUCCESS_HOVER = THEMES["light"]["success_hover"]
SUCCESS_ACTIVE = THEMES["light"]["success_active"]

DANGER = THEMES["light"]["danger"]
DANGER_HOVER = THEMES["light"]["danger_hover"]

SECONDARY = THEMES["light"]["secondary"]
SECONDARY_HOVER = THEMES["light"]["secondary_hover"]
SECONDARY_LIGHT = THEMES["light"]["secondary_light"]

BORDER = THEMES["light"]["border"]
BORDER_LIGHT = THEMES["light"]["border_light"]
BORDER_FOCUS = THEMES["light"]["border_focus"]

TEXT_PRIMARY = THEMES["light"]["text_primary"]
TEXT_SECONDARY = THEMES["light"]["text_secondary"]
TEXT_MUTED = THEMES["light"]["text_muted"]
TEXT_WHITE = THEMES["light"]["text_white"]
TEXT_SUCCESS = "#065f46"


def enable_high_dpi():
    """Windows High-DPI ekranlarda fontların ve kontrollerin bulanıklaşmasını önler."""
    if platform.system() == "Windows":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass


def apply_theme(root: tk.Tk, theme_key: str = "light") -> dict:
    """Tkinter penceresine ve ttk bileşenlerine belirtilen temayı uygular."""
    global BG_APP, BG_CARD, BG_CARD_HOVER, BG_HEADER, BG_LABEL_NAVY
    global PRIMARY, PRIMARY_HOVER, PRIMARY_ACTIVE, SUCCESS, SUCCESS_HOVER, SUCCESS_ACTIVE
    global DANGER, DANGER_HOVER, SECONDARY, SECONDARY_HOVER, SECONDARY_LIGHT
    global BORDER, BORDER_LIGHT, BORDER_FOCUS, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, TEXT_WHITE

    enable_high_dpi()

    if theme_key not in THEMES:
        theme_key = "light"
    t = THEMES[theme_key]

    # Modül seviyesi değişkenleri güncelle
    BG_APP = t["bg_app"]
    BG_CARD = t["bg_card"]
    BG_CARD_HOVER = t["bg_card_hover"]
    BG_HEADER = t["bg_header"]
    BG_LABEL_NAVY = t["bg_label_navy"]
    PRIMARY = t["primary"]
    PRIMARY_HOVER = t["primary_hover"]
    PRIMARY_ACTIVE = t["primary_active"]
    SUCCESS = t["success"]
    SUCCESS_HOVER = t["success_hover"]
    SUCCESS_ACTIVE = t["success_active"]
    DANGER = t["danger"]
    DANGER_HOVER = t["danger_hover"]
    SECONDARY = t["secondary"]
    SECONDARY_HOVER = t["secondary_hover"]
    SECONDARY_LIGHT = t["secondary_light"]
    BORDER = t["border"]
    BORDER_LIGHT = t["border_light"]
    BORDER_FOCUS = t["border_focus"]
    TEXT_PRIMARY = t["text_primary"]
    TEXT_SECONDARY = t["text_secondary"]
    TEXT_MUTED = t["text_muted"]
    TEXT_WHITE = t["text_white"]

    root.configure(bg=BG_APP)

    style = ttk.Style()
    available_themes = style.theme_names()
    if "clam" in available_themes:
        style.theme_use("clam")

    font_main = (FONT_FAMILY, 9)
    font_bold = (FONT_FAMILY, 9, "bold")
    font_title = (FONT_FAMILY, 11, "bold")
    font_small = (FONT_FAMILY, 8)

    # Genel zemin
    style.configure(".", background=BG_APP, foreground=TEXT_PRIMARY, font=font_main)
    style.configure("TFrame", background=BG_APP)
    style.configure("Card.TFrame", background=BG_CARD)
    style.configure("Header.TFrame", background=BG_HEADER)

    # Etiketler
    style.configure("TLabel", background=BG_APP, foreground=TEXT_PRIMARY, font=font_main)
    style.configure("Card.TLabel", background=BG_CARD, foreground=TEXT_PRIMARY, font=font_main)
    style.configure("CardBold.TLabel", background=BG_CARD, foreground=TEXT_PRIMARY, font=font_bold)
    style.configure("HeaderTitle.TLabel", background=BG_HEADER, foreground=TEXT_WHITE, font=font_title)
    style.configure("HeaderBadge.TLabel", background="#1e293b" if theme_key != "emerald" else "#065f46", foreground="#38bdf8" if theme_key != "emerald" else "#a7f3d0", font=font_bold, padding=(8, 4))
    style.configure("Muted.TLabel", background=BG_CARD, foreground=TEXT_MUTED, font=font_small)
    style.configure("Status.TLabel", background=BG_APP, foreground=TEXT_SECONDARY, font=font_small)

    # LabelFrame stilleri
    style.configure(
        "TLabelframe",
        background=BG_CARD,
        bordercolor=BORDER_LIGHT,
        lightcolor=BORDER_LIGHT,
        darkcolor=BORDER_LIGHT,
        relief="solid",
        borderwidth=1,
    )
    style.configure(
        "TLabelframe.Label",
        background=BG_CARD,
        foreground=PRIMARY,
        font=font_bold,
    )

    # Standart Buton
    style.configure(
        "TButton",
        background=SECONDARY_LIGHT,
        foreground=TEXT_PRIMARY,
        font=font_bold,
        borderwidth=1,
        bordercolor=BORDER,
        relief="flat",
        padding=(10, 5),
    )
    style.map(
        "TButton",
        background=[("pressed", BORDER), ("active", SECONDARY_LIGHT)],
        foreground=[("pressed", TEXT_PRIMARY), ("active", TEXT_PRIMARY)],
    )

    # Birincil Buton (Primary)
    style.configure(
        "Primary.TButton",
        background=PRIMARY,
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 9, "bold"),
        borderwidth=0,
        relief="flat",
        padding=(12, 6),
    )
    style.map(
        "Primary.TButton",
        background=[("pressed", PRIMARY_ACTIVE), ("active", PRIMARY_HOVER)],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Başarı / Yazdır Butonu
    style.configure(
        "Success.TButton",
        background=SUCCESS,
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 10, "bold"),
        borderwidth=0,
        relief="flat",
        padding=(14, 7),
    )
    style.map(
        "Success.TButton",
        background=[("pressed", SUCCESS_ACTIVE), ("active", SUCCESS_HOVER)],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Üst Bar Butonları
    style.configure(
        "Header.TButton",
        background="#1e293b" if theme_key != "emerald" else "#047857",
        foreground=TEXT_WHITE,
        font=font_small,
        borderwidth=0,
        relief="flat",
        padding=(8, 4),
    )
    style.map(
        "Header.TButton",
        background=[("pressed", "#0f172a"), ("active", "#334155" if theme_key != "emerald" else "#065f46")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Hızlı Talimat Hap Butonları
    style.configure(
        "Pill.TButton",
        background="#1e293b" if theme_key == "dark" else "#f8fafc",
        foreground="#38bdf8" if theme_key == "dark" else "#1e40af",
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor="#334155" if theme_key == "dark" else "#bfdbfe",
        relief="solid",
        padding=(8, 4),
    )
    style.map(
        "Pill.TButton",
        background=[("pressed", PRIMARY_ACTIVE), ("active", "#0f172a" if theme_key == "dark" else "#eff6ff")],
        foreground=[("pressed", TEXT_WHITE), ("active", PRIMARY_HOVER)],
        bordercolor=[("active", PRIMARY)],
    )

    style.configure(
        "ActivePill.TButton",
        background=PRIMARY,
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor=PRIMARY_ACTIVE,
        relief="solid",
        padding=(8, 4),
    )
    style.map(
        "ActivePill.TButton",
        background=[("pressed", PRIMARY_ACTIVE), ("active", PRIMARY_HOVER)],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Doz Zamanı Çipleri (Sabah / Öğle / Akşam / Gece)
    style.configure(
        "TimeChip.TButton",
        background="#1e293b" if theme_key == "dark" else "#f1f5f9",
        foreground="#94a3b8" if theme_key == "dark" else "#334155",
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor="#334155" if theme_key == "dark" else "#cbd5e1",
        relief="solid",
        padding=(6, 3),
    )
    style.map(
        "TimeChip.TButton",
        background=[("pressed", "#0f172a"), ("active", "#0284c7" if theme_key == "dark" else "#e0f2fe")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE if theme_key == "dark" else "#0369a1")],
        bordercolor=[("active", PRIMARY)],
    )

    style.configure(
        "ActiveTimeChip.TButton",
        background="#0284c7",
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor="#0369a1",
        relief="solid",
        padding=(6, 3),
    )
    style.map(
        "ActiveTimeChip.TButton",
        background=[("pressed", "#0369a1"), ("active", "#0284c7")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Uyarı Çipleri
    style.configure(
        "WarningChip.TButton",
        background="#2e1a06" if theme_key == "dark" else "#fffbeb",
        foreground="#fcd34d" if theme_key == "dark" else "#92400e",
        font=(FONT_FAMILY, 8),
        borderwidth=1,
        bordercolor="#78350f" if theme_key == "dark" else "#fde68a",
        relief="solid",
        padding=(6, 3),
    )
    style.map(
        "WarningChip.TButton",
        background=[("pressed", "#451a03"), ("active", "#78350f" if theme_key == "dark" else "#fef9c3")],
        foreground=[("pressed", "#fef3c7"), ("active", "#fbbf24" if theme_key == "dark" else "#92400e")],
        bordercolor=[("active", "#f59e0b")],
    )

    style.configure(
        "ActiveWarningChip.TButton",
        background="#d97706",
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor="#b45309",
        relief="solid",
        padding=(6, 3),
    )
    style.map(
        "ActiveWarningChip.TButton",
        background=[("pressed", "#b45309"), ("active", "#d97706")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    # Majistral & Pediatrik Buton Stilleri
    style.configure(
        "Majistral.TButton",
        background="#4f46e5",
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=0,
        relief="flat",
        padding=(8, 4),
    )
    style.map(
        "Majistral.TButton",
        background=[("pressed", "#3730a3"), ("active", "#4338ca")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    style.configure(
        "Pediatric.TButton",
        background="#ec4899",
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=0,
        relief="flat",
        padding=(8, 4),
    )
    style.map(
        "Pediatric.TButton",
        background=[("pressed", "#be185d"), ("active", "#db2777")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE)],
    )

    style.configure(
        "ActivePediatric.TButton",
        background="#db2777",
        foreground=TEXT_WHITE,
        font=(FONT_FAMILY, 8, "bold"),
        borderwidth=1,
        bordercolor="#9d174d",
        relief="solid",
        padding=(8, 4),
    )

    # Tehlike / Sil Butonu
    style.configure(
        "Danger.TButton",
        background="#450a0a" if theme_key == "dark" else "#fee2e2",
        foreground="#fca5a5" if theme_key == "dark" else DANGER,
        font=font_bold,
        borderwidth=1,
        bordercolor="#7f1d1d" if theme_key == "dark" else "#fca5a5",
        relief="solid",
        padding=(8, 4),
    )
    style.map(
        "Danger.TButton",
        background=[("pressed", "#7f1d1d"), ("active", "#991b1b" if theme_key == "dark" else "#fef2f2")],
        foreground=[("pressed", TEXT_WHITE), ("active", TEXT_WHITE if theme_key == "dark" else DANGER)],
    )

    # Form Girdileri
    style.configure(
        "TEntry",
        fieldbackground=BG_CARD,
        foreground=TEXT_PRIMARY,
        font=font_main,
        padding=4,
        relief="flat",
        bordercolor=BORDER,
    )
    style.configure(
        "TCombobox",
        fieldbackground=BG_CARD,
        background=SECONDARY_LIGHT,
        foreground=TEXT_PRIMARY,
        font=font_main,
        padding=4,
        arrowsize=14,
        bordercolor=BORDER,
    )
    style.map(
        "TCombobox",
        fieldbackground=[("readonly", BG_CARD)],
        selectbackground=[("readonly", PRIMARY)],
        selectforeground=[("readonly", TEXT_WHITE)],
    )
    style.configure(
        "TSpinbox",
        fieldbackground=BG_CARD,
        foreground=TEXT_PRIMARY,
        font=font_main,
        padding=3,
        bordercolor=BORDER,
    )

    style.configure(
        "TRadiobutton",
        background=BG_CARD,
        foreground=TEXT_PRIMARY,
        font=font_bold,
        indicatorrelief="flat",
        padding=4,
    )
    style.map(
        "TRadiobutton",
        background=[("active", BG_CARD)],
    )

    # Treeview
    style.configure(
        "Treeview",
        background=BG_CARD,
        foreground=TEXT_PRIMARY,
        fieldbackground=BG_CARD,
        font=font_main,
        rowheight=24,
        borderwidth=1,
        relief="solid",
        bordercolor=BORDER_LIGHT,
    )
    style.configure(
        "Treeview.Heading",
        background=SECONDARY_LIGHT,
        foreground=TEXT_PRIMARY,
        font=font_bold,
        padding=(6, 4),
        relief="flat",
    )
    style.map(
        "Treeview",
        background=[("selected", t["tree_select_bg"])],
        foreground=[("selected", t["tree_select_fg"])],
    )

    # Notebook
    style.configure(
        "TNotebook",
        background=BG_APP,
        borderwidth=0,
    )
    style.configure(
        "TNotebook.Tab",
        background=SECONDARY_LIGHT,
        foreground=TEXT_SECONDARY,
        font=font_bold,
        padding=(12, 6),
        relief="flat",
    )
    style.map(
        "TNotebook.Tab",
        background=[("selected", BG_CARD), ("active", BORDER)],
        foreground=[("selected", PRIMARY), ("active", TEXT_PRIMARY)],
    )

    return {
        "key": theme_key,
        "name": t["name"],
        "bg_app": BG_APP,
        "bg_card": BG_CARD,
        "bg_header": BG_HEADER,
        "bg_label_navy": BG_LABEL_NAVY,
        "primary": PRIMARY,
        "success": SUCCESS,
        "border": BORDER,
        "text_primary": TEXT_PRIMARY,
        "text_secondary": TEXT_SECONDARY,
        "font_family": FONT_FAMILY,
    }
