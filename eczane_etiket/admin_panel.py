"""Admin Paneli — profiller, ilaç listesi, veri kaynağı, şablonlar, personel,
geçmiş/raporlar, stok/SKT takibi ve yedekleme burada toplanır.

Ana ekran (main.py) günlük kullanım için sade kalsın diye tüm yönetimsel
işler bu ayrı pencerede yer alır.
"""

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from . import backup, data, drug_api, drug_import, history, profiles, staff, stats, stock, theme
from .label_pdf import LABEL_SIZES_MM, get_system_printers
from .profiles import LABEL_TEMPLATES


def open_admin_panel(parent, on_close=None):
    win = tk.Toplevel(parent)
    win.title("Eczane Yönetim & Admin Paneli")
    win.geometry("960x650")
    win.minsize(880, 560)
    win.configure(bg=theme.BG_APP)

    header = ttk.Frame(win, style="Header.TFrame", padding=(16, 10))
    header.pack(fill="x")
    ttk.Label(header, text="⚙️ Eczane Yönetim ve Ayarlar", style="HeaderTitle.TLabel").pack(side="left")

    notebook = ttk.Notebook(win)
    notebook.pack(fill="both", expand=True, padx=10, pady=10)

    _build_profiles_tab(notebook)
    _build_drugs_tab(notebook)
    _build_stock_tab(notebook)
    _build_history_tab(notebook)
    _build_stats_tab(notebook)
    _build_templates_tab(notebook)
    _build_staff_tab(notebook)
    _build_api_tab(notebook)
    _build_backup_tab(notebook)

    def _close():
        if on_close:
            on_close()
        win.destroy()

    bottom_bar = ttk.Frame(win, padding=(10, 0, 10, 10))
    bottom_bar.pack(fill="x")
    ttk.Button(bottom_bar, text="Kapat", command=_close).pack(side="right")
    win.protocol("WM_DELETE_WINDOW", _close)


# ----------------------------------------------------------------------
# Ortak Seçim Penceresi
# ----------------------------------------------------------------------
def _ask_choice(title, prompt, choices, current=None):
    top = tk.Toplevel()
    top.title(title)
    top.configure(bg=theme.BG_CARD)
    card = ttk.Frame(top, style="Card.TFrame", padding=16)
    card.pack(fill="both", expand=True)

    ttk.Label(card, text=prompt, style="CardBold.TLabel").pack(anchor="w", pady=(0, 6))
    var = tk.StringVar(value=current or (choices[0] if choices else ""))
    combo = ttk.Combobox(card, textvariable=var, values=choices, state="readonly", width=30)
    combo.pack(fill="x", pady=4)
    result = {}

    def confirm():
        result["value"] = var.get()
        top.destroy()

    ttk.Button(card, text="Tamam", style="Primary.TButton", command=confirm).pack(pady=(12, 0))
    top.grab_set()
    top.wait_window()
    return result.get("value")


# ----------------------------------------------------------------------
# 1. Profiller Sekmesi
# ----------------------------------------------------------------------
def _build_profiles_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="🏥 Eczane Profilleri")

    columns = ("name", "phone", "template", "printer", "theme", "pin", "qr")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=12)
    for col, label, w in zip(
        columns,
        ("Eczane Adı", "Telefon", "Etiket Şablonu", "Varsayılan Yazıcı", "Tema", "PIN Kilidi", "QR Kod"),
        (190, 110, 150, 130, 90, 75, 75),
    ):
        tree.heading(col, text=label)
        tree.column(col, width=w)
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        state = profiles.load_state()
        theme_names = {"light": "☀️ Gündüz", "dark": "🌙 Gece", "emerald": "🌿 Yeşil"}
        for p in state["profiles"]:
            mark = "★ (Aktif) " if p["id"] == state.get("active_id") else ""
            pin_status = "Kilitli" if p.get("pin_hash") else "Yok"
            qr_status = "Açık" if p.get("qr_enabled") else "Kapalı"
            printer_disp = p.get("default_printer") or "(Varsayılan)"
            th_disp = theme_names.get(p.get("theme", "light"), "☀️ Gündüz")
            tree.insert(
                "", "end", iid=p["id"],
                values=(
                    mark + p["name"],
                    p.get("phone", ""),
                    LABEL_TEMPLATES.get(p.get("label_template", ""), ""),
                    printer_disp,
                    th_disp,
                    pin_status,
                    qr_status,
                ),
            )

    def get_selected_id():
        sel = tree.selection()
        return sel[0] if sel else None

    def add_profile():
        _open_profile_dialog(None, on_save=refresh)

    def edit_profile():
        pid = get_selected_id()
        if not pid:
            messagebox.showinfo("Seçim Yapın", "Lütfen düzenlemek istediğiniz profili seçin.")
            return
        profile = next((p for p in profiles.load_profiles() if p["id"] == pid), None)
        if not profile:
            return
        _open_profile_dialog(profile, on_save=refresh)

    def delete_profile():
        pid = get_selected_id()
        if not pid:
            return
        if messagebox.askyesno("Silme Onayı", "Bu profili silmek istiyor musunuz?"):
            profiles.delete_profile(pid)
            refresh()

    def set_active():
        pid = get_selected_id()
        if pid:
            profiles.set_active_profile(pid)
            refresh()

    def set_pin():
        pid = get_selected_id()
        if not pid:
            return
        pin = simpledialog.askstring("PIN Ayarla", "Yeni PIN (boş bırakırsanız kilit kaldırılır):", show="*")
        profile = next((p for p in profiles.load_profiles() if p["id"] == pid), None)
        if profile is None:
            return
        profiles.set_pin(profile, pin or None)
        profiles.update_profile(pid, pin_hash=profile["pin_hash"])
        refresh()

    def set_logo():
        pid = get_selected_id()
        if not pid:
            return
        path = filedialog.askopenfilename(filetypes=[("Görsel Dosyaları", "*.png *.jpg *.jpeg *.bmp")])
        if path:
            profiles.update_profile(pid, logo_path=path)
            refresh()

    def toggle_qr():
        pid = get_selected_id()
        if not pid:
            return
        profile = next((p for p in profiles.load_profiles() if p["id"] == pid), None)
        if not profile:
            return
        new_value = not profile.get("qr_enabled", False)
        profiles.update_profile(pid, qr_enabled=new_value)
        state_text = "açıldı" if new_value else "kapatıldı"
        messagebox.showinfo(
            "QR Kod Ayarı",
            f"'{profile['name']}' profili için etiket QR kodu {state_text}.\n\n"
            "Not: QR kod yalnızca 'A4 Sayfa - 6'lı Etiket Izgarası' şablonunda "
            "gösterilir.",
        )
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(8, 0))
    ttk.Button(btns, text="➕ Yeni Ekle", style="Primary.TButton", command=add_profile).pack(side="left", padx=(0, 4))
    ttk.Button(btns, text="✏️ Düzenle", command=edit_profile).pack(side="left", padx=4)
    ttk.Button(btns, text="★ Aktif Yap", command=set_active).pack(side="left", padx=4)
    ttk.Button(btns, text="🔒 PIN Kodu", command=set_pin).pack(side="left", padx=4)
    ttk.Button(btns, text="🖼️ Logo Seç", command=set_logo).pack(side="left", padx=4)
    ttk.Button(btns, text="📱 QR Kod Aç/Kapat", command=toggle_qr).pack(side="left", padx=4)
    ttk.Button(btns, text="🗑️ Sil", style="Danger.TButton", command=delete_profile).pack(side="right")

    tree.bind("<Double-Button-1>", lambda e: edit_profile())
    refresh()


