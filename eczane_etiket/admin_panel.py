"""Admin Paneli — profiller, ilaç listesi, veri kaynağı, şablonlar, personel,
geçmiş/raporlar, stok/SKT takibi ve yedekleme burada toplanır.

Ana ekran (main.py) günlük kullanım için sade kalsın diye tüm yönetimsel
işler bu ayrı pencerede yer alır. Opsiyonel PIN koruması main.py tarafında
(Admin Paneli açılmadan önce) uygulanır.
"""

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from . import backup, data, drug_api, drug_import, history, profiles, staff, stats, stock
from .label_pdf import LABEL_SIZES_MM
from .profiles import LABEL_TEMPLATES


def open_admin_panel(parent, on_close=None):
    win = tk.Toplevel(parent)
    win.title("Admin Paneli")
    win.geometry("900x620")

    notebook = ttk.Notebook(win)
    notebook.pack(fill="both", expand=True, padx=6, pady=6)

    _build_profiles_tab(notebook)
    _build_drugs_tab(notebook)
    _build_api_tab(notebook)
    _build_templates_tab(notebook)
    _build_staff_tab(notebook)
    _build_history_tab(notebook)
    _build_stats_tab(notebook)
    _build_stock_tab(notebook)
    _build_backup_tab(notebook)

    def _close():
        if on_close:
            on_close()
        win.destroy()

    ttk.Button(win, text="Kapat", command=_close).pack(pady=(0, 6))
    win.protocol("WM_DELETE_WINDOW", _close)


# ----------------------------------------------------------------------
# Profiller
# ----------------------------------------------------------------------
def _build_profiles_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="Eczane Profilleri")

    columns = ("name", "phone", "template", "pin", "qr")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=10)
    for col, label in zip(columns, ("İsim", "Telefon", "Etiket Şablonu", "PIN", "QR Kod")):
        tree.heading(col, text=label)
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        state = profiles.load_state()
        for p in state["profiles"]:
            mark = "★" if p["id"] == state.get("active_id") else ""
            pin_status = "Var" if p.get("pin_hash") else "Yok"
            qr_status = "Açık" if p.get("qr_enabled") else "Kapalı"
            tree.insert(
                "", "end", iid=p["id"],
                values=(mark + p["name"], p.get("phone", ""), LABEL_TEMPLATES.get(p.get("label_template", ""), ""), pin_status, qr_status),
            )

    def get_selected_id():
        sel = tree.selection()
        return sel[0] if sel else None

    def add_profile():
        name = simpledialog.askstring("Yeni Profil", "Eczane adı:")
        if not name:
            return
        profiles.add_profile(name)
        refresh()

    def edit_profile():
        pid = get_selected_id()
        if not pid:
            return
        profile = next((p for p in profiles.load_profiles() if p["id"] == pid), None)
        if not profile:
            return
        name = simpledialog.askstring("Eczane Adı", "İsim:", initialvalue=profile.get("name", ""))
        if name is None:
            return
        phone = simpledialog.askstring("Telefon", "Telefon:", initialvalue=profile.get("phone", ""))
        template_choices = list(LABEL_TEMPLATES.keys())
        template = _ask_choice("Etiket Şablonu", "Şablon seçin:", template_choices, profile.get("label_template"))
        profiles.update_profile(pid, name=name, phone=phone or "", label_template=template or profile.get("label_template"))
        refresh()

    def delete_profile():
        pid = get_selected_id()
        if not pid:
            return
        if messagebox.askyesno("Sil", "Bu profili silmek istiyor musunuz?"):
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
        path = filedialog.askopenfilename(filetypes=[("Görsel", "*.png *.jpg *.jpeg *.bmp")])
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
            "QR Kod",
            f"'{profile['name']}' profili için etiket QR kodu {state_text}.\n\n"
            "Not: QR kod yalnızca 'A4 Sayfa - 6'lı Etiket Izgarası' şablonunda "
            "gösterilir; küçük termal etiketlerde okunabilir bir QR koda yetecek "
            "yer olmadığı için eklenmez.",
        )
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(6, 0))
    for text, cmd in (
        ("Ekle", add_profile),
        ("Düzenle", edit_profile),
        ("Sil", delete_profile),
        ("Aktif Yap", set_active),
        ("PIN Ayarla", set_pin),
        ("Logo Seç", set_logo),
        ("QR Kod Aç/Kapat (A4 şablonunda)", toggle_qr),
    ):
        ttk.Button(btns, text=text, command=cmd).pack(side="left", padx=2)

    refresh()


