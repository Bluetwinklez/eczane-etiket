"""Eczane İlaç Etiketi Programı — Hızlı Etiket ana ekranı (Tkinter).

Bu ekran günlük kullanım için hızlı, ergonomik, hatasız ve profesyonel
bir arayüz sunar. Tüm yönetimsel işler (profiller, ilaç listesi, şablonlar,
personel, geçmiş/raporlar, stok, yedekleme) Admin Panelinde toplanır.
"""

import datetime as _dt
import os
import re
import tempfile
import tkinter as tk
import uuid
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Optional

from . import __version__, data, history, prescription_parser, profiles, staff, theme
from .label_pdf import LabelEntry, build_label_pdf, get_system_printers, print_pdf

_ICON_PNG = os.path.join(os.path.dirname(__file__), "icons", "app_icon.png")
_END_DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Eczane İlaç Etiketi Programı")
        self.geometry("850x670")
        self.minsize(820, 580)

        self.active_profile = profiles.get_active_profile()
        saved_theme = self.active_profile.get("theme", "light")

        # Modern tema ve stilleri uygula
        self.theme_colors = theme.apply_theme(self, saved_theme)
        self._set_app_icon()

        self.drug_list = data.load_drug_list()
        self.batch_mode = tk.BooleanVar(value=False)
        self.batch_entries = []  # list[LabelEntry]
        self._history_records = []

        # Yeni Eczane Özellikleri Durumları
        self.active_warning_tags = set()
        self.warning_chip_buttons = {}
        self.dose_times = {"sabah": False, "ogle": False, "aksam": False, "gece": False}
        self.dose_time_buttons = {}
        self.food_buttons = {}
        self.food_status = tk.StringVar(value="tok")
        self.print_barcode_var = tk.BooleanVar(value=True)
        self.pediatric_mode = tk.BooleanVar(value=False)
        self.print_dose_grid_var = tk.BooleanVar(value=False)
        self.print_refill_var = tk.BooleanVar(value=True)
        self.refill_date_var = tk.StringVar(value="")
        saved_printer = self.active_profile.get("default_printer")
        self.selected_printer_var = tk.StringVar(value=saved_printer or "(Varsayılan Yazıcı)")

        self._build_layout()
        self._refresh_instruction_buttons(data.DEFAULT_FORM)
        self._refresh_history_list()
        self._refresh_preview()
        self._barcode_entry.focus_set()

        # Klavye kısayolları
        self.bind("<Control-p>", lambda e: self._on_print())
        self.bind("<Control-P>", lambda e: self._on_print())
        self.bind("<Control-s>", lambda e: self._on_save_pdf())
        self.bind("<Control-S>", lambda e: self._on_save_pdf())
        self.bind("<Control-n>", lambda e: self._clear_form())
        self.bind("<Control-N>", lambda e: self._clear_form())
        self.bind("<Escape>", lambda e: self._clear_form())
        self.bind("<F2>", lambda e: self._barcode_entry.focus_set())
        self.bind("<F3>", lambda e: self.drug_combo.focus_set())
        self.bind("<Control-Return>", lambda e: self._add_to_batch() if self.batch_mode.get() else None)

        self.after(150, self._maybe_first_run_setup)

    def _set_app_icon(self):
        """Pencere ikonunu ayarlar."""
        try:
            icon_image = tk.PhotoImage(file=_ICON_PNG)
            self.iconphoto(True, icon_image)
            self._icon_image_ref = icon_image
        except Exception:
            pass

    def _maybe_first_run_setup(self):
        """İlk çalıştırmada temel eczane bilgilerini sorar."""
        profile = self.active_profile
        if profile.get("name") == "Eczanem" and not profile.get("phone"):
            self._open_first_run_dialog(profile)

    def _open_first_run_dialog(self, profile):
        top = tk.Toplevel(self)
        top.title("Hoş Geldiniz — İlk Kurulum")
        top.geometry("480x250")
        top.transient(self)
        top.grab_set()
        top.configure(bg=theme.BG_CARD)

        card = ttk.Frame(top, style="Card.TFrame", padding=16)
        card.pack(fill="both", expand=True)

        ttk.Label(
            card,
            text="Eczane Bilgilerinizi Belirleyin",
            font=(theme.FONT_FAMILY, 12, "bold"),
            foreground=theme.PRIMARY,
        ).pack(anchor="w", pady=(0, 6))

        ttk.Label(
            card,
            text=(
                "Bu bilgiler etiketlerin alt bandında yer alacaktır.\n"
                "İstediğiniz zaman Admin Paneli → Eczane Profilleri sekmesinden değiştirebilirsiniz."
            ),
            justify="left",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(0, 12))

        form = ttk.Frame(card, style="Card.TFrame")
        form.pack(fill="x")
        ttk.Label(form, text="Eczane Adı:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=6)
        name_var = tk.StringVar(value="")
        ttk.Entry(form, textvariable=name_var, width=32).grid(row=0, column=1, sticky="we", pady=6, padx=(8, 0))

        ttk.Label(form, text="Telefon:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=6)
        phone_var = tk.StringVar()
        ttk.Entry(form, textvariable=phone_var, width=32).grid(row=1, column=1, sticky="we", pady=6, padx=(8, 0))
        form.columnconfigure(1, weight=1)

        def save_and_close():
            name = name_var.get().strip() or "Eczanem"
            profiles.update_profile(profile["id"], name=name, phone=phone_var.get().strip())
            self.active_profile = profiles.get_active_profile()
            self._update_profile_display()
            self._refresh_preview()
            top.destroy()

        btns = ttk.Frame(card, style="Card.TFrame")
        btns.pack(fill="x", pady=(16, 0))
        ttk.Button(btns, text="Kaydet ve Başla", style="Primary.TButton", command=save_and_close).pack(side="left")
        ttk.Button(btns, text="Daha Sonra", command=top.destroy).pack(side="left", padx=(8, 0))

    def _update_profile_display(self):
        name = self.active_profile.get("name", "Eczanem")
        phone = self.active_profile.get("phone", "")
        info = f"📍 {name}" + (f"  |  ☎ {phone}" if phone else "")
        self.profile_badge.config(text=info)

    def _show_status(self, message: str, is_error: bool = False):
        """Alt durum çubuğuna bilgi veya uyarı mesajı yazar."""
        color = "#b91c1c" if is_error else "#047857"
        self.status_label.config(text=message, foreground=color)
        self.after(5000, lambda: self.status_label.config(text="Hazır", foreground=theme.TEXT_SECONDARY))

    # ------------------------------------------------------------------
    # Düzen (Layout)
    # ------------------------------------------------------------------
    def _build_layout(self):
        # 1. Üst Başlık Çubuğu (Header Bar)
        header = ttk.Frame(self, style="Header.TFrame", padding=(12, 8))
        header.pack(fill="x")

        btn_box = ttk.Frame(header, style="Header.TFrame")
        btn_box.pack(side="right")
        ttk.Button(btn_box, text="⚙️ Admin", style="Header.TButton", command=self._open_admin_panel).pack(side="right", padx=(4, 0))
        ttk.Button(btn_box, text="ℹ️ Hakkında", style="Header.TButton", command=self._show_about).pack(side="right", padx=(4, 0))
        ttk.Button(btn_box, text="🧪 Test Baskısı", style="Header.TButton", command=self._print_test_label).pack(side="right", padx=(4, 0))
        ttk.Button(btn_box, text="🧹 Temizle", style="Header.TButton", command=self._clear_form).pack(side="right", padx=(4, 0))

        # Hızlı Şablon Boyut Seçici (Header Üzerinde)
        template_names = list(profiles.LABEL_TEMPLATES.values())
        cur_tpl_key = self.active_profile.get("label_template", "thermal_50x30")
        self.header_template_var = tk.StringVar(value=profiles.LABEL_TEMPLATES.get(cur_tpl_key, template_names[0]))
        ttk.Label(btn_box, text="📏", background=theme.BG_HEADER, foreground="#94a3b8", font=(theme.FONT_FAMILY, 9)).pack(side="right", padx=(8, 2))
        self.header_template_combo = ttk.Combobox(
            btn_box,
            textvariable=self.header_template_var,
            values=template_names,
            width=21,
            state="readonly",
        )
        self.header_template_combo.pack(side="right", padx=(0, 4))
        self.header_template_combo.bind("<<ComboboxSelected>>", self._on_header_template_selected)

        # Tema Seçici (Header Üzerinde)
        theme_names_rev = {
            "light": "☀️ Gündüz",
            "dark": "🌙 Gece Nöbeti",
            "emerald": "🌿 Eczane Yeşili",
        }
        init_theme_name = theme_names_rev.get(self.active_profile.get("theme", "light"), "☀️ Gündüz")
        self.theme_var = tk.StringVar(value=init_theme_name)
        ttk.Label(btn_box, text="🎨", background=theme.BG_HEADER, foreground="#94a3b8", font=(theme.FONT_FAMILY, 9)).pack(side="right", padx=(6, 2))
        self.theme_combo = ttk.Combobox(
            btn_box,
            textvariable=self.theme_var,
            values=["☀️ Gündüz", "🌙 Gece Nöbeti", "🌿 Eczane Yeşili"],
            width=13,
            state="readonly",
        )
        self.theme_combo.pack(side="right", padx=(0, 4))
        self.theme_combo.bind("<<ComboboxSelected>>", self._on_theme_selected)

        title_frame = ttk.Frame(header, style="Header.TFrame")
        title_frame.pack(side="left")
        ttk.Label(title_frame, text="🏥 Eczane İlaç Etiketi", style="HeaderTitle.TLabel").pack(side="left")
        ttk.Label(
            title_frame,
            text=f"v{__version__}",
            font=(theme.FONT_FAMILY, 8),
            foreground="#94a3b8",
            background=theme.BG_HEADER,
        ).pack(side="left", padx=(6, 0))

        self.profile_badge = ttk.Label(header, text="", style="HeaderBadge.TLabel")
        self.profile_badge.pack(side="left", padx=(12, 0))
        self._update_profile_display()

        # 2. Ana Gövde (Grid Yerleşimi: Sol Form, Sağ Önizleme)
        body = ttk.Frame(self, padding=10)
        body.pack(fill="both", expand=True)

        body.columnconfigure(0, weight=6)
        body.columnconfigure(1, weight=4)
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        right = ttk.Frame(body)
        right.grid(row=0, column=1, sticky="nsew")

        self._build_form(left)
        self._build_preview_and_history(right)

        # 3. Alt Durum Çubuğu (Status Bar)
        status_bar = ttk.Frame(self, padding=(12, 4))
        status_bar.pack(fill="x", side="bottom")
        self.status_label = ttk.Label(status_bar, text="● Sistem Hazır", style="Status.TLabel", foreground="#047857")
        self.status_label.pack(side="left")

        shortcuts_hint = ttk.Label(
            status_bar,
            text="⌨️ Ctrl+P: Yazdır  |  Ctrl+S: PDF  |  Ctrl+Enter: Listeye Ekle  |  Esc: Temizle  |  F2: Barkod  |  F3: İlaç",
            style="Status.TLabel",
        )
        shortcuts_hint.pack(side="right")

    def _build_form(self, parent):
        # 1. Mod Seçici Bar
        top_bar = ttk.Frame(parent, style="Card.TFrame", padding=(10, 6))
        top_bar.pack(fill="x", pady=(0, 6))

        ttk.Radiobutton(
            top_bar, text="Tekli Etiket", value=False, variable=self.batch_mode, command=self._on_mode_change
        ).pack(side="left")
        ttk.Radiobutton(
            top_bar, text="Toplu Reçete Modu", value=True, variable=self.batch_mode, command=self._on_mode_change
        ).pack(side="left", padx=(12, 0))

        ttk.Button(
            top_bar, text="🧪 Majistral", style="Majistral.TButton", command=self._apply_majistral_mode
        ).pack(side="left", padx=(12, 0))

        self.pediatric_btn = ttk.Button(
            top_bar, text="👶 Pediatrik Mod", style="Pediatric.TButton", command=self._toggle_pediatric_mode
        )
        self.pediatric_btn.pack(side="left", padx=(8, 0))

        ttk.Button(
            top_bar, text="📋 Hızlı Yapıştır (Reçete)", command=self._open_quick_paste_dialog
        ).pack(side="right")

        # 2. Etiket Bilgileri Kartı (Ergonomik 2 Sütunlu Grid)
        form_card = ttk.LabelFrame(parent, text=" 🏷️ İlaç ve Hasta Bilgileri ", padding=10)
        form_card.pack(fill="x", pady=(0, 8))

        # Satır 0: İlaç Adı & Barkod Oku
        ttk.Label(form_card, text="İlaç Adı *:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=4)
        self.drug_var = tk.StringVar()
        self.drug_combo = ttk.Combobox(form_card, textvariable=self.drug_var)
        self.drug_combo["values"] = [d["name"] for d in self.drug_list]
        self.drug_combo.grid(row=0, column=1, sticky="we", pady=4, padx=(6, 16))
        self.drug_combo.bind("<KeyRelease>", self._on_drug_typed)
        self.drug_combo.bind("<<ComboboxSelected>>", self._on_drug_selected)
        self.drug_combo.bind("<Return>", self._on_drug_enter_pressed)
        self.drug_combo.bind("<FocusOut>", self._on_drug_focus_out)

        ttk.Label(form_card, text="Barkod Oku:", style="CardBold.TLabel").grid(row=0, column=2, sticky="w", pady=4)
        self.barcode_var = tk.StringVar()
        barcode_frame = ttk.Frame(form_card, style="Card.TFrame")
        barcode_frame.grid(row=0, column=3, sticky="we", pady=4, padx=(6, 0))
        self._barcode_entry = ttk.Entry(barcode_frame, textvariable=self.barcode_var, width=16)
        self._barcode_entry.pack(side="left", fill="x", expand=True)
        self._barcode_entry.bind("<Return>", self._on_barcode_scanned)
        ttk.Label(barcode_frame, text="⏎", style="Muted.TLabel", font=(theme.FONT_FAMILY, 9, "bold")).pack(side="left", padx=(4, 0))

        # Satır 1: Hasta Adı & Personel
        ttk.Label(form_card, text="Hasta Adı:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=4)
        self.patient_var = tk.StringVar()
        ttk.Entry(form_card, textvariable=self.patient_var).grid(row=1, column=1, sticky="we", pady=4, padx=(6, 16))

        ttk.Label(form_card, text="Personel:", style="CardBold.TLabel").grid(row=1, column=2, sticky="w", pady=4)
        self.staff_var = tk.StringVar()
        self.staff_combo = ttk.Combobox(form_card, textvariable=self.staff_var, values=staff.load_staff(), width=16)
        self.staff_combo.grid(row=1, column=3, sticky="we", pady=4, padx=(6, 0))

        # Satır 2: Kullanım Amacı / Tanı & Tedavi Bitiş Tarihi + Adet
        ttk.Label(form_card, text="Kullanım Amacı / Tanı:", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=4)
        self.purpose_var = tk.StringVar()
        ttk.Entry(form_card, textvariable=self.purpose_var).grid(row=2, column=1, sticky="we", pady=4, padx=(6, 16))

        ttk.Label(form_card, text="Bitiş & Adet:", style="CardBold.TLabel").grid(row=2, column=2, sticky="w", pady=4)
        date_qty_frame = ttk.Frame(form_card, style="Card.TFrame")
        date_qty_frame.grid(row=2, column=3, sticky="we", pady=4, padx=(6, 0))
        self.end_date_var = tk.StringVar()
        ttk.Entry(date_qty_frame, textvariable=self.end_date_var, width=9).pack(side="left")

        # Hızlı tedavi süresi / bitiş tarihi ekleme menüsü (Kompakt 📅 butonu)
        date_menu_btn = ttk.Menubutton(date_qty_frame, text="📅", width=2)
        date_menu = tk.Menu(date_menu_btn, tearoff=0)

        def _set_end_days(days: int):
            target = _dt.date.today() + _dt.timedelta(days=days)
            self.end_date_var.set(target.strftime("%d.%m.%Y"))

        date_menu.add_command(label="+5 Gün", command=lambda: _set_end_days(5))
        date_menu.add_command(label="+7 Gün (1 Hafta)", command=lambda: _set_end_days(7))
        date_menu.add_command(label="+10 Gün", command=lambda: _set_end_days(10))
        date_menu.add_command(label="+14 Gün (2 Hafta)", command=lambda: _set_end_days(14))
        date_menu.add_command(label="+30 Gün (1 Ay)", command=lambda: _set_end_days(30))
        date_menu.add_separator()
        date_menu.add_command(label="Temizle", command=lambda: self.end_date_var.set(""))
        date_menu_btn["menu"] = date_menu
        date_menu_btn.pack(side="left", padx=(1, 3))

        ttk.Label(date_qty_frame, text="Adet:", style="Card.TLabel").pack(side="left", padx=(1, 2))
        self.copies_var = tk.IntVar(value=1)
        ttk.Spinbox(date_qty_frame, from_=1, to=50, textvariable=self.copies_var, width=2).pack(side="left")

        # Satır 3: Ambalaj Bilgisi & Hasta Notu / Alerji
        ttk.Label(form_card, text="Ambalaj (ör. 20 Tablet):", style="Card.TLabel").grid(row=3, column=0, sticky="w", pady=4)
        self.package_var = tk.StringVar()
        ttk.Entry(form_card, textvariable=self.package_var).grid(row=3, column=1, sticky="we", pady=4, padx=(6, 16))

        ttk.Label(form_card, text="Hasta Notu / Alerji:", style="Card.TLabel").grid(row=3, column=2, sticky="w", pady=4)
        self.note_var = tk.StringVar()
        ttk.Entry(form_card, textvariable=self.note_var).grid(row=3, column=3, sticky="we", pady=4, padx=(6, 0))

        # Satır 4: SGK Kutu Bitiş / Tekrar Alım Asistanı
        ttk.Label(form_card, text="SGK Kutu Bitiş:", style="CardBold.TLabel").grid(row=4, column=0, sticky="w", pady=4)
        refill_frame = ttk.Frame(form_card, style="Card.TFrame")
        refill_frame.grid(row=4, column=1, columnspan=3, sticky="we", pady=4, padx=(6, 0))
        self.refill_entry = ttk.Entry(refill_frame, textvariable=self.refill_date_var, width=12)
        self.refill_entry.pack(side="left")
        ttk.Button(refill_frame, text="⚡ Hesapla", command=self._auto_calc_refill_date).pack(side="left", padx=(4, 0))
        ttk.Checkbutton(refill_frame, text="📅 Etikete Bitiş Bas", variable=self.print_refill_var, command=self._refresh_preview).pack(side="left", padx=(10, 0))

        self.diagnosis_var = tk.StringVar()

        form_card.columnconfigure(1, weight=1)
        form_card.columnconfigure(3, weight=1)

        # 2.5. Doz Zamanı ve Açlık/Tokluk Asistanı Matrisi
        dose_box = ttk.LabelFrame(parent, text=" ⏰ Doz Zamanı & Açlık / Tokluk Asistanı ", padding=5)
        dose_box.pack(fill="x", pady=(0, 6))

        d_row = ttk.Frame(dose_box, style="Card.TFrame")
        d_row.pack(fill="x")

        ttk.Label(d_row, text="Zaman:", style="CardBold.TLabel").pack(side="left", padx=(0, 3))
        self.dose_time_buttons = {}
        for key, lbl in (("sabah", "☀️ Sabah"), ("ogle", "🌤️ Öğle"), ("aksam", "🌙 Akşam"), ("gece", "🛌 Gece")):
            btn = ttk.Button(d_row, text=lbl, style="TimeChip.TButton", command=lambda k=key: self._toggle_dose_time(k))
            btn.pack(side="left", padx=1)
            self.dose_time_buttons[key] = btn

        ttk.Label(d_row, text="Durum:", style="CardBold.TLabel").pack(side="left", padx=(6, 3))
        self.food_buttons = {}
        for key, lbl in (("tok", "🍽️ Tok"), ("ac", "🥣 Aç"), ("yemek_arasi", "🥪 Ara")):
            btn = ttk.Button(d_row, text=lbl, style="ActiveTimeChip.TButton" if key == "tok" else "TimeChip.TButton", command=lambda k=key: self._set_food_status(k))
            btn.pack(side="left", padx=1)
            self.food_buttons[key] = btn

        ttk.Label(d_row, text="Doz:", style="CardBold.TLabel").pack(side="left", padx=(6, 3))
        for mult in ("1x1", "2x1", "3x1", "4x1"):
            ttk.Button(d_row, text=mult, style="Pill.TButton", command=lambda m=mult: self._set_quick_dose_multiplier(m)).pack(side="left", padx=1)

        # Besin Etkileşim Menüsü
        food_hint_btn = ttk.Menubutton(d_row, text="🍎 Besin Uyarısı")
        food_menu = tk.Menu(food_hint_btn, tearoff=0)
        for title, hint in data.FOOD_INTERACTIONS:
            food_menu.add_command(
                label=f"{title}: {hint[:34]}...",
                command=lambda h=hint: self._insert_food_interaction(h),
            )
        food_hint_btn["menu"] = food_menu
        food_hint_btn.pack(side="left", padx=(6, 2))

        # 3. Hızlı Talimatlar (Hap / Pill Butonları)
        self.instr_buttons_frame = ttk.LabelFrame(parent, text=" ⚡ Hızlı Talimatlar (İlaç Formuna Göre) ", padding=6)
        self.instr_buttons_frame.pack(fill="x", pady=(0, 6))

        # 4. Kullanım Talimatı (Ana Metin Kutusu)
        instr_card = ttk.LabelFrame(parent, text=" 📝 Kullanım Talimatı (Serbest Düzenlenebilir) ", padding=6)
        instr_card.pack(fill="x", pady=(0, 8))

        self.instructions_text = tk.Text(
            instr_card,
            height=2,
            wrap="word",
            font=(theme.FONT_FAMILY, 10, "bold"),
            bg="#ffffff",
            fg=theme.TEXT_PRIMARY,
            relief="solid",
            borderwidth=1,
            highlightthickness=0,
        )
        self.instructions_text.pack(fill="x")
        self.instructions_text.bind("<KeyRelease>", lambda e: self._refresh_preview())

        def _handle_tab_key(event):
            event.widget.tk_focusNext().focus_set()
            return "break"

        def _handle_shift_tab_key(event):
            event.widget.tk_focusPrev().focus_set()
            return "break"

        self.instructions_text.bind("<Tab>", _handle_tab_key)
        self.instructions_text.bind("<Shift-Tab>", _handle_shift_tab_key)

        # 4.5. Özel Eczane Uyarı Etiketleri Çipleri
        warn_card = ttk.LabelFrame(parent, text=" ⚠️ Özel Eczane Uyarı Etiketleri (Tıkla & Ekle) ", padding=4)
        warn_card.pack(fill="x", pady=(0, 6))

        self.warning_chip_buttons = {}
        warning_rows = [
            [
                ("Çalkalayınız", "⚠️ Çalkalayınız"),
                ("Uyku Yapabilir", "🚗 Uyku Yapabilir"),
                ("Sütle Almayınız", "🥛 Sütle Almayınız"),
                ("Bol Su İle", "💧 Bol Su İle"),
            ],
            [
                ("Kutuyu Bitiriniz", "⏳ Kutuyu Bitiriniz"),
                ("Işıktan Koruyunuz", "☀️ Işıktan Koruyunuz"),
                ("Soğuk Zincir", "🧊 Buzdolabında (2-8°C)"),
                ("15 Gün", "⏱️ Açıldıktan Sonra 15 Gün"),
            ],
        ]
        for row_items in warning_rows:
            w_row = ttk.Frame(warn_card, style="Card.TFrame")
            w_row.pack(fill="x", pady=1)
            for tag_key, lbl in row_items:
                btn = ttk.Button(w_row, text=lbl, style="WarningChip.TButton", command=lambda t=tag_key: self._toggle_warning_chip(t))
                btn.pack(side="left", expand=True, fill="x", padx=1)
                self.warning_chip_buttons[tag_key] = btn

        # 5. Kısa Prospektüs ve Saklama Koşulu (Yan Yana Kompakt Düzen)
        details_frame = ttk.Frame(parent)
        details_frame.pack(fill="x", pady=(0, 8))

        detail_card = ttk.LabelFrame(details_frame, text=" ℹ️ Neden Kullanılır? (Kısa Prospektüs) ", padding=6)
        detail_card.pack(side="left", fill="both", expand=True, padx=(0, 4))
        self.detail_text = tk.Text(
            detail_card,
            height=2,
            wrap="word",
            font=(theme.FONT_FAMILY, 9),
            bg="#ffffff",
            fg=theme.TEXT_SECONDARY,
            relief="solid",
            borderwidth=1,
            highlightthickness=0,
        )
        self.detail_text.pack(fill="both", expand=True)
        self.detail_text.bind("<KeyRelease>", lambda e: self._refresh_preview())
        self.detail_text.bind("<Tab>", _handle_tab_key)
        self.detail_text.bind("<Shift-Tab>", _handle_shift_tab_key)

        storage_card = ttk.LabelFrame(details_frame, text=" ❄️ Saklama ", padding=6)
        storage_card.pack(side="right", fill="both", expand=True, padx=(4, 0))
        self.storage_var = tk.StringVar()
        self.storage_entry = ttk.Entry(storage_card, textvariable=self.storage_var)
        self.storage_entry.pack(fill="x", pady=4)

        # 6. Toplu Etiket Listesi (Sadece Toplu Mod Açıkken Görünür)
        self.batch_frame = ttk.LabelFrame(parent, text=" 📦 Toplu Etiket Listesi (Reçetedeki İlaçlar) ", padding=8)
        columns = ("drug", "instructions", "copies")
        self.batch_tree = ttk.Treeview(self.batch_frame, columns=columns, show="headings", height=4)
        for col, label, w in zip(columns, ("İlaç", "Kullanım Talimatı", "Adet"), (160, 200, 50)):
            self.batch_tree.heading(col, text=label)
            self.batch_tree.column(col, width=w)
        self.batch_tree.pack(fill="both", expand=True)
        self.batch_tree.bind("<Double-Button-1>", self._on_batch_double_click)

        batch_btns = ttk.Frame(self.batch_frame, style="Card.TFrame")
        batch_btns.pack(fill="x", pady=(6, 0))
        ttk.Button(batch_btns, text="➕ Listeye Ekle (Ctrl+Enter)", style="Primary.TButton", command=self._add_to_batch).pack(side="left")
        ttk.Button(batch_btns, text="🗑️ Seçileni Çıkar", command=self._remove_from_batch).pack(side="left", padx=(6, 0))
        ttk.Button(batch_btns, text="🧹 Listeyi Temizle", command=self._clear_batch).pack(side="left", padx=(6, 0))

        # 7. SABİT BİRİNCİL EYLEM ÇUBUĞU (ASLA EKRANDAN TAŞMAZ)
        action_bar = ttk.Frame(parent, padding=(0, 4))
        action_bar.pack(fill="x", side="bottom")

        self.print_btn = ttk.Button(
            action_bar,
            text="🖨️  Etiketi Yazdır (Ctrl+P)",
            style="Success.TButton",
            command=self._on_print,
        )
        self.print_btn.pack(side="left", fill="x", expand=True)

        ttk.Button(
            action_bar,
            text="💾  PDF Kaydet (Ctrl+S)",
            style="Primary.TButton",
            command=self._on_save_pdf,
        ).pack(side="left", padx=(8, 0))

        ttk.Button(
            action_bar,
            text="🧹  Temizle (Esc)",
            command=self._clear_form,
        ).pack(side="left", padx=(8, 0))

        # Sistem Yazıcısı Seçici
        sys_printers = ["(Varsayılan Yazıcı)"] + get_system_printers()
        ttk.Label(action_bar, text="🖨️", font=(theme.FONT_FAMILY, 9)).pack(side="left", padx=(8, 2))
        self.printer_combo = ttk.Combobox(
            action_bar,
            textvariable=self.selected_printer_var,
            values=sys_printers,
            width=16,
            state="readonly",
        )
        self.printer_combo.pack(side="left", padx=(0, 4))
        self.printer_combo.bind("<<ComboboxSelected>>", self._on_printer_selected)

        for var in (
            self.drug_var,
            self.purpose_var,
            self.diagnosis_var,
            self.patient_var,
            self.end_date_var,
            self.refill_date_var,
            self.storage_var,
            self.package_var,
            self.staff_var,
            self.note_var,
        ):
            var.trace_add("write", lambda *a: self._refresh_preview())

    def _build_preview_and_history(self, parent):
        preview_card = ttk.LabelFrame(parent, text=" 👁️ Canlı Etiket Önizleme ", padding=6)
        preview_card.pack(fill="both", expand=False)

        self.sticker_frame = tk.Frame(preview_card, bg="#ffffff", highlightbackground=theme.BORDER, highlightthickness=1)
        self.sticker_frame.pack(fill="both", expand=True, padx=4, pady=4)

        self.preview_text = tk.Text(
            self.sticker_frame,
            width=25,
            height=14,
            wrap="word",
            bg="#ffffff",
            fg=theme.TEXT_PRIMARY,
            relief="flat",
            highlightthickness=0,
            padx=8,
            pady=6,
        )
        self.preview_text.pack(fill="both", expand=True)
        self._configure_preview_tags(self.preview_text)

        preview_btn_bar = ttk.Frame(preview_card, style="Card.TFrame")
        preview_btn_bar.pack(fill="x", pady=(4, 0))
        ttk.Checkbutton(
            preview_btn_bar,
            text="🏷️ Barkod",
            variable=self.print_barcode_var,
            command=self._refresh_preview,
        ).pack(side="left")
        ttk.Checkbutton(
            preview_btn_bar,
            text="📊 Doz Çizelgesi",
            variable=self.print_dose_grid_var,
            command=self._refresh_preview,
        ).pack(side="left", padx=(6, 0))
        ttk.Button(preview_btn_bar, text="🔍 Büyüt", command=self._open_zoom_preview).pack(side="right")

        history_card = ttk.LabelFrame(parent, text=" 🕒 Son Yazdırılanlar ", padding=6)
        history_card.pack(fill="both", expand=True, pady=(6, 0))

        columns = ("time", "patient", "drug")
        self.history_tree = ttk.Treeview(history_card, columns=columns, show="headings", height=8)
        self.history_tree.heading("time", text="Saat")
        self.history_tree.heading("patient", text="Hasta")
        self.history_tree.heading("drug", text="İlaç")
        self.history_tree.column("time", width=55, stretch=False)
        self.history_tree.column("patient", width=95)
        self.history_tree.column("drug", width=120)
        self.history_tree.pack(fill="both", expand=True)
        self.history_tree.bind("<Double-Button-1>", self._on_history_double_click)

        hist_btn_bar = ttk.Frame(history_card, style="Card.TFrame")
        hist_btn_bar.pack(fill="x", pady=(4, 0))
        ttk.Button(hist_btn_bar, text="🔁 Tekrar Yazdır", style="Primary.TButton", command=self._reprint_selected_history).pack(side="left")
        ttk.Label(
            hist_btn_bar,
            text="💡 Çift tıkla yükle",
            style="Muted.TLabel",
        ).pack(side="right")

    def _configure_preview_tags(self, widget):
        widget.tag_configure("banner", background=theme.BG_LABEL_NAVY, foreground="#ffffff", justify="center", font=(theme.FONT_FAMILY, 8, "bold"), spacing1=2, spacing3=2)
        widget.tag_configure("drug_header", font=(theme.FONT_FAMILY, 10, "bold"), foreground="#0f172a")
        widget.tag_configure("small_date", font=(theme.FONT_FAMILY, 8), foreground="#64748b")
        widget.tag_configure("patient_info", font=(theme.FONT_FAMILY, 8, "bold"), foreground="#1e40af")
        widget.tag_configure("warning", font=(theme.FONT_FAMILY, 8, "bold"), foreground="#b91c1c")
        widget.tag_configure("warning_badge", background="#fee2e2", foreground="#991b1b", font=(theme.FONT_FAMILY, 8, "bold"), justify="center", spacing1=2, spacing3=2)
        widget.tag_configure("normal", font=(theme.FONT_FAMILY, 8), foreground="#334155")
        widget.tag_configure("instructions_bold", font=(theme.FONT_FAMILY, 10, "bold"), justify="center", foreground="#0f172a", spacing1=3, spacing3=3)
        widget.tag_configure("dose_grid", font=("Courier New", 7, "bold"), justify="center", foreground="#1e40af", spacing1=1, spacing3=1)
        widget.tag_configure("refill_badge", background="#d1fae5", foreground="#065f46", font=(theme.FONT_FAMILY, 8, "bold"), justify="center", spacing1=2, spacing3=2)
        widget.tag_configure("barcode_sim", font=("Courier New", 9, "bold"), justify="center", foreground="#334155")
        widget.tag_configure("barcode_code", font=("Courier New", 7), justify="center", foreground="#64748b")
        widget.tag_configure("footer_banner", background=theme.BG_LABEL_NAVY, foreground="#ffffff", justify="center", font=(theme.FONT_FAMILY, 8, "bold"), spacing1=2, spacing3=2)

    # ------------------------------------------------------------------
    # Etkileşim ve Olaylar
    # ------------------------------------------------------------------
    def _on_mode_change(self):
        if self.batch_mode.get():
            self.batch_frame.pack(fill="both", pady=(0, 8), before=self.print_btn.master)
            self.print_btn.config(text="🖨️  Toplu Etiketleri Yazdır (Ctrl+P)")
        else:
            self.batch_frame.pack_forget()
            self.print_btn.config(text="🖨️  Etiketi Yazdır (Ctrl+P)")

    def _clear_form(self):
        """Formdaki tüm girdi alanlarını sıfırlar."""
        self.barcode_var.set("")
        self.patient_var.set("")
        self.drug_var.set("")
        self.package_var.set("")
        self.purpose_var.set("")
        self.diagnosis_var.set("")
        self.note_var.set("")
        self.end_date_var.set("")
        self.refill_date_var.set("")
        self.copies_var.set(1)
        self.instructions_text.delete("1.0", "end")
        self.detail_text.delete("1.0", "end")
        self.storage_var.set("")

        # Doz zamanı ve açlık/tokluk sıfırlama
        for k in self.dose_times:
            self.dose_times[k] = False
            if k in self.dose_time_buttons:
                self.dose_time_buttons[k].configure(style="TimeChip.TButton")
        self.food_status.set("tok")
        for k, btn in self.food_buttons.items():
            btn.configure(style="ActiveTimeChip.TButton" if k == "tok" else "TimeChip.TButton")

        # Uyarı çipleri sıfırlama
        self.active_warning_tags.clear()
        for btn in self.warning_chip_buttons.values():
            btn.configure(style="WarningChip.TButton")

        if self.pediatric_mode.get():
            self._toggle_pediatric_mode()
        else:
            self._refresh_instruction_buttons(data.DEFAULT_FORM)

        self._refresh_preview()
        self._barcode_entry.focus_set()
        self._show_status("Form temizlendi, yeni etiket için hazır.")

    def _on_theme_selected(self, event=None):
        theme_map = {
            "☀️ Gündüz": "light",
            "🌙 Gece Nöbeti": "dark",
            "🌿 Eczane Yeşili": "emerald",
        }
        key = theme_map.get(self.theme_var.get(), "light")
        self._switch_theme(key)

    def _switch_theme(self, theme_key: str):
        self.theme_colors = theme.apply_theme(self, theme_key)
        self.configure(bg=self.theme_colors["bg_app"])
        self._reapply_native_widget_themes()
        self._configure_preview_tags(self.preview_text)
        self._refresh_preview()
        if self.active_profile and self.active_profile.get("id"):
            self.active_profile["theme"] = theme_key
            profiles.update_profile(self.active_profile["id"], theme=theme_key)
        self._show_status(f"✓ Arayüz teması değiştirildi: {self.theme_var.get()}")

    def _on_printer_selected(self, event=None):
        val = self.selected_printer_var.get()
        printer_to_save = None if val == "(Varsayılan Yazıcı)" else val
        if self.active_profile and self.active_profile.get("id"):
            self.active_profile["default_printer"] = printer_to_save
            profiles.update_profile(self.active_profile["id"], default_printer=printer_to_save)
        self._show_status(f"✓ Tercih edilen yazıcı kaydedildi: {val}")

    def _reapply_native_widget_themes(self):
        bg_card = self.theme_colors["bg_card"]
        text_primary = self.theme_colors["text_primary"]
        text_sec = self.theme_colors["text_secondary"]
        border = self.theme_colors["border"]
        for txt in (self.instructions_text, self.detail_text):
            txt.configure(bg=bg_card, fg=text_primary, insertbackground=text_primary)
        if hasattr(self, "sticker_frame"):
            self.sticker_frame.configure(highlightbackground=border)

    def _toggle_pediatric_mode(self):
        is_pediatric = not self.pediatric_mode.get()
        self.pediatric_mode.set(is_pediatric)
        if is_pediatric:
            self.pediatric_btn.configure(text="👶 Pediatrik [AÇIK]")
            self._show_status("👶 Pediatrik Mod aktif: Şurup ve damla ölçekleri yüklendi.")
            self._refresh_pediatric_instruction_buttons()
        else:
            self.pediatric_btn.configure(text="👶 Pediatrik Mod")
            self._show_status("Standart ilaç talimat modu etkin.")
            drug_rec = self._current_drug_record()
            form = drug_rec.get("form", "tablet") if drug_rec else "tablet"
            self._refresh_instruction_buttons(form)

    def _refresh_pediatric_instruction_buttons(self):
        for child in self.instr_buttons_frame.winfo_children():
            child.destroy()
        self.instr_buttons_frame.config(text=" 👶 Pediatrik Hızlı Doz Ölçekleri (Şurup / Damla / Süspansiyon) ")
        for i, tmpl in enumerate(data.PEDIATRIC_TEMPLATES):
            btn = ttk.Button(
                self.instr_buttons_frame,
                text=tmpl,
                style="Pediatric.TButton",
                command=lambda t=tmpl: self._append_instruction(t),
            )
            btn.grid(row=i // 2, column=i % 2, sticky="we", padx=3, pady=2)
        self.instr_buttons_frame.columnconfigure(0, weight=1)
        self.instr_buttons_frame.columnconfigure(1, weight=1)

    def _auto_calc_refill_date(self):
        pkg = self.package_var.get().strip()
        instr = self.instructions_text.get("1.0", "end").strip()
        if not pkg:
            messagebox.showinfo("Bilgi", "Lütfen ambalaj bilgisini girin (ör. '30 Tablet' veya '60 Kapsül').")
            return
        refill = data.calculate_refill_date(pkg, instr)
        if refill:
            self.refill_date_var.set(refill)
            self._refresh_preview()
            self._show_status(f"✓ SGK Kutu bitiş ve tekrar temin tarihi hesaplandı: {refill}")
        else:
            messagebox.showwarning("Hesaplama Uyarısı", "Ambalaj ve talimat metninden tablet sayısı ve günlük doz çıkarılamadı.\nÖrnek: '30 Tablet' ve '2x1'")

    def _insert_food_interaction(self, hint: str):
        current = self.detail_text.get("1.0", "end").strip()
        if hint in current:
            return
        new_val = f"{current} {hint}".strip()
        self.detail_text.delete("1.0", "end")
        self.detail_text.insert("1.0", new_val)
        self._refresh_preview()
        self._show_status(f"✓ Besin uyarısı eklendi: {hint}")

    def _toggle_dose_time(self, time_key: str):
        self.dose_times[time_key] = not self.dose_times[time_key]
        is_active = self.dose_times[time_key]
        if time_key in self.dose_time_buttons:
            self.dose_time_buttons[time_key].configure(
                style="ActiveTimeChip.TButton" if is_active else "TimeChip.TButton"
            )
        self._rebuild_instruction_from_matrix()

    def _set_food_status(self, status: str):
        self.food_status.set(status)
        for k, btn in self.food_buttons.items():
            btn.configure(style="ActiveTimeChip.TButton" if k == status else "TimeChip.TButton")
        self._rebuild_instruction_from_matrix()

    def _set_quick_dose_multiplier(self, multiplier: str):
        mapping = {
            "1x1": {"sabah": True, "ogle": False, "aksam": False, "gece": False},
            "2x1": {"sabah": True, "ogle": False, "aksam": True, "gece": False},
            "3x1": {"sabah": True, "ogle": True, "aksam": True, "gece": False},
            "4x1": {"sabah": True, "ogle": True, "aksam": True, "gece": True},
        }
        if multiplier in mapping:
            pattern = mapping[multiplier]
            for k, val in pattern.items():
                self.dose_times[k] = val
                if k in self.dose_time_buttons:
                    self.dose_time_buttons[k].configure(
                        style="ActiveTimeChip.TButton" if val else "TimeChip.TButton"
                    )
        self._rebuild_instruction_from_matrix(dose_prefix=f"Günde {multiplier}")

    def _rebuild_instruction_from_matrix(self, dose_prefix: Optional[str] = None):
        active_times = [k for k in ("sabah", "ogle", "aksam", "gece") if self.dose_times.get(k)]
        time_names = {
            "sabah": "Sabah",
            "ogle": "Öğle",
            "aksam": "Akşam",
            "gece": "Gece",
        }
        active_labels = [time_names[k] for k in active_times]

        food_labels = {
            "tok": "Tok karnına",
            "ac": "Aç karnına",
            "yemek_arasi": "Yemek aralarında",
        }
        food_str = food_labels.get(self.food_status.get(), "Tok karnına")

        if dose_prefix is None:
            count = len(active_times)
            if count > 0:
                dose_prefix = f"Günde {count}x1"
            else:
                dose_prefix = "Günde 1x1"

        if active_labels:
            times_str = "-".join(active_labels)
            instruction = f"{dose_prefix} ({times_str}) {food_str} alınız."
        else:
            instruction = f"{dose_prefix} {food_str} alınız."

        self.instructions_text.delete("1.0", "end")
        self.instructions_text.insert("1.0", instruction)
        pkg = self.package_var.get().strip()
        if pkg and self.print_refill_var.get():
            refill = data.calculate_refill_date(pkg, instruction)
            if refill:
                self.refill_date_var.set(refill)
        self._refresh_preview()

    def _toggle_warning_chip(self, tag_key: str):
        if tag_key in self.active_warning_tags:
            self.active_warning_tags.remove(tag_key)
            if tag_key in self.warning_chip_buttons:
                self.warning_chip_buttons[tag_key].configure(style="WarningChip.TButton")
        else:
            self.active_warning_tags.add(tag_key)
            if tag_key in self.warning_chip_buttons:
                self.warning_chip_buttons[tag_key].configure(style="ActiveWarningChip.TButton")
        self._refresh_preview()

    def _apply_majistral_mode(self):
        """Majistral (eczane yapımı) reçeteler için otomatik hazır alanları uygular."""
        if not self.drug_var.get().strip():
            self.drug_var.set("Majistral Formül / Yapma İlaç")
        if not self.package_var.get().strip():
            self.package_var.set("Şişe / Kutu")
        self.purpose_var.set("HARİCEN KULLANILIR - DOKTOR ÖNERİSİYLE")
        self.instructions_text.delete("1.0", "end")
        self.instructions_text.insert("1.0", "Günde 2x1 İlgili bölgeye haricen sürünüz.")
        self.storage_var.set("Serin ve ışıktan uzak yerde saklayınız")
        self.detail_text.delete("1.0", "end")
        self.detail_text.insert("1.0", "Eczanemizde hekim reçetesine uygun olarak taze hazırlanmıştır. Göze temas ettirmeyiniz.")

        target_date = _dt.date.today() + _dt.timedelta(days=30)
        self.end_date_var.set(target_date.strftime("%d.%m.%Y"))

        for tag in ("Çalkalayınız", "Işıktan Koruyunuz"):
            self.active_warning_tags.add(tag)
            if tag in self.warning_chip_buttons:
                self.warning_chip_buttons[tag].configure(style="ActiveWarningChip.TButton")

        self._refresh_preview()
        self._show_status("✓ Majistral (Yapma İlaç) modu uygulandı.")

    def _print_test_label(self):
        """Yazıcı kalibrasyonu ve hizalaması için tek tuşla test etiketi basar."""
        test_entry = LabelEntry(
            drug_name="TEST İLACI 500 MG",
            package_info="20 Tablet",
            kullanim_amaci_tani="YAZICI KALİBRASYON TESTİ",
            instructions="GÜNDE 2X1 TOK KARNINA (SABAH-AKŞAM)",
            detail_note="Bu bir test etiketidir. Yazıcı hizanızı, Türkçe karakterleri (ğ, ş, ı) ve baskı kalitesini kontrol ediniz.",
            storage_note="25°C altı oda sıcaklığında saklayınız",
            patient_name="TEST HASTASI",
            patient_note="Alerji Yok",
            end_date=_dt.date.today().strftime("%d.%m.%Y"),
            staff_name=self.staff_var.get().strip() or "Test",
            copies=1,
            warning_tags=["Çalkalayınız", "Bol Su İle"],
            print_barcode=True,
            barcode_value="8699500000001",
        )
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        build_label_pdf(self.active_profile, [test_entry], tmp.name)
        target_printer = None
        if hasattr(self, "selected_printer_var") and self.selected_printer_var.get() != "(Varsayılan Yazıcı)":
            target_printer = self.selected_printer_var.get().strip()
        success, error = print_pdf(tmp.name, printer_name=target_printer)
        if not success:
            open_anyway = messagebox.askyesno(
                "Test Baskısı Uyarısı",
                f"Test etiketi doğrudan yazıcıya gönderilemedi ({error}).\n\n"
                "Oluşturulan test PDF dosyasını görüntüleyicide açmak ister misiniz?",
            )
            if open_anyway:
                try:
                    os.startfile(tmp.name)
                except Exception as e:
                    messagebox.showerror("Hata", f"PDF açılamadı: {e}")
            return
        self._show_status("✓ Test etiketi başarıyla yazıcıya gönderildi.")

    def _on_header_template_selected(self, event=None):
        """Header üstündeki etiket boyutu combobox'ından boyut değiştirildiğinde profili günceller."""
        sel_display = self.header_template_var.get()
        tpl_key = next((k for k, v in profiles.LABEL_TEMPLATES.items() if v == sel_display), "thermal_50x30")
        self.active_profile["label_template"] = tpl_key
        profiles.update_profile(self.active_profile["id"], label_template=tpl_key)
        self._show_status(f"✓ Etiket boyutu değiştirildi: {sel_display}")
        self._refresh_preview()

    def _current_drug_barcode(self) -> Optional[str]:
        raw = self.barcode_var.get().strip()
        if raw:
            return data.extract_gtin_from_karekod(raw)
        drug = self._current_drug_record()
        if drug and drug.get("barcode"):
            return drug.get("barcode")
        return None


    def _clear_batch(self):
        self.batch_entries.clear()
        self.batch_tree.delete(*self.batch_tree.get_children())
        self._show_status("Toplu liste temizlendi.")

    def _on_drug_typed(self, event):
        query = self.drug_var.get()
        matches = data.search_drugs(query, self.drug_list)
        self.drug_combo["values"] = [d["name"] for d in matches]

    def _on_drug_enter_pressed(self, event=None):
        """İlaç combobox kutusunda Enter'a basıldığında ilk eşleşmeyi seçer."""
        query = self.drug_var.get().strip()
        if not query:
            return
        matches = data.search_drugs(query, self.drug_list)
        if matches:
            self.drug_var.set(matches[0]["name"])
            self._on_drug_selected()
            self.instructions_text.focus_set()

    def _on_drug_focus_out(self, event=None):
        """İlaç combobox kutusundan çıkıldığında tam eşleşme varsa formu doldurur."""
        query = self.drug_var.get().strip()
        if query:
            drug = data.find_drug(query, self.drug_list)
            if drug:
                self._on_drug_selected()

    def _current_drug_record(self):
        return data.find_drug(self.drug_var.get(), self.drug_list)

    def _on_drug_selected(self, event=None):
        """İlaç seçildiğinde form alanlarını ilacın güncel bilgileriyle temiz bir şekilde doldurur."""
        drug = self._current_drug_record()
        if not drug:
            query = self.drug_var.get().strip()
            matches = data.search_drugs(query, self.drug_list)
            if matches:
                drug = matches[0]
                self.drug_var.set(drug["name"])
            else:
                return

        # Seçilen ilacın güncel amacını koy (önceki ilacın amacını temizle)
        self.purpose_var.set(drug.get("kullanim_amaci") or "")

        # Seçilen ilacın prospektüsünü koy (önceki ilacın metnini sil)
        self.detail_text.delete("1.0", "end")
        if drug.get("kisa_prospektus"):
            self.detail_text.insert("1.0", drug["kisa_prospektus"])

        # Seçilen ilacın saklama koşulunu koy
        self.storage_var.set(drug.get("saklama_kosulu") or data.DEFAULT_SAKLAMA_KOSULU)

        form = drug.get("form", "tablet")
        self._refresh_instruction_buttons(form)

        # Eğer talimat boşsa veya başka bir formun genel standart şablonuysa, bu formun önerilen talimatını koy
        current_instr = self.instructions_text.get("1.0", "end").strip()
        all_default_templates = set()
        for t_list in data.INSTRUCTION_TEMPLATES_BY_FORM.values():
            all_default_templates.update(t_list)

        if not current_instr or current_instr in all_default_templates:
            templates = data.get_instruction_templates(form)
            if templates:
                self.instructions_text.delete("1.0", "end")
                self.instructions_text.insert("1.0", templates[0])

        # Otomatik ambalaj çıkarma ve kutu bitiş / SGK tekrar alım tarihi hesaplama
        extracted_pkg = data.extract_package_info(drug.get("name", ""))
        if extracted_pkg:
            self.package_var.set(extracted_pkg)
        pkg = self.package_var.get().strip() or extracted_pkg
        if pkg and self.print_refill_var.get():
            instr = self.instructions_text.get("1.0", "end").strip()
            refill = data.calculate_refill_date(pkg, instr)
            if refill:
                self.refill_date_var.set(refill)

        self._refresh_preview()

    def _auto_calc_refill_date(self):
        """Ambalaj bilgisi (ör. 20 Tablet) ve kullanım talimatına (ör. 2x1) göre
        SGK kutu bitiş / tekrar reçete yazdırabilme tarihini otomatik hesaplar.
        """
        pkg = self.package_var.get().strip()
        if not pkg:
            drug_name = self.drug_var.get().strip()
            extracted = data.extract_package_info(drug_name)
            if extracted:
                pkg = extracted
                self.package_var.set(pkg)

        if not pkg:
            self._show_status("⚠️ Lütfen önce ambalaj miktarını (ör. 20 Tablet, 100ml) girin.")
            return

        instr = self.instructions_text.get("1.0", "end").strip()
        refill = data.calculate_refill_date(pkg, instr)
        if refill:
            self.refill_date_var.set(refill)
            self._show_status(f"✓ SGK tekrar alım tarihi hesaplandı: {refill}")
            self._refresh_preview()
        else:
            self._show_status("⚠️ Doz veya ambalaj bilgisi ayrıştırılamadı (ör. '20 Tablet' ve '2x1' giriniz).")

    def _on_barcode_scanned(self, event=None):
        """Barkod okuyucudan gelen EAN-13 veya 2D Karekod ile ilacı bulur."""
        raw_code = self.barcode_var.get().strip()
        self.barcode_var.set("")
        if not raw_code:
            if self.batch_mode.get() and self.drug_var.get().strip():
                self._add_to_batch()
            return

        drug = data.find_drug_by_barcode(raw_code, self.drug_list)
        if not drug:
            gtin = data.extract_gtin_from_karekod(raw_code)
            answer = messagebox.askyesno(
                "Barkod Bulunamadı",
                f"'{gtin}' barkoduna ait kayıtlı ilaç bulunamadı.\n\n"
                "Bu barkod için şimdi hızlıca yeni bir ilaç kaydı oluşturmak ister misiniz?",
            )
            if answer:
                self._open_quick_add_drug_dialog(gtin)
            else:
                self._barcode_entry.focus_set()
            return

        self.drug_var.set(drug["name"])
        self._on_drug_selected()
        self._show_status(f"✓ Barkod okundu: {drug['name']}")
        self._barcode_entry.focus_set()

    def _open_quick_add_drug_dialog(self, barcode: str):
        """Bilinmeyen bir barkod okutulduğunda anında yeni ilaç ekleme penceresi."""
        top = tk.Toplevel(self)
        top.title("Hızlı İlaç Kaydı Ekle")
        top.geometry("480x360")
        top.configure(bg=theme.BG_CARD)

        card = ttk.Frame(top, style="Card.TFrame", padding=16)
        card.pack(fill="both", expand=True)

        ttk.Label(card, text="Hızlı İlaç Tanımlama", font=(theme.FONT_FAMILY, 11, "bold"), foreground=theme.PRIMARY).pack(anchor="w", pady=(0, 8))

        form = ttk.Frame(card, style="Card.TFrame")
        form.pack(fill="both", expand=True)

        ttk.Label(form, text="Barkod:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=4)
        b_var = tk.StringVar(value=barcode)
        ttk.Entry(form, textvariable=b_var, width=28).grid(row=0, column=1, sticky="w", pady=4, padx=(8, 0))

        ttk.Label(form, text="İlaç Adı *:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=4)
        n_var = tk.StringVar()
        name_entry = ttk.Entry(form, textvariable=n_var, width=32)
        name_entry.grid(row=1, column=1, sticky="we", pady=4, padx=(8, 0))
        name_entry.focus_set()

        ttk.Label(form, text="Form:", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=4)
        f_var = tk.StringVar(value="tablet")
        ttk.Combobox(form, textvariable=f_var, values=list(data.FORM_LABELS.keys()), state="readonly").grid(row=2, column=1, sticky="w", pady=4, padx=(8, 0))

        ttk.Label(form, text="Kullanım Amacı:", style="CardBold.TLabel").grid(row=3, column=0, sticky="w", pady=4)
        p_var = tk.StringVar()
        ttk.Entry(form, textvariable=p_var, width=32).grid(row=3, column=1, sticky="we", pady=4, padx=(8, 0))

        ttk.Label(form, text="Kısa Prospektüs:", style="CardBold.TLabel").grid(row=4, column=0, sticky="w", pady=4)
        pr_var = tk.StringVar()
        ttk.Entry(form, textvariable=pr_var, width=32).grid(row=4, column=1, sticky="we", pady=4, padx=(8, 0))
        form.columnconfigure(1, weight=1)

        def save_and_select():
            name = n_var.get().strip()
            if not name:
                messagebox.showwarning("Eksik Bilgi", "Lütfen ilaç adını girin.")
                return
            new_item = {
                "name": name,
                "form": f_var.get(),
                "barcode": b_var.get().strip() or barcode,
                "kullanim_amaci": p_var.get().strip() or None,
                "kisa_prospektus": pr_var.get().strip() or None,
                "saklama_kosulu": data.DEFAULT_SAKLAMA_KOSULU,
                "use_count": 0,
            }
            drugs = data.load_drug_list()
            drugs.append(new_item)
            data.save_drug_list(drugs)
            self.drug_list = data.load_drug_list()
            self.drug_combo["values"] = [d["name"] for d in self.drug_list]
            self.drug_var.set(name)
            self._on_drug_selected()
            top.destroy()
            self._show_status(f"✓ '{name}' sisteme eklendi ve seçildi.")

        btn_bar = ttk.Frame(card, style="Card.TFrame")
        btn_bar.pack(fill="x", pady=(12, 0))
        ttk.Button(btn_bar, text="💾 Kaydet ve Seç", style="Primary.TButton", command=save_and_select).pack(side="left")
        ttk.Button(btn_bar, text="İptal", command=top.destroy).pack(side="left", padx=(8, 0))
        top.grab_set()

    def _refresh_instruction_buttons(self, form):
        for child in self.instr_buttons_frame.winfo_children():
            child.destroy()
        form_label = data.FORM_LABELS.get(form, form.capitalize())
        self.instr_buttons_frame.config(text=f" ⚡ Hızlı Talimatlar ({form_label}) ")
        templates = data.get_instruction_templates(form)
        for i, tmpl in enumerate(templates):
            btn = ttk.Button(
                self.instr_buttons_frame,
                text=tmpl,
                style="Pill.TButton",
                command=lambda t=tmpl: self._append_instruction(t),
            )
            btn.grid(row=i // 2, column=i % 2, sticky="we", padx=3, pady=2)
        self.instr_buttons_frame.columnconfigure(0, weight=1)
        self.instr_buttons_frame.columnconfigure(1, weight=1)

    def _append_instruction(self, text):
        """Dozaj butonuna tıklandığında talimatı akıllıca ayarlar.
        
        Eğer önceki talimat 'Günde 1x1' ise ve yeni tıklanan 'Günde 2x1' ise
        eski dozajı yenisiyle değiştirir. Ekstra talimatları sonuna ekler.
        """
        current = self.instructions_text.get("1.0", "end").strip()
        if not current:
            new_text = text
        elif current.startswith("Günde ") and text.startswith("Günde "):
            new_text = text
        elif text in current:
            new_text = current
        else:
            new_text = f"{current} {text}".strip()

        self.instructions_text.delete("1.0", "end")
        self.instructions_text.insert("1.0", new_text)
        pkg = self.package_var.get().strip()
        if pkg and self.print_refill_var.get():
            refill = data.calculate_refill_date(pkg, new_text)
            if refill:
                self.refill_date_var.set(refill)
        self._refresh_preview()

    def _build_current_entry(self) -> LabelEntry:
        purpose = self.purpose_var.get().strip()
        diagnosis = self.diagnosis_var.get().strip()
        banner_parts = [p for p in (purpose, diagnosis) if p]
        banner = " - ".join(banner_parts) if banner_parts else None
        try:
            copies = max(1, int(self.copies_var.get()))
        except Exception:
            copies = 1
        refill = self.refill_date_var.get().strip() if self.print_refill_var.get() else None
        instr_text = self.instructions_text.get("1.0", "end").strip()
        dose_grid = data.parse_dose_grid(instr_text) if self.print_dose_grid_var.get() else None
        return LabelEntry(
            drug_name=self.drug_var.get().strip(),
            package_info=self.package_var.get().strip(),
            kullanim_amaci_tani=banner,
            instructions=instr_text,
            detail_note=self.detail_text.get("1.0", "end").strip() or None,
            storage_note=self.storage_var.get().strip() or None,
            patient_name=self.patient_var.get().strip() or None,
            patient_note=self.note_var.get().strip() or None,
            end_date=self.end_date_var.get().strip() or None,
            refill_date=refill,
            dose_grid=dose_grid,
            print_dose_grid=self.print_dose_grid_var.get(),
            staff_name=self.staff_var.get().strip() or None,
            warning_tags=list(self.active_warning_tags) if self.active_warning_tags else None,
            print_barcode=self.print_barcode_var.get(),
            barcode_value=self._current_drug_barcode(),
            copies=copies,
        )

    def _refresh_preview(self):
        entry = self._build_current_entry()
        self._render_preview(self.preview_text, entry)

    def _render_preview(self, widget, entry: LabelEntry):
        widget.configure(state="normal")
        widget.delete("1.0", "end")

        if entry.patient_name:
            widget.insert("end", f"👤 Hasta: {entry.patient_name}\n", "patient_info")
        if entry.patient_note:
            widget.insert("end", f"⚠️ Not: {entry.patient_note}\n", "warning")

        header = entry.drug_name or "(İlaç Seçilmedi)"
        if entry.package_info:
            header += f" {entry.package_info}"
        date_str = _dt.datetime.now().strftime("%d.%m.%Y %H:%M")
        if entry.end_date:
            date_str += f"  Bitiş: {entry.end_date}"
        if entry.refill_date:
            date_str += f"  Tekrar: {entry.refill_date}"
        widget.insert("end", f"{header}\n", "drug_header")
        widget.insert("end", f"{date_str}\n\n", "small_date")

        if entry.kullanim_amaci_tani:
            widget.insert("end", f"  {entry.kullanim_amaci_tani.upper()}  \n\n", "banner")

        if entry.warning_tags:
            widget.insert("end", f" ⚠️  {' • '.join(entry.warning_tags)} \n\n", "warning_badge")

        if entry.instructions:
            widget.insert("end", f"{entry.instructions.upper()}\n\n", "instructions_bold")

        if entry.print_dose_grid and entry.dose_grid:
            g = entry.dose_grid
            s = g.get("sabah", "-")
            o = g.get("öğle", "-")
            a = g.get("akşam", "-")
            ge = g.get("gece", "-")
            grid_art = (
                "┌───────┬───────┬───────┬───────┐\n"
                "│ SABAH │ ÖĞLE  │ AKŞAM │ GECE  │\n"
                "├───────┼───────┼───────┼───────┤\n"
                f"│ {s:^5} │ {o:^5} │ {a:^5} │ {ge:^5} │\n"
                "└───────┴───────┴───────┴───────┘\n\n"
            )
            widget.insert("end", grid_art, "dose_grid")

        if entry.detail_note:
            widget.insert("end", f"{entry.detail_note}\n\n", "normal")

        if entry.storage_note:
            widget.insert("end", f"❄️ Saklama: {entry.storage_note}\n\n", "small_date")

        if entry.print_barcode:
            code = entry.barcode_value or "8699500000000"
            widget.insert("end", "||| | |||| | || ||| || |||||\n", "barcode_sim")
            widget.insert("end", f"*{code}*\n\n", "barcode_code")

        footer = self.active_profile.get("name", "Eczanem")
        if self.active_profile.get("phone"):
            footer += f"  /  {self.active_profile['phone']}"
        if entry.staff_name:
            footer += f"  ({entry.staff_name})"
        widget.insert("end", f"  {footer}  ", "footer_banner")

        widget.configure(state="disabled")

    def _open_zoom_preview(self):
        top = tk.Toplevel(self)
        top.title("Büyütülmüş Etiket Önizleme")
        top.geometry("640x520")
        top.configure(bg=theme.BG_CARD)

        card = tk.Frame(top, bg="#ffffff", highlightbackground=theme.BORDER, highlightthickness=1)
        card.pack(fill="both", expand=True, padx=16, pady=16)

        text = tk.Text(
            card,
            wrap="word",
            font=(theme.FONT_FAMILY, 12),
            bg="#ffffff",
            fg=theme.TEXT_PRIMARY,
            padx=16,
            pady=16,
            relief="flat",
        )
        text.pack(fill="both", expand=True)
        self._configure_preview_tags(text)
        text.tag_configure("banner", background=theme.BG_LABEL_NAVY, foreground="#ffffff", justify="center", font=(theme.FONT_FAMILY, 11, "bold"), spacing1=4, spacing3=4)
        text.tag_configure("drug_header", font=(theme.FONT_FAMILY, 14, "bold"), foreground="#0f172a")
        text.tag_configure("instructions_bold", font=(theme.FONT_FAMILY, 14, "bold"), justify="center", foreground="#0f172a", spacing1=6, spacing3=6)
        text.tag_configure("footer_banner", background=theme.BG_LABEL_NAVY, foreground="#ffffff", justify="center", font=(theme.FONT_FAMILY, 11, "bold"), spacing1=4, spacing3=4)
        text.tag_configure("normal", font=(theme.FONT_FAMILY, 11))
        text.tag_configure("warning_badge", background="#fee2e2", foreground="#991b1b", font=(theme.FONT_FAMILY, 10, "bold"), justify="center", spacing1=3, spacing3=3)
        text.tag_configure("barcode_sim", font=("Courier New", 12, "bold"), justify="center", foreground="#334155")
        text.tag_configure("barcode_code", font=("Courier New", 9), justify="center", foreground="#64748b")

        self._render_preview(text, self._build_current_entry())

        btn_bar = ttk.Frame(top, style="Card.TFrame", padding=(16, 0, 16, 12))
        btn_bar.pack(fill="x")

        def print_and_close():
            top.destroy()
            self._on_print()

        ttk.Button(btn_bar, text="🖨️ Yazdır (Ctrl+P)", style="Success.TButton", command=print_and_close).pack(side="left")
        ttk.Button(btn_bar, text="Kapat", command=top.destroy).pack(side="right")

    def _build_entry_from_parsed(self, parsed: "prescription_parser.ParsedLine") -> LabelEntry:
        drug = parsed.matched_drug
        pkg = self.package_var.get().strip() or (data.extract_package_info(parsed.drug_name) or "")
        instr_text = parsed.instructions or ""
        refill = None
        if self.print_refill_var.get() and pkg:
            refill = data.calculate_refill_date(pkg, instr_text)
        dose_grid = data.parse_dose_grid(instr_text) if self.print_dose_grid_var.get() else None
        return LabelEntry(
            drug_name=parsed.drug_name,
            package_info=pkg,
            kullanim_amaci_tani=(drug.get("kullanim_amaci") if drug else self.purpose_var.get().strip() or None),
            instructions=instr_text,
            detail_note=(drug.get("kisa_prospektus") if drug else None),
            storage_note=(drug.get("saklama_kosulu") if drug else None),
            patient_name=self.patient_var.get().strip() or None,
            patient_note=self.note_var.get().strip() or None,
            end_date=self.end_date_var.get().strip() or None,
            refill_date=refill,
            dose_grid=dose_grid,
            print_dose_grid=self.print_dose_grid_var.get(),
            staff_name=self.staff_var.get().strip() or None,
            print_barcode=self.print_barcode_var.get(),
            barcode_value=(drug.get("barcode") if drug else None),
            copies=1,
        )

    def _open_quick_paste_dialog(self):
        """Medula veya reçete metnini ayrıştırma penceresi."""
        top = tk.Toplevel(self)
        top.title("Hızlı Yapıştır — Reçete Metni")
        top.geometry("700x540")
        top.configure(bg=theme.BG_APP)

        frame = ttk.Frame(top, padding=12)
        frame.pack(fill="both", expand=True)

        ttk.Label(
            frame,
            text=(
                "Medula veya sisteminizden kopyaladığınız reçete metnini aşağıya yapıştırın.\n"
                "Her satır ayrı bir ilaç olarak otomatik olarak ayrıştırılacaktır."
            ),
            justify="left",
            style="Muted.TLabel",
        ).pack(fill="x", pady=(0, 6))

        text_widget = tk.Text(frame, height=6, wrap="word", font=(theme.FONT_FAMILY, 9), bg="#ffffff", relief="solid", borderwidth=1)
        text_widget.pack(fill="x", pady=(0, 8))

        columns = ("line", "drug", "instructions", "status")
        tree = ttk.Treeview(frame, columns=columns, show="headings", height=9)
        for col, label in zip(columns, ("Yapıştırılan Satır", "İlaç", "Talimat", "Durum")):
            tree.heading(col, text=label)
        tree.column("line", width=180)
        tree.column("drug", width=140)
        tree.column("instructions", width=180)
        tree.column("status", width=100)
        tree.pack(fill="both", expand=True, pady=(0, 8))

        parsed_lines = []

        def do_parse():
            nonlocal parsed_lines
            tree.delete(*tree.get_children())
            raw_text = text_widget.get("1.0", "end")
            meta = prescription_parser.extract_prescription_metadata(raw_text)
            if meta.get("patient_name") and not self.patient_var.get().strip():
                self.patient_var.set(meta["patient_name"])
            if meta.get("diagnosis") and not self.purpose_var.get().strip():
                self.purpose_var.set(meta["diagnosis"])

            parsed_lines = prescription_parser.parse_prescription_text(raw_text, self.drug_list)
            for p in parsed_lines:
                status = "Eşleşti" if p.matched_drug else "Eşleşmedi"
                tree.insert("", "end", values=(p.raw_line, p.drug_name, p.instructions, status))
            if not parsed_lines:
                messagebox.showinfo("Boş", "Ayrıştırılacak bir satır bulunamadı.")

        def transfer_to_batch():
            if not parsed_lines:
                messagebox.showwarning("Önce Ayrıştırın", "Lütfen önce 'Ayrıştır' butonuna basın.")
                return
            self.batch_mode.set(True)
            self._on_mode_change()
            added = 0
            for p in parsed_lines:
                if not p.drug_name:
                    continue
                entry = self._build_entry_from_parsed(p)
                self.batch_entries.append(entry)
                iid = str(uuid.uuid4())
                self.batch_tree.insert("", "end", iid=iid, values=(entry.drug_name, entry.instructions, entry.copies))
                added += 1
            top.destroy()
            self._show_status(f"✓ {added} ilaç toplu etiket listesine aktarıldı.")

        btns = ttk.Frame(frame)
        btns.pack(fill="x")
        ttk.Button(btns, text="🔍 Ayrıştır", style="Primary.TButton", command=do_parse).pack(side="left")
        ttk.Button(btns, text="📦 Toplu Moda Aktar", style="Success.TButton", command=transfer_to_batch).pack(side="left", padx=(8, 0))
        ttk.Button(btns, text="Kapat", command=top.destroy).pack(side="right")

        # Otomatik panodan yapıştırma desteği
        try:
            clipboard_text = top.clipboard_get().strip()
            if clipboard_text:
                text_widget.insert("1.0", clipboard_text)
                top.after(100, do_parse)
        except Exception:
            pass
        text_widget.focus_set()

    def _add_to_batch(self):
        """Mevcut ilacı toplu listeye ekler ve formdaki ilaç alanını bir sonraki ilaç için temizler."""
        entry = self._build_current_entry()
        if not entry.drug_name:
            messagebox.showwarning("Eksik Bilgi", "Lütfen önce bir ilaç adı seçin veya girin.")
            return
        self.batch_entries.append(entry)
        iid = str(uuid.uuid4())
        self.batch_tree.insert("", "end", iid=iid, values=(entry.drug_name, entry.instructions, entry.copies))

        # Hasta adı ve personel KORUNUR, sadece ilaç ve talimat alanları sıfırlanır
        self.drug_var.set("")
        self.package_var.set("")
        self.purpose_var.set("")
        self.refill_date_var.set("")
        self.instructions_text.delete("1.0", "end")
        self.detail_text.delete("1.0", "end")
        self.storage_var.set("")
        self.copies_var.set(1)
        self._refresh_instruction_buttons(data.DEFAULT_FORM)
        self._refresh_preview()
        self.drug_combo.focus_set()
        self._show_status(f"✓ '{entry.drug_name}' listeye eklendi ({len(self.batch_entries)} ilaç kuyrukta).")

    def _remove_from_batch(self):
        selected = self.batch_tree.selection()
        for iid in selected:
            index = self.batch_tree.index(iid)
            self.batch_tree.delete(iid)
            if 0 <= index < len(self.batch_entries):
                del self.batch_entries[index]
        self._show_status(f"Seçili ilaç çıkarıldı ({len(self.batch_entries)} ilaç kaldı).")

    def _on_batch_double_click(self, event=None):
        """Toplu listedeki bir öğeye çift tıklandığında düzenlenmek üzere forma geri yükler."""
        sel = self.batch_tree.selection()
        if not sel:
            return
        iid = sel[0]
        index = self.batch_tree.index(iid)
        if 0 <= index < len(self.batch_entries):
            entry = self.batch_entries[index]
            self.drug_var.set(entry.drug_name)
            self.package_var.set(entry.package_info or "")
            self.purpose_var.set(entry.kullanim_amaci_tani or "")
            self.refill_date_var.set(entry.refill_date or "")
            self.print_dose_grid_var.set(bool(entry.print_dose_grid))
            self.instructions_text.delete("1.0", "end")
            if entry.instructions:
                self.instructions_text.insert("1.0", entry.instructions)
            self.detail_text.delete("1.0", "end")
            if entry.detail_note:
                self.detail_text.insert("1.0", entry.detail_note)
            self.storage_var.set(entry.storage_note or "")
            self.copies_var.set(entry.copies)
            self._remove_from_batch()
            self._refresh_preview()
            self._show_status(f"'{entry.drug_name}' düzenlenmek üzere forma aktarıldı.")

    def _entries_to_print(self):
        if self.batch_mode.get() and self.batch_entries:
            return list(self.batch_entries)
        entry = self._build_current_entry()
        if not entry.drug_name:
            return []
        return [entry]

    def _invalid_end_dates(self, entries):
        return [e.drug_name for e in entries if e.end_date and not _END_DATE_RE.match(e.end_date)]

    def _confirm_or_warn_invalid_dates(self, entries) -> bool:
        invalid = self._invalid_end_dates(entries)
        if not invalid:
            return True
        return messagebox.askyesno(
            "Tarih Formatı",
            "Şu ilaç(lar)da tedavi bitiş tarihi 'GG.AA.YYYY' formatında görünmüyor:\n\n"
            + "\n".join(invalid)
            + "\n\nYine de devam edilsin mi?",
        )

    def _log_and_bump(self, entries):
        for entry in entries:
            history.log_label(
                {
                    "patient_name": entry.patient_name,
                    "drug_name": entry.drug_name,
                    "package_info": entry.package_info,
                    "kullanim_amaci_tani": entry.kullanim_amaci_tani,
                    "instructions": entry.instructions,
                    "detail_note": entry.detail_note,
                    "storage_note": entry.storage_note,
                    "patient_note": entry.patient_note,
                    "end_date": entry.end_date,
                    "refill_date": entry.refill_date,
                    "staff_name": entry.staff_name,
                    "warning_tags": entry.warning_tags,
                    "print_barcode": entry.print_barcode,
                    "barcode_value": entry.barcode_value,
                }
            )
            data.bump_use_count(entry.drug_name)
        if entries and entries[0].staff_name:
            staff.add_staff(entries[0].staff_name)
        self.drug_list = data.load_drug_list()
        self._refresh_history_list()

    def _on_print(self):
        entries = self._entries_to_print()
        if not entries:
            messagebox.showwarning("Eksik Bilgi", "Lütfen önce bir ilaç adı girin veya toplu listeye ekleyin.")
            return
        if not self._confirm_or_warn_invalid_dates(entries):
            return
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        build_label_pdf(self.active_profile, entries, tmp.name)
        target_printer = None
        if hasattr(self, "selected_printer_var") and self.selected_printer_var.get() != "(Varsayılan Yazıcı)":
            target_printer = self.selected_printer_var.get().strip()
        success, error = print_pdf(tmp.name, printer_name=target_printer)
        if not success:
            open_anyway = messagebox.askyesno(
                "Yazdırma Uyarısı",
                f"Etiket doğrudan yazıcıya gönderilemedi ({error}).\n\n"
                "PDF belgesini varsayılan görüntüleyicide açıp oradan yazdırmak ister misiniz?",
            )
            if open_anyway:
                try:
                    os.startfile(tmp.name)
                except Exception as e:
                    messagebox.showerror("Hata", f"PDF açılamadı: {e}")
            return

        self._log_and_bump(entries)
        count = len(entries)
        if self.batch_mode.get():
            self._clear_batch()
            self._show_status(f"✓ {count} adet toplu etiket yazıcıya gönderildi.")
        else:
            self._show_status(f"✓ '{entries[0].drug_name}' etiketi yazdırıldı.")
            self._barcode_entry.focus_set()

    def _on_save_pdf(self):
        entries = self._entries_to_print()
        if not entries:
            messagebox.showwarning("Eksik Bilgi", "Lütfen önce bir ilaç adı girin veya toplu listeye ekleyin.")
            return
        if not self._confirm_or_warn_invalid_dates(entries):
            return
        path = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF Dosyası", "*.pdf")])
        if not path:
            return
        build_label_pdf(self.active_profile, entries, path)
        self._log_and_bump(entries)
        count = len(entries)
        if self.batch_mode.get():
            self._clear_batch()
            self._show_status(f"✓ {count} adet toplu etiket PDF olarak kaydedildi: {os.path.basename(path)}")
        else:
            self._show_status(f"✓ Etiket PDF olarak kaydedildi: {os.path.basename(path)}")
            self._barcode_entry.focus_set()
        messagebox.showinfo("Kaydedildi", f"Etiket PDF olarak kaydedildi:\n{path}")

    def _refresh_history_list(self):
        self.history_tree.delete(*self.history_tree.get_children())
        self._history_records = history.load_history()[:50]
        for r in self._history_records:
            ts = r.get("timestamp", "")
            time_display = ts
            if "T" in ts:
                try:
                    dt = _dt.datetime.fromisoformat(ts)
                    time_display = dt.strftime("%d.%m %H:%M")
                except Exception:
                    time_display = ts[:16].replace("T", " ")
            patient = r.get("patient_name") or "-"
            drug = r.get("drug_name", "")
            self.history_tree.insert("", "end", values=(time_display, patient, drug))

    def _on_history_double_click(self, event):
        selection = self.history_tree.selection()
        if not selection:
            return
        index = self.history_tree.index(selection[0])
        if 0 <= index < len(self._history_records):
            record = self._history_records[index]
            self.diagnosis_var.set("")
            self.purpose_var.set("")
            self.note_var.set("")
            self.storage_var.set("")
            self.package_var.set("")
            self.detail_text.delete("1.0", "end")

            self.patient_var.set(record.get("patient_name") or "")
            self.drug_var.set(record.get("drug_name") or "")
            self.package_var.set(record.get("package_info") or "")
            self._on_drug_selected()

            self.purpose_var.set(record.get("kullanim_amaci_tani") or self.purpose_var.get())
            if record.get("instructions"):
                self.instructions_text.delete("1.0", "end")
                self.instructions_text.insert("1.0", record.get("instructions"))
            if record.get("detail_note"):
                self.detail_text.delete("1.0", "end")
                self.detail_text.insert("1.0", record.get("detail_note"))
            if record.get("storage_note"):
                self.storage_var.set(record.get("storage_note"))
            self.note_var.set(record.get("patient_note") or "")
            self.end_date_var.set(record.get("end_date") or "")
            if record.get("refill_date"):
                self.refill_date_var.set(record.get("refill_date"))
            self.staff_var.set(record.get("staff_name") or "")

            # Uyarı çipleri ve barkod ayarlarını geri yükle
            self.active_warning_tags.clear()
            saved_tags = record.get("warning_tags") or []
            for t in saved_tags:
                self.active_warning_tags.add(t)
            for k, btn in self.warning_chip_buttons.items():
                btn.configure(style="ActiveWarningChip.TButton" if k in self.active_warning_tags else "WarningChip.TButton")

            if "print_barcode" in record:
                self.print_barcode_var.set(bool(record["print_barcode"]))

            self._refresh_preview()
            self._show_status(f"✓ '{record.get('drug_name')}' geçmiş kaydı yüklendi.")

    def _reprint_selected_history(self):
        """Geçmiş listesinden seçilen kaydı doğrudan tekrar yazdırır."""
        selection = self.history_tree.selection()
        if not selection:
            messagebox.showwarning("Seçim Yapılmadı", "Lütfen önce geçmiş listesinden yazdırmak istediğiniz bir kayda tıklayın.")
            return
        index = self.history_tree.index(selection[0])
        if 0 <= index < len(self._history_records):
            record = self._history_records[index]
            entry = LabelEntry(
                drug_name=record.get("drug_name", ""),
                package_info=record.get("package_info", ""),
                kullanim_amaci_tani=record.get("kullanim_amaci_tani"),
                instructions=record.get("instructions", ""),
                detail_note=record.get("detail_note"),
                storage_note=record.get("storage_note"),
                patient_name=record.get("patient_name"),
                patient_note=record.get("patient_note"),
                end_date=record.get("end_date"),
                refill_date=record.get("refill_date"),
                staff_name=record.get("staff_name"),
                warning_tags=record.get("warning_tags"),
                print_barcode=bool(record.get("print_barcode")),
                barcode_value=record.get("barcode_value"),
                copies=1,
            )
            tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            tmp.close()
            build_label_pdf(self.active_profile, [entry], tmp.name)
            target_printer = None
            if hasattr(self, "selected_printer_var") and self.selected_printer_var.get() != "(Varsayılan Yazıcı)":
                target_printer = self.selected_printer_var.get().strip()
            success, error = print_pdf(tmp.name, printer_name=target_printer)
            if not success:
                messagebox.showerror("Yazdırma Hatası", f"Etiket yazıcıya gönderilemedi: {error}")
                return
            self._log_and_bump([entry])
            self._show_status(f"✓ '{entry.drug_name}' etiketi geçmişten tekrar yazdırıldı.")

    def _show_about(self):
        messagebox.showinfo(
            "Hakkında",
            f"Eczane İlaç Etiketi Programı — Sürüm {__version__}\n\n"
            "Bağımsız, ücretsiz ve açık kaynak (MIT) bir masaüstü uygulamasıdır.\n"
            "Hesap, bulut, abonelik gerektirmez — tüm veriler yerel bilgisayarınızda saklanır.\n\n"
            "Kaynak Kod ve Güncellemeler:\n"
            "https://github.com/Bluetwinklez/eczane-etiket",
        )

    def _open_admin_panel(self):
        if self.active_profile.get("pin_hash"):
            pin = simpledialog.askstring("Admin Paneli", "PIN girin:", show="*")
            if pin is None:
                return
            if not profiles.verify_pin(self.active_profile, pin):
                messagebox.showerror("Hatalı PIN", "Girilen PIN yanlış.")
                return
        from .admin_panel import open_admin_panel

        open_admin_panel(self, on_close=self._on_admin_panel_closed)

    def _on_admin_panel_closed(self):
        self.active_profile = profiles.get_active_profile()
        self._update_profile_display()
        self.drug_list = data.load_drug_list()
        self.drug_combo["values"] = [d["name"] for d in self.drug_list]
        self.staff_combo["values"] = staff.load_staff()
        self._refresh_preview()


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