def _open_profile_dialog(existing_profile: dict = None, on_save=None):
    """Eczane profili ekleme ve düzenleme için açılan temiz form penceresi."""
    top = tk.Toplevel()
    is_edit = existing_profile is not None
    top.title("Eczane Profili Düzenle" if is_edit else "Yeni Eczane Profili Ekle")
    top.geometry("500x370")
    top.configure(bg=theme.BG_CARD)

    card = ttk.Frame(top, style="Card.TFrame", padding=16)
    card.pack(fill="both", expand=True)

    ttk.Label(
        card,
        text="Eczane Profil Bilgileri",
        font=(theme.FONT_FAMILY, 12, "bold"),
        foreground=theme.PRIMARY,
    ).pack(anchor="w", pady=(0, 10))

    form = ttk.Frame(card, style="Card.TFrame")
    form.pack(fill="both", expand=True)

    ttk.Label(form, text="Eczane Adı *:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=6)
    name_var = tk.StringVar(value=existing_profile.get("name", "") if is_edit else "")
    name_entry = ttk.Entry(form, textvariable=name_var, width=30)
    name_entry.grid(row=0, column=1, sticky="we", pady=6, padx=(8, 0))
    name_entry.focus_set()

    ttk.Label(form, text="Telefon Numarası:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=6)
    phone_var = tk.StringVar(value=existing_profile.get("phone", "") if is_edit else "")
    ttk.Entry(form, textvariable=phone_var, width=30).grid(row=1, column=1, sticky="we", pady=6, padx=(8, 0))

    ttk.Label(form, text="Varsayılan Şablon:", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=6)
    template_labels = list(LABEL_TEMPLATES.values())
    key_by_label = {v: k for k, v in LABEL_TEMPLATES.items()}
    cur_key = existing_profile.get("label_template", "thermal_50x30") if is_edit else "thermal_50x30"
    tpl_var = tk.StringVar(value=LABEL_TEMPLATES.get(cur_key, template_labels[0]))
    ttk.Combobox(form, textvariable=tpl_var, values=template_labels, state="readonly", width=30).grid(row=2, column=1, sticky="we", pady=6, padx=(8, 0))

    # Tema Tercihi
    ttk.Label(form, text="Arayüz Teması:", style="CardBold.TLabel").grid(row=3, column=0, sticky="w", pady=6)
    theme_choices = {
        "☀️ Gündüz": "light",
        "🌙 Gece Nöbeti": "dark",
        "🌿 Eczane Yeşili": "emerald",
    }
    cur_th_key = existing_profile.get("theme", "light") if is_edit else "light"
    cur_th_label = next((k for k, v in theme_choices.items() if v == cur_th_key), "☀️ Gündüz")
    theme_var = tk.StringVar(value=cur_th_label)
    ttk.Combobox(form, textvariable=theme_var, values=list(theme_choices.keys()), state="readonly", width=30).grid(row=3, column=1, sticky="we", pady=6, padx=(8, 0))

    # Varsayılan Yazıcı Tercihi
    ttk.Label(form, text="Varsayılan Yazıcı:", style="CardBold.TLabel").grid(row=4, column=0, sticky="w", pady=6)
    printers_list = ["(Varsayılan Yazıcı)"] + get_system_printers()
    saved_pr = (existing_profile.get("default_printer") if is_edit else None) or "(Varsayılan Yazıcı)"
    printer_var = tk.StringVar(value=saved_pr if saved_pr in printers_list else "(Varsayılan Yazıcı)")
    ttk.Combobox(form, textvariable=printer_var, values=printers_list, state="readonly", width=30).grid(row=4, column=1, sticky="we", pady=6, padx=(8, 0))

    form.columnconfigure(1, weight=1)

    def save():
        name = name_var.get().strip()
        if not name:
            messagebox.showwarning("Eksik Bilgi", "Lütfen eczane adını girin.")
            return
        phone = phone_var.get().strip()
        tpl_key = key_by_label.get(tpl_var.get(), "thermal_50x30")
        th_key = theme_choices.get(theme_var.get(), "light")
        pr_val = printer_var.get()
        chosen_printer = None if pr_val == "(Varsayılan Yazıcı)" else pr_val

        if is_edit:
            profiles.update_profile(
                existing_profile["id"],
                name=name,
                phone=phone,
                label_template=tpl_key,
                theme=th_key,
                default_printer=chosen_printer,
            )
        else:
            profiles.add_profile(
                name,
                phone=phone,
                label_template=tpl_key,
                theme=th_key,
                default_printer=chosen_printer,
            )
        if on_save:
            on_save()
        top.destroy()

    btn_bar = ttk.Frame(card, style="Card.TFrame")
    btn_bar.pack(fill="x", pady=(12, 0))
    ttk.Button(btn_bar, text="💾 Kaydet", style="Primary.TButton", command=save).pack(side="left")
    ttk.Button(btn_bar, text="İptal", command=top.destroy).pack(side="left", padx=(8, 0))
    top.grab_set()



# ----------------------------------------------------------------------
# 2. İlaç Listesi Sekmesi (Arama ve Düzenleme Eklendi)
# ----------------------------------------------------------------------
def _build_drugs_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="💊 İlaç Listesi")

    # Arama çubuğu
    search_frame = ttk.Frame(frame)
    search_frame.pack(fill="x", pady=(0, 8))
    ttk.Label(search_frame, text="🔍 İlaç Ara:", style="CardBold.TLabel").pack(side="left")
    search_var = tk.StringVar()
    search_entry = ttk.Entry(search_frame, textvariable=search_var, width=32)
    search_entry.pack(side="left", padx=(6, 12))

    columns = ("name", "form", "purpose", "prospektus", "saklama", "barcode", "use_count")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=15)
    for col, label, w in zip(
        columns,
        ("İlaç Adı", "Form", "Ne İçin Kullanılır", "Kısa Prospektüs", "Saklama Koşulu", "Barkod", "Kullanım"),
        (200, 80, 160, 220, 160, 100, 60),
    ):
        tree.heading(col, text=label)
        tree.column(col, width=w)
    tree.pack(fill="both", expand=True)

    def refresh(drug_items=None):
        tree.delete(*tree.get_children())
        drugs = drug_items if drug_items is not None else data.load_drug_list()
        for d in drugs:
            tree.insert("", "end", values=(
                d["name"],
                data.FORM_LABELS.get(d.get("form", ""), d.get("form", "")),
                d.get("kullanim_amaci") or "",
                d.get("kisa_prospektus") or "",
                d.get("saklama_kosulu") or "",
                d.get("barcode") or "",
                d.get("use_count", 0),
            ))

    def on_search_change(*a):
        q = search_var.get().strip()
        refresh(data.search_drugs(q) if q else None)

    search_var.trace_add("write", on_search_change)

    def add_drug():
        _open_drug_dialog(None, on_save=refresh)

    def edit_drug():
        sel = tree.selection()
        if not sel:
            messagebox.showinfo("Seçim Yapın", "Lütfen düzenlemek istediğiniz ilacı listeden seçin.")
            return
        drug_name = tree.item(sel[0], "values")[0]
        drug = data.find_drug(drug_name)
        if not drug:
            return
        _open_drug_dialog(drug, on_save=refresh)

    def delete_drug():
        sel = tree.selection()
        if not sel:
            return
        name = tree.item(sel[0], "values")[0]
        if not messagebox.askyesno("Silme Onayı", f"'{name}' ilacını listeden silmek istiyor musunuz?"):
            return
        drugs = [d for d in data.load_drug_list() if d["name"] != name]
        data.save_drug_list(drugs)
        refresh()

    def import_file():
        path = filedialog.askopenfilename(filetypes=[("CSV/Excel Dosyaları", "*.csv *.xlsx *.xlsm")])
        if not path:
            return
        try:
            drug_import.import_drug_list(path)
            messagebox.showinfo("İçe Aktarıldı", "İlaç listesi başarıyla içe aktarıldı.")
        except Exception as exc:
            messagebox.showerror("Hata", f"İçe aktarma başarısız: {exc}")
        refresh()

    def update_from_api():
        ok = drug_api.refresh_drug_cache()
        if ok:
            messagebox.showinfo("Güncellendi", "İlaç listesi API'den başarıyla güncellendi.")
        else:
            messagebox.showwarning(
                "Güncellenemedi",
                "API'ye ulaşılamadı ya da veri kaynağı ayarlanmamış.\nMevcut liste korundu.",
            )
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(8, 0))
    ttk.Button(btns, text="➕ Yeni İlaç Ekle", style="Primary.TButton", command=add_drug).pack(side="left", padx=(0, 4))
    ttk.Button(btns, text="✏️ Düzenle", command=edit_drug).pack(side="left", padx=4)
    ttk.Button(btns, text="📥 CSV/Excel İçe Aktar", command=import_file).pack(side="left", padx=4)
    ttk.Button(btns, text="🔄 API'den Güncelle", command=update_from_api).pack(side="left", padx=4)
    ttk.Button(btns, text="🗑️ Sil", style="Danger.TButton", command=delete_drug).pack(side="right")

    tree.bind("<Double-Button-1>", lambda e: edit_drug())
    refresh()