def _ask_choice(title, prompt, choices, current=None):
    top = tk.Toplevel()
    top.title(title)
    ttk.Label(top, text=prompt).pack(padx=10, pady=(10, 4))
    var = tk.StringVar(value=current or (choices[0] if choices else ""))
    combo = ttk.Combobox(top, textvariable=var, values=choices, state="readonly")
    combo.pack(padx=10, pady=4)
    result = {}

    def confirm():
        result["value"] = var.get()
        top.destroy()

    ttk.Button(top, text="Tamam", command=confirm).pack(pady=(4, 10))
    top.grab_set()
    top.wait_window()
    return result.get("value")


# ----------------------------------------------------------------------
# İlaç Listesi
# ----------------------------------------------------------------------
def _build_drugs_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="İlaç Listesi")

    columns = ("name", "form", "purpose", "prospektus", "saklama", "barcode", "use_count")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=16)
    for col, label in zip(columns, ("İlaç Adı", "Form", "Ne İçin Kullanılır", "Kısa Prospektüs", "Saklama Koşulu", "Barkod", "Kullanım Sayısı")):
        tree.heading(col, text=label)
    tree.column("prospektus", width=200)
    tree.column("saklama", width=200)
    tree.column("barcode", width=110)
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        for d in data.load_drug_list():
            tree.insert("", "end", values=(
                d["name"],
                data.FORM_LABELS.get(d.get("form", ""), d.get("form", "")),
                d.get("kullanim_amaci") or "",
                d.get("kisa_prospektus") or "",
                d.get("saklama_kosulu") or "",
                d.get("barcode") or "",
                d.get("use_count", 0),
            ))

    def add_drug():
        name = simpledialog.askstring("Yeni İlaç", "İlaç adı:")
        if not name:
            return
        form = _ask_choice("Form", "Farmasötik şekil:", list(data.FORM_LABELS.keys()), "tablet")
        purpose = simpledialog.askstring("Ne İçin Kullanılır", "Kısa özet (opsiyonel):")
        prospektus = simpledialog.askstring(
            "Kısa Prospektüs", "Hastaya yönelik 1-2 cümlelik açıklama (opsiyonel):"
        )
        saklama = simpledialog.askstring(
            "Saklama Koşulu", "Saklama koşulu (boş bırakılırsa standart uyarı kullanılır):"
        )
        barcode = simpledialog.askstring(
            "Barkod", "Ürün barkodu (opsiyonel — barkod okuyucuyla otomatik seçim için):"
        )
        drugs = data.load_drug_list()
        drugs.append({
            "name": name,
            "form": form or "tablet",
            "kullanim_amaci": purpose or None,
            "kisa_prospektus": prospektus or None,
            "saklama_kosulu": saklama or data.DEFAULT_SAKLAMA_KOSULU,
            "barcode": barcode or None,
            "use_count": 0,
        })
        data.save_drug_list(drugs)
        refresh()

    def delete_drug():
        sel = tree.selection()
        if not sel:
            return
        name = tree.item(sel[0], "values")[0]
        drugs = [d for d in data.load_drug_list() if d["name"] != name]
        data.save_drug_list(drugs)
        refresh()

    def import_file():
        path = filedialog.askopenfilename(filetypes=[("CSV/Excel", "*.csv *.xlsx *.xlsm")])
        if not path:
            return
        try:
            drug_import.import_drug_list(path)
            messagebox.showinfo("İçe Aktarıldı", "İlaç listesi içe aktarıldı.")
        except Exception as exc:
            messagebox.showerror("Hata", f"İçe aktarma başarısız: {exc}")
        refresh()

    def update_from_api():
        ok = drug_api.refresh_drug_cache()
        if ok:
            messagebox.showinfo("Güncellendi", "İlaç listesi API'den güncellendi.")
        else:
            messagebox.showwarning(
                "Güncellenemedi",
                "API'ye ulaşılamadı ya da veri kaynağı ayarlanmamış. "
                "Mevcut liste korundu. (bkz. 'İlaç Veri Kaynağı' sekmesi)",
            )
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(6, 0))
    ttk.Button(btns, text="Ekle", command=add_drug).pack(side="left", padx=2)
    ttk.Button(btns, text="Sil", command=delete_drug).pack(side="left", padx=2)
    ttk.Button(btns, text="CSV/Excel İçe Aktar", command=import_file).pack(side="left", padx=2)
    ttk.Button(btns, text="Listeyi API'den Güncelle", command=update_from_api).pack(side="left", padx=2)

    refresh()


