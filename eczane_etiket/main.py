"""Eczane İlaç Etiketi Programı — Hızlı Etiket ana ekranı (Tkinter).

Bu ekran günlük kullanım için sade tutulur; yönetimsel işler (profiller,
ilaç listesi, şablonlar, personel, geçmiş/raporlar, stok, yedekleme)
Admin Panelinde toplanır (bkz. admin_panel.py).
"""

import datetime as _dt
import tempfile
import tkinter as tk
import uuid
from tkinter import messagebox, filedialog, simpledialog, ttk

from . import data, history, profiles, staff
from .label_pdf import LabelEntry, build_label_pdf, print_pdf

PREVIEW_BG = "#1a2a4d"
PREVIEW_FG = "white"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Eczane İlaç Etiketi Programı")
        self.geometry("980x680")
        self.minsize(880, 600)

        self.active_profile = profiles.get_active_profile()
        self.drug_list = data.load_drug_list()
        self.batch_mode = tk.BooleanVar(value=False)
        self.batch_entries = []  # list[LabelEntry]

        self._build_layout()
        self._refresh_instruction_buttons(data.DEFAULT_FORM)
        self._refresh_history_list()
        self._refresh_preview()
        self._barcode_entry.focus_set()
        self.bind("<Control-p>", lambda e: self._on_print())

    # ------------------------------------------------------------------
    # Layout
    # ------------------------------------------------------------------
    def _build_layout(self):
        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")
        self.profile_label = ttk.Label(
            top, text=f"Aktif Eczane: {self.active_profile.get('name', '')}", font=("Segoe UI", 10, "bold")
        )
        self.profile_label.pack(side="left")
        ttk.Button(top, text="Admin Paneli", command=self._open_admin_panel).pack(side="right")

        body = ttk.Frame(self, padding=8)
        body.pack(fill="both", expand=True)

        left = ttk.Frame(body)
        left.pack(side="left", fill="both", expand=True, padx=(0, 8))
        right = ttk.Frame(body, width=340)
        right.pack(side="right", fill="y")

        self._build_form(left)
        self._build_preview_and_history(right)

    def _build_form(self, parent):
        mode_frame = ttk.Frame(parent)
        mode_frame.pack(fill="x", pady=(0, 6))
        ttk.Radiobutton(mode_frame, text="Tekli Etiket", value=False, variable=self.batch_mode,
                         command=self._on_mode_change).pack(side="left")
        ttk.Radiobutton(mode_frame, text="Toplu Etiket (reçetedeki tüm ilaçlar)", value=True,
                         variable=self.batch_mode, command=self._on_mode_change).pack(side="left", padx=(12, 0))

        form = ttk.LabelFrame(parent, text="Etiket Bilgileri", padding=8)
        form.pack(fill="x")

        row = 0
        ttk.Label(form, text="Barkod Oku (okuyucuyla okutun, Enter'a basın):").grid(row=row, column=0, sticky="w", pady=2)
        self.barcode_var = tk.StringVar()
        barcode_entry = ttk.Entry(form, textvariable=self.barcode_var, width=40)
        barcode_entry.grid(row=row, column=1, sticky="we", pady=2)
        barcode_entry.bind("<Return>", self._on_barcode_scanned)
        self._barcode_entry = barcode_entry
        row += 1

        ttk.Label(form, text="Hasta Adı (opsiyonel):").grid(row=row, column=0, sticky="w", pady=2)
        self.patient_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.patient_var, width=40).grid(row=row, column=1, sticky="we", pady=2)
        row += 1

        ttk.Label(form, text="İlaç Adı:").grid(row=row, column=0, sticky="w", pady=2)
        self.drug_var = tk.StringVar()
        self.drug_combo = ttk.Combobox(form, textvariable=self.drug_var, width=38)
        self.drug_combo["values"] = [d["name"] for d in self.drug_list]
        self.drug_combo.grid(row=row, column=1, sticky="we", pady=2)
        self.drug_combo.bind("<KeyRelease>", self._on_drug_typed)
        self.drug_combo.bind("<<ComboboxSelected>>", self._on_drug_selected)
        row += 1

        ttk.Label(form, text="Ne İçin Kullanılır:").grid(row=row, column=0, sticky="w", pady=2)
        self.purpose_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.purpose_var, width=40).grid(row=row, column=1, sticky="we", pady=2)
        row += 1

        ttk.Label(form, text="Tanı (opsiyonel):").grid(row=row, column=0, sticky="w", pady=2)
        self.diagnosis_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.diagnosis_var, width=40).grid(row=row, column=1, sticky="we", pady=2)
        row += 1

        ttk.Label(form, text="Hasta Notu / Bilinen Alerji:").grid(row=row, column=0, sticky="w", pady=2)
        self.note_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.note_var, width=40).grid(row=row, column=1, sticky="we", pady=2)
        ttk.Label(form, text="(bilgi amaçlıdır, otomatik kontrol yapılmaz)", foreground="gray").grid(
            row=row, column=2, sticky="w", padx=(6, 0)
        )
        row += 1

        ttk.Label(form, text="Tedavi Bitiş Tarihi (opsiyonel, GG.AA.YYYY):").grid(row=row, column=0, sticky="w", pady=2)
        self.end_date_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.end_date_var, width=20).grid(row=row, column=1, sticky="w", pady=2)
        row += 1

        ttk.Label(form, text="Adet:").grid(row=row, column=0, sticky="w", pady=2)
        self.copies_var = tk.IntVar(value=1)
        ttk.Spinbox(form, from_=1, to=20, textvariable=self.copies_var, width=6).grid(row=row, column=1, sticky="w", pady=2)
        row += 1

        staff_names = staff.load_staff()
        ttk.Label(form, text="Personel:").grid(row=row, column=0, sticky="w", pady=2)
        self.staff_var = tk.StringVar()
        self.staff_combo = ttk.Combobox(form, textvariable=self.staff_var, values=staff_names, width=20)
        self.staff_combo.grid(row=row, column=1, sticky="w", pady=2)
        row += 1

        form.columnconfigure(1, weight=1)

        self.instr_buttons_frame = ttk.LabelFrame(parent, text="Hızlı Talimatlar (ilaç formuna göre)", padding=8)
        self.instr_buttons_frame.pack(fill="x", pady=(8, 0))

        instr_frame = ttk.LabelFrame(parent, text="Kullanım Talimatı (serbest düzenlenebilir)", padding=8)
        instr_frame.pack(fill="both", pady=(8, 0))
        self.instructions_text = tk.Text(instr_frame, height=3, wrap="word")
        self.instructions_text.pack(fill="x")
        self.instructions_text.bind("<KeyRelease>", lambda e: self._refresh_preview())

        detail_frame = ttk.LabelFrame(parent, text="Neden Kullanılır? — Kısa Prospektüs (ilaç seçilince otomatik dolar, düzenlenebilir)", padding=8)
        detail_frame.pack(fill="both", pady=(8, 0))
        self.detail_text = tk.Text(detail_frame, height=3, wrap="word")
        self.detail_text.pack(fill="x")
        self.detail_text.bind("<KeyRelease>", lambda e: self._refresh_preview())

        storage_frame = ttk.LabelFrame(parent, text="Saklama Koşulu (ilaç seçilince otomatik dolar, düzenlenebilir)", padding=8)
        storage_frame.pack(fill="x", pady=(8, 0))
        self.storage_var = tk.StringVar()
        ttk.Entry(storage_frame, textvariable=self.storage_var).pack(fill="x")

        self.batch_frame = ttk.LabelFrame(parent, text="Toplu Etiket Listesi", padding=8)
        columns = ("drug", "instructions", "copies")
        self.batch_tree = ttk.Treeview(self.batch_frame, columns=columns, show="headings", height=5)
        for col, label in zip(columns, ("İlaç", "Talimat", "Adet")):
            self.batch_tree.heading(col, text=label)
        self.batch_tree.pack(fill="both", expand=True)
        batch_btns = ttk.Frame(self.batch_frame)
        batch_btns.pack(fill="x", pady=(4, 0))
        ttk.Button(batch_btns, text="Sepete Ekle", command=self._add_to_batch).pack(side="left")
        ttk.Button(batch_btns, text="Seçileni Sil", command=self._remove_from_batch).pack(side="left", padx=(6, 0))

        action_frame = ttk.Frame(parent)
        action_frame.pack(fill="x", pady=(8, 0))
        ttk.Button(action_frame, text="Yazdır (Ctrl+P)", command=self._on_print).pack(side="left")
        ttk.Button(action_frame, text="PDF Olarak Kaydet", command=self._on_save_pdf).pack(side="left", padx=(6, 0))

        for var in (self.purpose_var, self.diagnosis_var, self.patient_var, self.end_date_var, self.storage_var):
            var.trace_add("write", lambda *a: self._refresh_preview())

    def _build_preview_and_history(self, parent):
        preview_frame = ttk.LabelFrame(parent, text="Önizleme", padding=8)
        preview_frame.pack(fill="both", expand=False)
        self.preview_text = tk.Text(preview_frame, width=42, height=14, bg="white")
        self.preview_text.pack(fill="both", expand=True)
        self._configure_preview_tags(self.preview_text)
        ttk.Button(preview_frame, text="Büyüt", command=self._open_zoom_preview).pack(pady=(4, 0))

        history_frame = ttk.LabelFrame(parent, text="Geçmiş (çift tıkla tekrar doldur)", padding=8)
        history_frame.pack(fill="both", expand=True, pady=(8, 0))
        self.history_list = tk.Listbox(history_frame)
        self.history_list.pack(fill="both", expand=True)
        self.history_list.bind("<Double-Button-1>", self._on_history_double_click)

    def _configure_preview_tags(self, widget):
        widget.tag_configure("banner", background=PREVIEW_BG, foreground=PREVIEW_FG, justify="center")
        widget.tag_configure("bold_center", font=("Segoe UI", 10, "bold"), justify="center")
        widget.tag_configure("header", font=("Segoe UI", 10, "bold"))
        widget.tag_configure("small", font=("Segoe UI", 8), foreground="gray20")
        widget.tag_configure("normal", font=("Segoe UI", 9))

    # ------------------------------------------------------------------
    # Etkileşim
    # ------------------------------------------------------------------
    def _on_mode_change(self):
        if self.batch_mode.get():
            self.batch_frame.pack(fill="both", pady=(8, 0))
        else:
            self.batch_frame.pack_forget()

    def _on_drug_typed(self, event):
        query = self.drug_var.get()
        matches = data.search_drugs(query, self.drug_list)
        self.drug_combo["values"] = [d["name"] for d in matches]

    def _current_drug_record(self):
        return data.find_drug(self.drug_var.get(), self.drug_list)

    def _on_drug_selected(self, event=None):
        drug = self._current_drug_record()
        if not drug:
            return
        if drug.get("kullanim_amaci") and not self.purpose_var.get():
            self.purpose_var.set(drug["kullanim_amaci"])
        if drug.get("kisa_prospektus"):
            current = self.detail_text.get("1.0", "end").strip()
            if drug["kisa_prospektus"] not in current:
                # Eski yazı silinmez, yeni prospektüs metni altına eklenir.
                new_text = f"{current}\n{drug['kisa_prospektus']}" if current else drug["kisa_prospektus"]
                self.detail_text.delete("1.0", "end")
                self.detail_text.insert("1.0", new_text)
        if drug.get("saklama_kosulu"):
            current_storage = self.storage_var.get().strip()
            if drug["saklama_kosulu"] not in current_storage:
                new_storage = f"{current_storage} {drug['saklama_kosulu']}".strip() if current_storage else drug["saklama_kosulu"]
                self.storage_var.set(new_storage)
        self._refresh_instruction_buttons(drug.get("form", "tablet"))
        self._refresh_preview()

    def _on_barcode_scanned(self, event=None):
        """USB barkod okuyucu klavye gibi davranır: kodu yazıp Enter'a basar."""
        code = self.barcode_var.get().strip()
        self.barcode_var.set("")
        if not code:
            return
        drug = data.find_drug_by_barcode(code, self.drug_list)
        if not drug:
            messagebox.showwarning(
                "Barkod Bulunamadı",
                f"'{code}' barkoduyla eşleşen bir ilaç bulunamadı.\n\n"
                "İlacı Admin Panelinden barkod ekleyerek kaydedebilir ya da adını elle girebilirsiniz.",
            )
            return
        self.drug_var.set(drug["name"])
        self._on_drug_selected()
        self._barcode_entry.focus_set()

    def _refresh_instruction_buttons(self, form):
        for child in self.instr_buttons_frame.winfo_children():
            child.destroy()
        templates = data.get_instruction_templates(form)
        for i, tmpl in enumerate(templates):
            btn = ttk.Button(self.instr_buttons_frame, text=tmpl, command=lambda t=tmpl: self._append_instruction(t))
            btn.grid(row=i // 2, column=i % 2, sticky="we", padx=2, pady=2)
        self.instr_buttons_frame.columnconfigure(0, weight=1)
        self.instr_buttons_frame.columnconfigure(1, weight=1)

    def _append_instruction(self, text):
        current = self.instructions_text.get("1.0", "end").strip()
        new_text = f"{current} {text}".strip() if current else text
        self.instructions_text.delete("1.0", "end")
        self.instructions_text.insert("1.0", new_text)
        self._refresh_preview()

    def _build_current_entry(self) -> LabelEntry:
        purpose = self.purpose_var.get().strip()
        diagnosis = self.diagnosis_var.get().strip()
        banner_parts = [p for p in (purpose, diagnosis) if p]
        banner = " - ".join(banner_parts) if banner_parts else None
        return LabelEntry(
            drug_name=self.drug_var.get().strip(),
            kullanim_amaci_tani=banner,
            instructions=self.instructions_text.get("1.0", "end").strip(),
            detail_note=self.detail_text.get("1.0", "end").strip() or None,
            storage_note=self.storage_var.get().strip() or None,
            patient_name=self.patient_var.get().strip() or None,
            end_date=self.end_date_var.get().strip() or None,
            staff_name=self.staff_var.get().strip() or None,
            copies=self.copies_var.get(),
        )

    def _refresh_preview(self):
        entry = self._build_current_entry()
        self._render_preview(self.preview_text, entry)

    def _render_preview(self, widget, entry: LabelEntry):
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        if entry.patient_name:
            widget.insert("end", f"Hasta: {entry.patient_name}\n", "small")
        header = entry.drug_name or "(ilaç seçilmedi)"
        date_str = _dt.datetime.now().strftime("%d.%m.%Y %H:%M")
        widget.insert("end", f"{header}\n", "header")
        widget.insert("end", f"{date_str}\n\n", "small")
        if entry.kullanim_amaci_tani:
            widget.insert("end", f" {entry.kullanim_amaci_tani.upper()} \n\n", "banner")
        if entry.detail_note:
            widget.insert("end", f"{entry.detail_note}\n\n", "normal")
        if entry.instructions:
            widget.insert("end", f"{entry.instructions.upper()}\n\n", "bold_center")
        if entry.storage_note:
            widget.insert("end", f"Saklama: {entry.storage_note}\n\n", "small")
        footer = self.active_profile.get("name", "")
        if self.active_profile.get("phone"):
            footer += f"  /  {self.active_profile['phone']}"
        widget.insert("end", f" {footer} ", "banner")
        widget.configure(state="disabled")

    def _open_zoom_preview(self):
        top = tk.Toplevel(self)
        top.title("Etiket Önizleme (Büyütülmüş)")
        top.geometry("640x520")
        text = tk.Text(top, wrap="word", font=("Segoe UI", 13))
        text.pack(fill="both", expand=True, padx=10, pady=10)
        self._configure_preview_tags(text)
        text.tag_configure("banner", background=PREVIEW_BG, foreground=PREVIEW_FG, justify="center", font=("Segoe UI", 13, "bold"))
        text.tag_configure("bold_center", font=("Segoe UI", 14, "bold"), justify="center")
        text.tag_configure("header", font=("Segoe UI", 15, "bold"))
        text.tag_configure("normal", font=("Segoe UI", 12))
        self._render_preview(text, self._build_current_entry())

    def _add_to_batch(self):
        entry = self._build_current_entry()
        if not entry.drug_name:
            messagebox.showwarning("Eksik bilgi", "Lütfen önce bir ilaç adı girin.")
            return
        self.batch_entries.append(entry)
        iid = str(uuid.uuid4())
        self.batch_tree.insert("", "end", iid=iid, values=(entry.drug_name, entry.instructions, entry.copies))

    def _remove_from_batch(self):
        selected = self.batch_tree.selection()
        for iid in selected:
            index = self.batch_tree.index(iid)
            self.batch_tree.delete(iid)
            if 0 <= index < len(self.batch_entries):
                del self.batch_entries[index]

    def _entries_to_print(self):
        if self.batch_mode.get() and self.batch_entries:
            return list(self.batch_entries)
        entry = self._build_current_entry()
        if not entry.drug_name:
            return []
        return [entry]

    def _log_and_bump(self, entries):
        for entry in entries:
            history.log_label(
                {
                    "patient_name": entry.patient_name,
                    "drug_name": entry.drug_name,
                    "kullanim_amaci_tani": entry.kullanim_amaci_tani,
                    "instructions": entry.instructions,
                    "staff_name": entry.staff_name,
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
            messagebox.showwarning("Eksik bilgi", "Lütfen önce bir ilaç adı girin.")
            return
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        build_label_pdf(self.active_profile, entries, tmp.name)
        success, error = print_pdf(tmp.name)
        if not success:
            messagebox.showerror(
                "Yazdırma hatası",
                f"Etiket yazdırılamadı: {error}\n\nPDF şu konumda kaydedildi: {tmp.name}",
            )
            return
        self._log_and_bump(entries)
        if self.batch_mode.get():
            self.batch_entries.clear()
            self.batch_tree.delete(*self.batch_tree.get_children())

    def _on_save_pdf(self):
        entries = self._entries_to_print()
        if not entries:
            messagebox.showwarning("Eksik bilgi", "Lütfen önce bir ilaç adı girin.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
        if not path:
            return
        build_label_pdf(self.active_profile, entries, path)
        self._log_and_bump(entries)
        messagebox.showinfo("Kaydedildi", f"Etiket PDF olarak kaydedildi:\n{path}")

    def _refresh_history_list(self):
        self.history_list.delete(0, "end")
        for record in history.load_history()[:50]:
            ts = record.get("timestamp", "")
            patient = record.get("patient_name") or "-"
            drug = record.get("drug_name", "")
            self.history_list.insert("end", f"{ts}  |  {patient}  |  {drug}")
        self._history_records = history.load_history()[:50]

    def _on_history_double_click(self, event):
        selection = self.history_list.curselection()
        if not selection:
            return
        record = self._history_records[selection[0]]
        self.patient_var.set(record.get("patient_name") or "")
        self.drug_var.set(record.get("drug_name") or "")
        self.instructions_text.delete("1.0", "end")
        self.instructions_text.insert("1.0", record.get("instructions") or "")
        banner = record.get("kullanim_amaci_tani") or ""
        self.purpose_var.set(banner)
        self._refresh_preview()

    def _open_admin_panel(self):
        pin = None
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
        self.profile_label.config(text=f"Aktif Eczane: {self.active_profile.get('name', '')}")
        self.drug_list = data.load_drug_list()
        self.drug_combo["values"] = [d["name"] for d in self.drug_list]
        self.staff_combo["values"] = staff.load_staff()
        self._refresh_preview()


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