def _open_drug_dialog(existing_drug: dict = None, on_save=None):
    """İlaç ekleme ve düzenleme için açılan temiz form penceresi."""
    top = tk.Toplevel()
    is_edit = existing_drug is not None
    top.title("İlaç Düzenle" if is_edit else "Yeni İlaç Ekle")
    top.geometry("520x460")
    top.configure(bg=theme.BG_CARD)

    card = ttk.Frame(top, style="Card.TFrame", padding=16)
    card.pack(fill="both", expand=True)

    ttk.Label(card, text="İlaç Bilgileri", font=(theme.FONT_FAMILY, 12, "bold"), foreground=theme.PRIMARY).pack(anchor="w", pady=(0, 10))

    form = ttk.Frame(card, style="Card.TFrame")
    form.pack(fill="both", expand=True)

    # İlaç Adı
    ttk.Label(form, text="İlaç Adı *:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=4)
    name_var = tk.StringVar(value=existing_drug.get("name", "") if is_edit else "")
    ttk.Entry(form, textvariable=name_var, width=36).grid(row=0, column=1, sticky="we", pady=4, padx=(8, 0))

    # Form (Tablet, Şurup vb.)
    ttk.Label(form, text="Farmasötik Form:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=4)
    form_var = tk.StringVar(value=existing_drug.get("form", "tablet") if is_edit else "tablet")
    combo_form = ttk.Combobox(form, textvariable=form_var, values=list(data.FORM_LABELS.keys()), state="readonly")
    combo_form.grid(row=1, column=1, sticky="w", pady=4, padx=(8, 0))

    # Barkod
    ttk.Label(form, text="Barkod:", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=4)
    barcode_var = tk.StringVar(value=existing_drug.get("barcode", "") if is_edit else "")
    ttk.Entry(form, textvariable=barcode_var, width=24).grid(row=2, column=1, sticky="w", pady=4, padx=(8, 0))

    # Ne İçin Kullanılır
    ttk.Label(form, text="Ne İçin Kullanılır:", style="CardBold.TLabel").grid(row=3, column=0, sticky="w", pady=4)
    purpose_var = tk.StringVar(value=existing_drug.get("kullanim_amaci", "") or "" if is_edit else "")
    ttk.Entry(form, textvariable=purpose_var, width=36).grid(row=3, column=1, sticky="we", pady=4, padx=(8, 0))

    # Kısa Prospektüs
    ttk.Label(form, text="Kısa Prospektüs:", style="CardBold.TLabel").grid(row=4, column=0, sticky="nw", pady=4)
    prospektus_text = tk.Text(form, height=4, wrap="word", font=(theme.FONT_FAMILY, 9), relief="solid", borderwidth=1)
    prospektus_text.grid(row=4, column=1, sticky="we", pady=4, padx=(8, 0))
    if is_edit and existing_drug.get("kisa_prospektus"):
        prospektus_text.insert("1.0", existing_drug["kisa_prospektus"])

    # Saklama Koşulu
    ttk.Label(form, text="Saklama Koşulu:", style="CardBold.TLabel").grid(row=5, column=0, sticky="w", pady=4)
    saklama_var = tk.StringVar(value=existing_drug.get("saklama_kosulu", data.DEFAULT_SAKLAMA_KOSULU) if is_edit else data.DEFAULT_SAKLAMA_KOSULU)
    ttk.Entry(form, textvariable=saklama_var, width=36).grid(row=5, column=1, sticky="we", pady=4, padx=(8, 0))

    form.columnconfigure(1, weight=1)

    def save():
        name = name_var.get().strip()
        if not name:
            messagebox.showwarning("Eksik Bilgi", "Lütfen ilaç adını girin.")
            return
        f_val = form_var.get()
        b_val = barcode_var.get().strip() or None
        p_val = purpose_var.get().strip() or None
        pr_val = prospektus_text.get("1.0", "end").strip() or None
        s_val = saklama_var.get().strip() or data.DEFAULT_SAKLAMA_KOSULU

        if is_edit:
            data.update_drug(
                existing_drug["name"],
                name=name,
                form=f_val,
                barcode=b_val,
                kullanim_amaci=p_val,
                kisa_prospektus=pr_val,
                saklama_kosulu=s_val,
            )
        else:
            drugs = data.load_drug_list()
            drugs.append({
                "name": name,
                "form": f_val,
                "kullanim_amaci": p_val,
                "kisa_prospektus": pr_val,
                "saklama_kosulu": s_val,
                "barcode": b_val,
                "use_count": 0,
            })
            data.save_drug_list(drugs)

        if on_save:
            on_save()
        top.destroy()

    btn_bar = ttk.Frame(card, style="Card.TFrame")
    btn_bar.pack(fill="x", pady=(12, 0))
    ttk.Button(btn_bar, text="💾 Kaydet", style="Primary.TButton", command=save).pack(side="left")
    ttk.Button(btn_bar, text="İptal", command=top.destroy).pack(side="left", padx=(8, 0))
    top.grab_set()


# ----------------------------------------------------------------------
# 3. Stok / SKT Takip Sekmesi (Düzenleme ve Filtre Eklendi)
# ----------------------------------------------------------------------
def _build_stock_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="📦 Stok & SKT Takibi")

    # Üst Filtre Barı
    filter_bar = ttk.Frame(frame)
    filter_bar.pack(fill="x", pady=(0, 8))

    ttk.Label(filter_bar, text="🔍 Ürün Ara:", style="CardBold.TLabel").pack(side="left")
    search_var = tk.StringVar()
    ttk.Entry(filter_bar, textvariable=search_var, width=22).pack(side="left", padx=(6, 16))

    current_filter = tk.StringVar(value="all")
    ttk.Radiobutton(filter_bar, text="Tümü", value="all", variable=current_filter, command=lambda: refresh()).pack(side="left")
    ttk.Radiobutton(filter_bar, text="⚠️ SKT Yaklaşanlar", value="expiring", variable=current_filter, command=lambda: refresh()).pack(side="left", padx=(8, 0))
    ttk.Radiobutton(filter_bar, text="⛔ Süresi Geçenler", value="expired", variable=current_filter, command=lambda: refresh()).pack(side="left", padx=(8, 0))
    ttk.Radiobutton(filter_bar, text="📉 Düşük Stok", value="low", variable=current_filter, command=lambda: refresh()).pack(side="left", padx=(8, 0))

    columns = ("name", "quantity", "min_quantity", "expiry", "note", "status")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=14)
    for col, label, w in zip(columns, ("Ürün Adı", "Miktar", "Min. Stok", "SKT", "Not", "Durum"), (200, 70, 80, 100, 180, 130)):
        tree.heading(col, text=label)
        tree.column(col, width=w)
    tree.tag_configure("expired", background="#fee2e2", foreground="#991b1b")
    tree.tag_configure("expiring_soon", background="#fef3c7", foreground="#92400e")
    tree.tag_configure("low_stock", background="#ffedd5", foreground="#9a3412")
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        items = stock.load_stock()
        query = search_var.get().strip().casefold()
        if query:
            items = [i for i in items if query in i.get("name", "").casefold()]

        grouped = stock.get_expiring_items()
        expired_ids = {i["id"] for i in grouped["expired"]}
        expiring_ids = {i["id"] for i in grouped["expiring_soon"]}
        low_ids = {i["id"] for i in stock.get_low_stock_items(items)}

        f_val = current_filter.get()
        for item in items:
            iid = item["id"]
            is_expired = iid in expired_ids
            is_expiring = iid in expiring_ids
            is_low = iid in low_ids

            if f_val == "expired" and not is_expired:
                continue
            if f_val == "expiring" and not is_expiring:
                continue
            if f_val == "low" and not is_low:
                continue

            if is_expired:
                status, tag = "⛔ SÜRESİ GEÇTİ", "expired"
            elif is_expiring:
                status, tag = "⚠️ SKT YAKLAŞIYOR", "expiring_soon"
            elif is_low:
                status, tag = "📉 STOK DÜŞÜK", "low_stock"
            else:
                status, tag = "✅ NORMAL", None

            tree.insert(
                "", "end", iid=iid,
                values=(
                    item["name"],
                    item["quantity"],
                    item.get("min_quantity", 0) or "",
                    item.get("expiry_date", ""),
                    item.get("note", ""),
                    status,
                ),
                tags=(tag,) if tag else (),
            )

    search_var.trace_add("write", lambda *a: refresh())

    def add_item():
        _open_stock_dialog(None, on_save=refresh)

    def edit_item():
        sel = tree.selection()
        if not sel:
            messagebox.showinfo("Seçim Yapın", "Lütfen düzenlemek istediğiniz stok kaydını seçin.")
            return
        item_id = sel[0]
        items = stock.load_stock()
        target = next((i for i in items if i["id"] == item_id), None)
        if not target:
            return
        _open_stock_dialog(target, on_save=refresh)

    def delete_item():
        sel = tree.selection()
        if not sel:
            return
        name = tree.item(sel[0], "values")[0]
        if not messagebox.askyesno("Silme Onayı", f"'{name}' stok kaydını silmek istiyor musunuz?"):
            return
        stock.delete_item(sel[0])
        refresh()

    def import_csv():
        path = filedialog.askopenfilename(filetypes=[("CSV Dosyaları", "*.csv")])
        if path:
            stock.import_stock_csv(path)
            refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(8, 0))
    ttk.Button(btns, text="➕ Yeni Stok Ekle", style="Primary.TButton", command=add_item).pack(side="left", padx=(0, 4))
    ttk.Button(btns, text="✏️ Düzenle", command=edit_item).pack(side="left", padx=4)
    ttk.Button(btns, text="📥 CSV İçe Aktar", command=import_csv).pack(side="left", padx=4)
    ttk.Button(btns, text="🗑️ Sil", style="Danger.TButton", command=delete_item).pack(side="right")

    tree.bind("<Double-Button-1>", lambda e: edit_item())
    refresh()