# ----------------------------------------------------------------------
# İlaç Veri Kaynağı (API)
# ----------------------------------------------------------------------
def _build_api_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="İlaç Veri Kaynağı")

    ttk.Label(
        frame,
        text=(
            "Varsayılan olarak önerilen 'turkish-medicine-api' herkese açık, barındırılan\n"
            "bir servis DEĞİLDİR — Node.js ile kendi bilgisayarınızda/sunucunuzda\n"
            "çalıştırmanız gerekir (github.com/tugcantopaloglu/turkish-medicine-api).\n"
            "Program bu API olmadan da (örnek liste + içe aktarma ile) tam çalışır."
        ),
        justify="left",
        foreground="gray20",
    ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 12))

    config = drug_api.load_api_config()
    base_url_var = tk.StringVar(value=config.base_url)
    api_key_var = tk.StringVar(value=config.api_key or "")
    sheet_var = tk.StringVar(value=config.sheet)

    ttk.Label(frame, text="API Taban Adresi:").grid(row=1, column=0, sticky="w", pady=2)
    ttk.Entry(frame, textvariable=base_url_var, width=45).grid(row=1, column=1, sticky="we", pady=2)

    ttk.Label(frame, text="API Anahtarı (opsiyonel):").grid(row=2, column=0, sticky="w", pady=2)
    ttk.Entry(frame, textvariable=api_key_var, width=45, show="*").grid(row=2, column=1, sticky="we", pady=2)

    ttk.Label(frame, text="Sheet (active/passive):").grid(row=3, column=0, sticky="w", pady=2)
    ttk.Entry(frame, textvariable=sheet_var, width=20).grid(row=3, column=1, sticky="w", pady=2)

    def save():
        drug_api.save_api_config(drug_api.ApiConfig(base_url=base_url_var.get().strip(), api_key=api_key_var.get().strip() or None, sheet=sheet_var.get().strip() or "active"))
        messagebox.showinfo("Kaydedildi", "İlaç veri kaynağı ayarları kaydedildi.")

    ttk.Button(frame, text="Kaydet", command=save).grid(row=4, column=0, columnspan=2, pady=(10, 0), sticky="w")
    frame.columnconfigure(1, weight=1)


# ----------------------------------------------------------------------
# Talimat Şablonları
# ----------------------------------------------------------------------
def _build_templates_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="Talimat Şablonları")

    form_var = tk.StringVar(value="tablet")
    ttk.Label(frame, text="Farmasötik Şekil:").pack(anchor="w")
    form_combo = ttk.Combobox(frame, textvariable=form_var, values=list(data.FORM_LABELS.keys()), state="readonly")
    form_combo.pack(anchor="w", pady=(0, 6))

    listbox = tk.Listbox(frame, height=12)
    listbox.pack(fill="both", expand=True)

    def refresh():
        listbox.delete(0, "end")
        for t in data.get_instruction_templates(form_var.get()):
            listbox.insert("end", t)

    def add_template():
        text = simpledialog.askstring("Yeni Şablon", "Talimat metni:")
        if not text:
            return
        templates = data.get_instruction_templates(form_var.get())
        templates.append(text)
        data.save_instruction_templates(form_var.get(), templates)
        refresh()

    def delete_template():
        sel = listbox.curselection()
        if not sel:
            return
        templates = data.get_instruction_templates(form_var.get())
        del templates[sel[0]]
        data.save_instruction_templates(form_var.get(), templates)
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(6, 0))
    ttk.Button(btns, text="Ekle", command=add_template).pack(side="left", padx=2)
    ttk.Button(btns, text="Sil", command=delete_template).pack(side="left", padx=2)

    form_combo.bind("<<ComboboxSelected>>", lambda e: refresh())
    refresh()


# ----------------------------------------------------------------------
# Personel
# ----------------------------------------------------------------------
def _build_staff_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="Personel")

    listbox = tk.Listbox(frame, height=14)
    listbox.pack(fill="both", expand=True)

    def refresh():
        listbox.delete(0, "end")
        for name in staff.load_staff():
            listbox.insert("end", name)

    def add_name():
        name = simpledialog.askstring("Yeni Personel", "Adı Soyadı:")
        if name:
            staff.add_staff(name)
            refresh()

    def delete_name():
        sel = listbox.curselection()
        if not sel:
            return
        name = listbox.get(sel[0])
        staff.remove_staff(name)
        refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(6, 0))
    ttk.Button(btns, text="Ekle", command=add_name).pack(side="left", padx=2)
    ttk.Button(btns, text="Sil", command=delete_name).pack(side="left", padx=2)

    refresh()