def _open_stock_dialog(existing_item: dict = None, on_save=None):
    top = tk.Toplevel()
    is_edit = existing_item is not None
    top.title("Stok Düzenle" if is_edit else "Yeni Stok Ekle")
    top.geometry("460x340")
    top.configure(bg=theme.BG_CARD)

    card = ttk.Frame(top, style="Card.TFrame", padding=16)
    card.pack(fill="both", expand=True)

    ttk.Label(card, text="Stok Kayıt Detayları", font=(theme.FONT_FAMILY, 12, "bold"), foreground=theme.PRIMARY).pack(anchor="w", pady=(0, 10))

    form = ttk.Frame(card, style="Card.TFrame")
    form.pack(fill="both", expand=True)

    ttk.Label(form, text="Ürün Adı *:", style="CardBold.TLabel").grid(row=0, column=0, sticky="w", pady=4)
    name_var = tk.StringVar(value=existing_item.get("name", "") if is_edit else "")
    ttk.Entry(form, textvariable=name_var, width=30).grid(row=0, column=1, sticky="we", pady=4, padx=(8, 0))

    ttk.Label(form, text="Mevcut Miktar:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=4)
    qty_var = tk.IntVar(value=existing_item.get("quantity", 1) if is_edit else 1)
    ttk.Spinbox(form, from_=0, to=99999, textvariable=qty_var, width=10).grid(row=1, column=1, sticky="w", pady=4, padx=(8, 0))

    ttk.Label(form, text="Min. Stok Eşiği:", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=4)
    min_qty_var = tk.IntVar(value=existing_item.get("min_quantity", 0) if is_edit else 0)
    ttk.Spinbox(form, from_=0, to=9999, textvariable=min_qty_var, width=10).grid(row=2, column=1, sticky="w", pady=4, padx=(8, 0))

    ttk.Label(form, text="SKT (GG.AA.YYYY veya YYYY-AA-GG):", style="CardBold.TLabel").grid(row=3, column=0, sticky="w", pady=4)
    expiry_var = tk.StringVar(value=existing_item.get("expiry_date", "") if is_edit else "")
    ttk.Entry(form, textvariable=expiry_var, width=16).grid(row=3, column=1, sticky="w", pady=4, padx=(8, 0))

    ttk.Label(form, text="Not (opsiyonel):", style="CardBold.TLabel").grid(row=4, column=0, sticky="w", pady=4)
    note_var = tk.StringVar(value=existing_item.get("note", "") if is_edit else "")
    ttk.Entry(form, textvariable=note_var, width=30).grid(row=4, column=1, sticky="we", pady=4, padx=(8, 0))

    form.columnconfigure(1, weight=1)

    def save():
        name = name_var.get().strip()
        if not name:
            messagebox.showwarning("Eksik Bilgi", "Lütfen ürün adını girin.")
            return
        qty = qty_var.get()
        min_qty = min_qty_var.get()
        expiry = expiry_var.get().strip()
        note = note_var.get().strip()

        if is_edit:
            stock.update_item(existing_item["id"], name=name, quantity=qty, min_quantity=min_qty, expiry_date=expiry, note=note)
        else:
            stock.add_item(name, qty, expiry, note, min_quantity=min_qty)

        if on_save:
            on_save()
        top.destroy()

    btn_bar = ttk.Frame(card, style="Card.TFrame")
    btn_bar.pack(fill="x", pady=(12, 0))
    ttk.Button(btn_bar, text="💾 Kaydet", style="Primary.TButton", command=save).pack(side="left")
    ttk.Button(btn_bar, text="İptal", command=top.destroy).pack(side="left", padx=(8, 0))
    top.grab_set()


# ----------------------------------------------------------------------
# 4. Geçmiş & Raporlar Sekmesi
# ----------------------------------------------------------------------
def _build_history_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="🕒 Geçmiş & Raporlar")

    filter_box = ttk.Frame(frame)
    filter_box.pack(fill="x", pady=(0, 8))

    ttk.Label(filter_box, text="🔍 Hasta Ara:", style="CardBold.TLabel").pack(side="left")
    search_var = tk.StringVar()
    ttk.Entry(filter_box, textvariable=search_var, width=20).pack(side="left", padx=(4, 12))

    ttk.Label(filter_box, text="Tarih Başlangıç:", style="Card.TLabel").pack(side="left")
    date_from_var = tk.StringVar()
    ttk.Entry(filter_box, textvariable=date_from_var, width=11).pack(side="left", padx=(4, 8))

    ttk.Label(filter_box, text="Bitiş:", style="Card.TLabel").pack(side="left")
    date_to_var = tk.StringVar()
    ttk.Entry(filter_box, textvariable=date_to_var, width=11).pack(side="left", padx=(4, 8))

    columns = ("timestamp", "patient", "drug", "instructions", "refill", "staff")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=15)
    for col, label, w in zip(
        columns,
        ("Tarih/Saat", "Hasta Adı", "İlaç", "Talimat", "SGK Bitiş", "Personel"),
        (120, 130, 160, 220, 95, 100),
    ):
        tree.heading(col, text=label)
        tree.column(col, width=w)
    tree.pack(fill="both", expand=True)

    def refresh(records=None):
        tree.delete(*tree.get_children())
        records = records if records is not None else history.load_history()
        for r in records[:300]:
            refill_val = r.get("refill_date", "") or r.get("end_date", "")
            tree.insert("", "end", values=(
                r.get("timestamp", "").replace("T", " ")[:16],
                r.get("patient_name", ""),
                r.get("drug_name", ""),
                r.get("instructions", ""),
                refill_val,
                r.get("staff_name", ""),
            ))

    def do_search():
        q = search_var.get().strip()
        refresh(history.search_by_patient(q) if q else None)

    def do_filter():
        date_from = date_from_var.get().strip() or None
        date_to = date_to_var.get().strip() or None
        if date_to:
            date_to = f"{date_to}T23:59:59"
        refresh(history.load_history(date_from=date_from, date_to=date_to))

    def export_csv():
        path = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV Dosyası", "*.csv")])
        if not path:
            return
        date_from = date_from_var.get().strip() or None
        date_to = date_to_var.get().strip() or None
        if date_to:
            date_to = f"{date_to}T23:59:59"
        history.export_history_csv(path, date_from=date_from, date_to=date_to)
        messagebox.showinfo("Dışa Aktarıldı", f"Geçmiş CSV dosyası kaydedildi:\n{path}")

    ttk.Button(filter_box, text="Filtrele", style="Primary.TButton", command=do_filter).pack(side="left", padx=4)
    ttk.Button(filter_box, text="Sıfırla", command=lambda: refresh()).pack(side="left", padx=4)
    ttk.Button(filter_box, text="📊 CSV Dışa Aktar", command=export_csv).pack(side="right")

    search_var.trace_add("write", lambda *a: do_search())
    refresh()