# ----------------------------------------------------------------------
# Geçmiş & Raporlar
# ----------------------------------------------------------------------
def _build_history_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="Geçmiş & Raporlar")

    search_frame = ttk.Frame(frame)
    search_frame.pack(fill="x", pady=(0, 6))
    ttk.Label(search_frame, text="Hasta Adına Göre Ara:").pack(side="left")
    search_var = tk.StringVar()
    ttk.Entry(search_frame, textvariable=search_var, width=30).pack(side="left", padx=(4, 0))

    columns = ("timestamp", "patient", "drug", "instructions", "staff")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=16)
    for col, label in zip(columns, ("Tarih/Saat", "Hasta", "İlaç", "Talimat", "Personel")):
        tree.heading(col, text=label)
    tree.pack(fill="both", expand=True)

    def refresh(records=None):
        tree.delete(*tree.get_children())
        records = records if records is not None else history.load_history()
        for r in records[:300]:
            tree.insert("", "end", values=(r.get("timestamp", ""), r.get("patient_name", ""), r.get("drug_name", ""), r.get("instructions", ""), r.get("staff_name", "")))

    def do_search():
        q = search_var.get().strip()
        refresh(history.search_by_patient(q) if q else None)

    def export_csv():
        path = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if path:
            history.export_history_csv(path)
            messagebox.showinfo("Dışa Aktarıldı", f"Geçmiş CSV olarak kaydedildi:\n{path}")

    ttk.Button(search_frame, text="Ara", command=do_search).pack(side="left", padx=4)
    ttk.Button(search_frame, text="Tümünü Göster", command=lambda: refresh()).pack(side="left")
    ttk.Button(search_frame, text="CSV Dışa Aktar", command=export_csv).pack(side="right")

    refresh()


# ----------------------------------------------------------------------
# İstatistikler
# ----------------------------------------------------------------------
def _build_stats_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="İstatistikler")

    summary_label = ttk.Label(frame, text="", font=("Segoe UI", 10, "bold"))
    summary_label.pack(anchor="w", pady=(0, 8))

    lists_frame = ttk.Frame(frame)
    lists_frame.pack(fill="both", expand=True)

    drugs_col = ttk.Frame(lists_frame)
    drugs_col.pack(side="left", fill="both", expand=True, padx=(0, 6))
    ttk.Label(drugs_col, text="En Çok Basılan İlaçlar").pack(anchor="w")
    drugs_tree = ttk.Treeview(drugs_col, columns=("drug", "count"), show="headings", height=10)
    for col, label in zip(("drug", "count"), ("İlaç", "Basım Sayısı")):
        drugs_tree.heading(col, text=label)
    drugs_tree.pack(fill="both", expand=True)

    staff_col = ttk.Frame(lists_frame)
    staff_col.pack(side="left", fill="both", expand=True, padx=6)
    ttk.Label(staff_col, text="En Aktif Personel").pack(anchor="w")
    staff_tree = ttk.Treeview(staff_col, columns=("staff", "count"), show="headings", height=10)
    for col, label in zip(("staff", "count"), ("Personel", "Basım Sayısı")):
        staff_tree.heading(col, text=label)
    staff_tree.pack(fill="both", expand=True)

    days_col = ttk.Frame(lists_frame)
    days_col.pack(side="left", fill="both", expand=True, padx=(6, 0))
    ttk.Label(days_col, text="Son 7 Gün").pack(anchor="w")
    days_tree = ttk.Treeview(days_col, columns=("day", "count"), show="headings", height=10)
    for col, label in zip(("day", "count"), ("Tarih", "Etiket Sayısı")):
        days_tree.heading(col, text=label)
    days_tree.pack(fill="both", expand=True)

    def refresh():
        s = stats.summary()
        summary_label.config(text=f"Toplam basılan etiket: {s['total']}")
        drugs_tree.delete(*drugs_tree.get_children())
        for name, count in s["top_drugs"]:
            drugs_tree.insert("", "end", values=(name, count))
        staff_tree.delete(*staff_tree.get_children())
        for name, count in s["top_staff"]:
            staff_tree.insert("", "end", values=(name, count))
        days_tree.delete(*days_tree.get_children())
        for day, count in s["by_day"]:
            days_tree.insert("", "end", values=(day, count))

    ttk.Button(frame, text="Yenile", command=refresh).pack(anchor="w", pady=(8, 0))
    refresh()