# ----------------------------------------------------------------------
# 5. İstatistikler Sekmesi
# ----------------------------------------------------------------------
def _build_stats_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="📊 İstatistikler")

    summary_card = ttk.Frame(frame, style="Card.TFrame", padding=12)
    summary_card.pack(fill="x", pady=(0, 10))
    summary_label = ttk.Label(summary_card, text="", font=(theme.FONT_FAMILY, 12, "bold"), foreground=theme.PRIMARY)
    summary_label.pack(anchor="w")

    lists_frame = ttk.Frame(frame)
    lists_frame.pack(fill="both", expand=True)

    drugs_col = ttk.Frame(lists_frame)
    drugs_col.pack(side="left", fill="both", expand=True, padx=(0, 6))
    ttk.Label(drugs_col, text="🏆 En Çok Basılan İlaçlar", style="CardBold.TLabel").pack(anchor="w", pady=(0, 4))
    drugs_tree = ttk.Treeview(drugs_col, columns=("drug", "count"), show="headings", height=12)
    for col, label in zip(("drug", "count"), ("İlaç", "Basım")):
        drugs_tree.heading(col, text=label)
    drugs_tree.column("count", width=60)
    drugs_tree.pack(fill="both", expand=True)

    staff_col = ttk.Frame(lists_frame)
    staff_col.pack(side="left", fill="both", expand=True, padx=6)
    ttk.Label(staff_col, text="👤 Personel Aktivitesi", style="CardBold.TLabel").pack(anchor="w", pady=(0, 4))
    staff_tree = ttk.Treeview(staff_col, columns=("staff", "count"), show="headings", height=12)
    for col, label in zip(("staff", "count"), ("Personel", "Basım")):
        staff_tree.heading(col, text=label)
    staff_tree.column("count", width=60)
    staff_tree.pack(fill="both", expand=True)

    days_col = ttk.Frame(lists_frame)
    days_col.pack(side="left", fill="both", expand=True, padx=(6, 0))
    ttk.Label(days_col, text="📅 Son 7 Gün", style="CardBold.TLabel").pack(anchor="w", pady=(0, 4))
    days_tree = ttk.Treeview(days_col, columns=("day", "count"), show="headings", height=12)
    for col, label in zip(("day", "count"), ("Tarih", "Basım")):
        days_tree.heading(col, text=label)
    days_tree.column("count", width=60)
    days_tree.pack(fill="both", expand=True)

    def refresh():
        s = stats.summary()
        summary_label.config(text=f"📌 Toplam Basılan Etiket Sayısı: {s['total']}")
        drugs_tree.delete(*drugs_tree.get_children())
        for name, count in s["top_drugs"]:
            drugs_tree.insert("", "end", values=(name, count))
        staff_tree.delete(*staff_tree.get_children())
        for name, count in s["top_staff"]:
            staff_tree.insert("", "end", values=(name, count))
        days_tree.delete(*days_tree.get_children())
        for day, count in s["by_day"]:
            days_tree.insert("", "end", values=(day, count))

    ttk.Button(frame, text="🔄 Yenile", style="Primary.TButton", command=refresh).pack(anchor="w", pady=(10, 0))
    refresh()