# ----------------------------------------------------------------------
# Stok / SKT Takip
# ----------------------------------------------------------------------
def _build_stock_tab(notebook):
    frame = ttk.Frame(notebook, padding=8)
    notebook.add(frame, text="Stok / SKT Takip")

    columns = ("name", "quantity", "min_quantity", "expiry", "note", "status")
    tree = ttk.Treeview(frame, columns=columns, show="headings", height=16)
    for col, label in zip(columns, ("Ürün", "Miktar", "Min. Stok", "SKT", "Not", "Durum")):
        tree.heading(col, text=label)
    tree.tag_configure("expired", background="#f8d7da")
    tree.tag_configure("expiring_soon", background="#fff3cd")
    tree.tag_configure("low_stock", background="#ffe5cc")
    tree.pack(fill="both", expand=True)

    def refresh():
        tree.delete(*tree.get_children())
        items = stock.load_stock()
        grouped = stock.get_expiring_items()
        expired_ids = {i["id"] for i in grouped["expired"]}
        expiring_ids = {i["id"] for i in grouped["expiring_soon"]}
        low_ids = {i["id"] for i in stock.get_low_stock_items(items)}
        for item in items:
            if item["id"] in expired_ids:
                status, tag = "SÜRESİ GEÇTİ", "expired"
            elif item["id"] in expiring_ids:
                status, tag = "SKT YAKLAŞIYOR", "expiring_soon"
            elif item["id"] in low_ids:
                status, tag = "STOK DÜŞÜK", "low_stock"
            else:
                status, tag = "", None
            tree.insert(
                "", "end", iid=item["id"],
                values=(
                    item["name"],
                    item["quantity"],
                    item.get("min_quantity", 0) or "",
                    item["expiry_date"],
                    item.get("note", ""),
                    status,
                ),
                tags=(tag,) if tag else (),
            )

    def add_item():
        name = simpledialog.askstring("Yeni Ürün", "Ürün adı:")
        if not name:
            return
        qty = simpledialog.askinteger("Miktar", "Miktar:", initialvalue=1) or 0
        min_qty = simpledialog.askinteger(
            "Minimum Stok",
            "Miktar bu eşiğin altına/eşitine düşünce uyarılmak için minimum stok "
            "(0 = düşük stok uyarısı yapılmasın):",
            initialvalue=0,
        ) or 0
        expiry = simpledialog.askstring("SKT", "Son kullanma tarihi (YYYY-AA-GG):")
        note = simpledialog.askstring("Not", "Not (opsiyonel):")
        stock.add_item(name, qty, expiry or "", note or "", min_quantity=min_qty)
        refresh()

    def delete_item():
        sel = tree.selection()
        if sel:
            stock.delete_item(sel[0])
            refresh()

    def import_csv():
        path = filedialog.askopenfilename(filetypes=[("CSV", "*.csv")])
        if path:
            stock.import_stock_csv(path)
            refresh()

    btns = ttk.Frame(frame)
    btns.pack(fill="x", pady=(6, 0))
    ttk.Button(btns, text="Ekle", command=add_item).pack(side="left", padx=2)
    ttk.Button(btns, text="Sil", command=delete_item).pack(side="left", padx=2)
    ttk.Button(btns, text="CSV İçe Aktar", command=import_csv).pack(side="left", padx=2)

    refresh()


# ----------------------------------------------------------------------
# Yedekleme
# ----------------------------------------------------------------------
def _build_backup_tab(notebook):
    frame = ttk.Frame(notebook, padding=12)
    notebook.add(frame, text="Yedekleme")

    def do_backup():
        path = filedialog.asksaveasfilename(defaultextension=".zip", filetypes=[("Zip", "*.zip")])
        if path:
            backup.create_backup(path)
            messagebox.showinfo("Yedeklendi", f"Yedek kaydedildi:\n{path}")

    def do_restore():
        path = filedialog.askopenfilename(filetypes=[("Zip", "*.zip")])
        if path and messagebox.askyesno("Geri Yükle", "Mevcut yerel veriler yedekteki dosyalarla değiştirilecek. Devam edilsin mi?"):
            restored = backup.restore_backup(path)
            messagebox.showinfo("Geri Yüklendi", f"Geri yüklenen dosyalar: {', '.join(restored) if restored else 'yok'}\n\nDeğişikliklerin geçerli olması için programı yeniden başlatın.")

    ttk.Button(frame, text="Yedek Al (.zip)", command=do_backup).pack(anchor="w", pady=4)
    ttk.Button(frame, text="Yedekten Geri Yükle", command=do_restore).pack(anchor="w", pady=4)