# ----------------------------------------------------------------------
# 6. Talimat Şablonları Sekmesi
# ----------------------------------------------------------------------
def _build_templates_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="⚡ Talimat Şablonları")

    form_var = tk.StringVar(value="tablet")
    top_box = ttk.Frame(frame)
    top_box.pack(fill="x", pady=(0, 8))
    ttk.Label(top_box, text="Farmasötik Form Seçin:", style="CardBold.TLabel").pack(side="left")
    form_combo = ttk.Combobox(top_box, textvariable=form_var, values=list(data.FORM_LABELS.keys()), state="readonly", width=18)
    form_combo.pack(side="left", padx=(8, 0))

    tree = ttk.Treeview(frame, columns=("template",), show="headings", height=12)
    tree.heading("template", text="Talimat Metni")
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        for t in data.get_instruction_templates(form_var.get()):
            tree.insert("", "end", values=(t,))

    def add_template():
        text = simpledialog.askstring("Yeni Şablon", "Talimat Metni:")
        if not text:
            return
        templates = data.get_instruction_templates(form_var.get())
        templates.append(text)
        data.save_instruction_templates(form_var.get(), templates)
        refresh()

    def delete_template():
        sel = tree.selection()
        if not sel:
            return
        text = tree.item(sel[0], "values")[0]
        if not messagebox.askyesno("Silme Onayı", f"Bu şablonu silmek istiyor musunuz?\n\n\"{text}\""):
            return
        templates = data.get_instruction_templates(form_var.get())
        templates = [t for t in templates if t != text]
        data.save_instruction_templates(form_var.get(), templates)
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(8, 0))
    ttk.Button(btns, text="➕ Yeni Şablon Ekle", style="Primary.TButton", command=add_template).pack(side="left")
    ttk.Button(btns, text="🗑️ Sil", style="Danger.TButton", command=delete_template).pack(side="left", padx=(8, 0))

    form_combo.bind("<<ComboboxSelected>>", lambda e: refresh())
    refresh()


# ----------------------------------------------------------------------
# 7. Personel Sekmesi
# ----------------------------------------------------------------------
def _build_staff_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="👥 Personel")

    tree = ttk.Treeview(frame, columns=("name",), show="headings", height=12)
    tree.heading("name", text="Personel Adı Soyadı")
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        for name in staff.load_staff():
            tree.insert("", "end", values=(name,))

    def add_name():
        name = simpledialog.askstring("Yeni Personel", "Personel Adı Soyadı:")
        if name:
            staff.add_staff(name)
            refresh()

    def delete_name():
        sel = tree.selection()
        if not sel:
            return
        name = tree.item(sel[0], "values")[0]
        if not messagebox.askyesno("Silme Onayı", f"'{name}' personelini silmek istiyor musunuz?"):
            return
        staff.remove_staff(name)
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(8, 0))
    ttk.Button(btns, text="➕ Personel Ekle", style="Primary.TButton", command=add_name).pack(side="left")
    ttk.Button(btns, text="🗑️ Sil", style="Danger.TButton", command=delete_name).pack(side="left", padx=(8, 0))

    refresh()


# ----------------------------------------------------------------------
# 8. İlaç Veri Kaynağı (API) Sekmesi
# ----------------------------------------------------------------------
def _build_api_tab(notebook):
    frame = ttk.Frame(notebook, padding=16)
    notebook.add(frame, text="🌐 Veri Kaynağı (API)")

    ttk.Label(
        frame,
        text=(
            "Harici ilaç veri kaynağı ('turkish-medicine-api') entegrasyonu.\n"
            "Varsayılan olarak yerel Node.js servisiyle çalışır (port 3000).\n"
            "Program bu API olmadan da CSV/Excel içe aktarma ile tam fonksiyoneldir."
        ),
        justify="left",
        style="Muted.TLabel",
    ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 16))

    config = drug_api.load_api_config()
    base_url_var = tk.StringVar(value=config.base_url)
    api_key_var = tk.StringVar(value=config.api_key or "")
    sheet_var = tk.StringVar(value=config.sheet)

    ttk.Label(frame, text="API Taban Adresi:", style="CardBold.TLabel").grid(row=1, column=0, sticky="w", pady=6)
    ttk.Entry(frame, textvariable=base_url_var, width=45).grid(row=1, column=1, sticky="we", pady=6, padx=(8, 0))

    ttk.Label(frame, text="API Anahtarı (opsiyonel):", style="CardBold.TLabel").grid(row=2, column=0, sticky="w", pady=6)
    ttk.Entry(frame, textvariable=api_key_var, width=45, show="*").grid(row=2, column=1, sticky="we", pady=6, padx=(8, 0))

    ttk.Label(frame, text="Sheet (active/passive):", style="CardBold.TLabel").grid(row=3, column=0, sticky="w", pady=6)
    ttk.Entry(frame, textvariable=sheet_var, width=20).grid(row=3, column=1, sticky="w", pady=6, padx=(8, 0))

    def save():
        drug_api.save_api_config(drug_api.ApiConfig(base_url=base_url_var.get().strip(), api_key=api_key_var.get().strip() or None, sheet=sheet_var.get().strip() or "active"))
        messagebox.showinfo("Kaydedildi", "İlaç veri kaynağı ayarları kaydedildi.")

    ttk.Button(frame, text="💾 Ayarları Kaydet", style="Primary.TButton", command=save).grid(row=4, column=0, columnspan=2, pady=(16, 0), sticky="w")
    frame.columnconfigure(1, weight=1)


# ----------------------------------------------------------------------
# 9. Yedekleme Sekmesi
# ----------------------------------------------------------------------
def _build_backup_tab(notebook):
    frame = ttk.Frame(notebook, padding=16)
    notebook.add(frame, text="💾 Yedekleme")

    ttk.Label(
        frame,
        text=(
            "Programdaki tüm kayıtları (eczane profilleri, ilaç listesi, geçmiş ve stok verileri)\n"
            "tek bir ZIP dosyası olarak yedekleyebilir veya önceki bir yedekten geri yükleyebilirsiniz."
        ),
        justify="left",
        style="Muted.TLabel",
    ).pack(anchor="w", pady=(0, 16))

    def do_backup():
        path = filedialog.asksaveasfilename(defaultextension=".zip", filetypes=[("Zip Arşivi", "*.zip")])
        if path:
            backup.create_backup(path)
            messagebox.showinfo("Yedeklendi", f"Tüm veriler başarıyla yedeklendi:\n{path}")

    def do_restore():
        path = filedialog.askopenfilename(filetypes=[("Zip Arşivi", "*.zip")])
        if path and messagebox.askyesno("Geri Yükleme Onayı", "Mevcut yerel veriler yedekteki dosyalarla değiştirilecek.\n\nDevam etmek istiyor musunuz?"):
            restored = backup.restore_backup(path)
            messagebox.showinfo(
                "Geri Yüklendi",
                f"Geri yüklenen dosyalar: {', '.join(restored) if restored else 'yok'}\n\n"
                "Değişikliklerin geçerli olması için programı yeniden başlatın.",
            )

    card = ttk.Frame(frame, style="Card.TFrame", padding=16)
    card.pack(fill="x")

    ttk.Button(card, text="📦 Tam Yedek Al (.zip)", style="Primary.TButton", command=do_backup).pack(anchor="w", pady=6)
    ttk.Button(card, text="📥 Yedekten Geri Yükle", command=do_restore).pack(anchor="w", pady=6)
