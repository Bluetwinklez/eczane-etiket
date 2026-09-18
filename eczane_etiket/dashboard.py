"""Eczane Yönetici Dashboard & Özet Gösterge Paneli.

- KPI Özet Kartları: Günlük ciro (₺), bugün basılan etiket sayısı, kritik stok & SKT uyarıları.
- Grafikli Trendler: CanvasChart ile entegre Bar ve Çizgi grafikler.
- Responsive Düzen: Geniş ekranda 4 sütun, tablet/dar ekranda 2 sütun veya tek sütun.
- Renkli Durum Etiketleri: Kritik (kırmızı), SKT yakın (sarı), normal (yeşil).
- Son İşlemler tablosu.
"""

import datetime as _dt
import tkinter as tk
from tkinter import ttk
from typing import Optional

from . import profiles, stats, theme
from .charts import CanvasChart


class DashboardView(ttk.Frame):
    def __init__(self, master: tk.Misc, **kwargs):
        super().__init__(master, **kwargs)
        self.cards_frame = None
        self.card_widgets = []
        self.chart_widget: Optional[CanvasChart] = None
        self.recent_tree: Optional[ttk.Treeview] = None
        self.chart_metric_var = tk.StringVar(value="counts")  # "counts" veya "turnover"

        self._build_ui()
        self.refresh()

    def _build_ui(self):
        # 1. Üst Başlık ve Yenileme Butonu
        header_bar = ttk.Frame(self)
        header_bar.pack(fill="x", pady=(0, 10))

        title_lbl = ttk.Label(
            header_bar,
            text="📊 Eczane Özet Gösterge Paneli",
            font=(theme.FONT_FAMILY, 14, "bold"),
            foreground=theme.PRIMARY,
        )
        title_lbl.pack(side="left")

        btn_box = ttk.Frame(header_bar)
        btn_box.pack(side="right")

        self.last_update_lbl = ttk.Label(
            btn_box,
            text="",
            style="Muted.TLabel",
            font=(theme.FONT_FAMILY, 8),
        )
        self.last_update_lbl.pack(side="left", padx=(0, 12))

        ttk.Button(
            btn_box,
            text="🔄 Yenile",
            style="Primary.TButton",
            command=self.refresh,
        ).pack(side="left")

        # 2. Responsive KPI Kartları Konteyneri
        self.cards_container = ttk.Frame(self)
        self.cards_container.pack(fill="x", pady=(0, 14))
        self.cards_container.bind("<Configure>", self._on_container_resize)

        self._create_summary_cards()

        # 3. Grafik ve Son İşlemler (2 Sütunlu veya Dikey Bölüm)
        content_split = ttk.Frame(self)
        content_split.pack(fill="both", expand=True)

        # Sol/Üst: Grafik Bölümü
        chart_card = ttk.Frame(content_split, style="Card.TFrame", padding=12)
        chart_card.pack(side="left", fill="both", expand=True, padx=(0, 6))

        chart_header = ttk.Frame(chart_card)
        chart_header.pack(fill="x", pady=(0, 6))
        ttk.Label(
            chart_header,
            text="📈 Haftalık Trend Analizi",
            font=(theme.FONT_FAMILY, 11, "bold"),
            foreground=theme.PRIMARY,
        ).pack(side="left")

        metric_selector = ttk.Frame(chart_header)
        metric_selector.pack(side="right")
        ttk.Radiobutton(
            metric_selector,
            text="Etiket Sayısı",
            value="counts",
            variable=self.chart_metric_var,
            command=self._update_chart,
        ).pack(side="left", padx=(0, 6))
        ttk.Radiobutton(
            metric_selector,
            text="Ciro (TL)",
            value="turnover",
            variable=self.chart_metric_var,
            command=self._update_chart,
        ).pack(side="left")

        self.chart_widget = CanvasChart(chart_card, height=210)
        self.chart_widget.pack(fill="both", expand=True)

        # Sağ/Alt: Son İşlemler Tablosu
        recent_card = ttk.Frame(content_split, style="Card.TFrame", padding=12)
        recent_card.pack(side="left", fill="both", expand=True, padx=(6, 0))

        ttk.Label(
            recent_card,
            text="🕒 Son İşlemler (Canlı Akış)",
            font=(theme.FONT_FAMILY, 11, "bold"),
            foreground=theme.PRIMARY,
        ).pack(anchor="w", pady=(0, 6))

        cols = ("time", "patient", "drug", "price", "status")
        self.recent_tree = ttk.Treeview(recent_card, columns=cols, show="headings", height=8)
        for col, heading, w in zip(
            cols,
            ("Zaman", "Hasta", "İlaç", "Tutar", "Durum"),
            (75, 110, 130, 70, 75),
        ):
            self.recent_tree.heading(col, text=heading)
            self.recent_tree.column(col, width=w)

        # Durum Etiketi Renkleri (Badges)
        self.recent_tree.tag_configure("success", background="#ecfdf5", foreground="#065f46")
        self.recent_tree.tag_configure("warning", background="#fffbeb", foreground="#92400e")
        self.recent_tree.tag_configure("danger", background="#fef2f2", foreground="#991b1b")

        recent_scroll = ttk.Scrollbar(recent_card, orient="vertical", command=self.recent_tree.yview)
        self.recent_tree.configure(yscrollcommand=recent_scroll.set)
        self.recent_tree.pack(side="left", fill="both", expand=True)
        recent_scroll.pack(side="right", fill="y")

    def _create_summary_cards(self):
        self.card_data_holders = []

        # 4 Kart Tanımı: (İkon, Başlık, Varsayılan Değer, Alt Başlık, Renk)
        specs = [
            ("💰", "GÜNLÜK CİRO", "₺ 0,00", "Bugünkü tahmini satış", "#059669"),
            ("🏷️", "BUGÜN BASILAN", "0 Adet", "Toplam etiket sayısı", "#2563eb"),
            ("⚠️", "KRİTİK STOK / SKT", "0 / 0", "Kritik & süresi yaklaşanlar", "#dc2626"),
            ("🏥", "AKTİF PROFİL", "Eczanem", "Sistem kayıtlı ilaç", "#7c3aed"),
        ]

        for icon, title, val, subtitle, accent_color in specs:
            card = ttk.Frame(self.cards_container, style="Card.TFrame", padding=12)

            top_line = ttk.Frame(card)
            top_line.pack(fill="x")
            ttk.Label(
                top_line,
                text=icon,
                font=(theme.FONT_FAMILY, 14),
            ).pack(side="left", padx=(0, 6))

            ttk.Label(
                top_line,
                text=title,
                font=(theme.FONT_FAMILY, 8, "bold"),
                foreground=theme.TEXT_MUTED,
            ).pack(side="left")

            val_lbl = ttk.Label(
                card,
                text=val,
                font=(theme.FONT_FAMILY, 15, "bold"),
                foreground=accent_color,
            )
            val_lbl.pack(anchor="w", pady=(4, 2))

            sub_lbl = ttk.Label(
                card,
                text=subtitle,
                style="Muted.TLabel",
                font=(theme.FONT_FAMILY, 8),
            )
            sub_lbl.pack(anchor="w")

            self.card_widgets.append(card)
            self.card_data_holders.append({"val": val_lbl, "sub": sub_lbl, "accent": accent_color})

    def _on_container_resize(self, event):
        """Responsive Grid: Ekran genişliğine göre 4 sütun, 2 sütun veya 1 sütun yapar."""
        w = event.width
        for c in self.card_widgets:
            c.grid_forget()

        if w >= 820:
            # 4 Sütun Yan Yana
            for i, c in enumerate(self.card_widgets):
                c.grid(row=0, column=i, sticky="nsew", padx=4, pady=4)
                self.cards_container.grid_columnconfigure(i, weight=1)
        elif w >= 480:
            # 2x2 Grid (Tablet Modu)
            for i, c in enumerate(self.card_widgets):
                row = i // 2
                col = i % 2
                c.grid(row=row, column=col, sticky="nsew", padx=4, pady=4)
                self.cards_container.grid_columnconfigure(col, weight=1)
            self.cards_container.grid_columnconfigure(2, weight=0)
            self.cards_container.grid_columnconfigure(3, weight=0)
        else:
            # 1 Sütun (Mobil / Dar Ekran)
            for i, c in enumerate(self.card_widgets):
                c.grid(row=i, column=0, sticky="nsew", padx=4, pady=3)
            self.cards_container.grid_columnconfigure(0, weight=1)

    def refresh(self):
        s = stats.summary(days=7)
        now_str = _dt.datetime.now().strftime("%H:%M:%S")
        self.last_update_lbl.config(text=f"Son güncelleme: {now_str}")

        # 1. Kart Değerlerini Güncelle
        today_turnover = s.get("today_turnover", 0.0)
        today_count = s.get("today_count", 0)
        stock_al = s.get("stock_alerts", {})
        expired = stock_al.get("expired_count", 0)
        expiring = stock_al.get("expiring_soon_count", 0)
        low = stock_al.get("low_stock_count", 0)
        total_items = stock_al.get("total_stock_items", 0)

        active_prof = profiles.get_active_profile()
        prof_name = active_prof.get("name") or "Eczanem"

        self.card_data_holders[0]["val"].config(text=f"₺ {today_turnover:,.2f}")
        self.card_data_holders[0]["sub"].config(text=f"Bugünkü {today_count} işlem toplamı")

        self.card_data_holders[1]["val"].config(text=f"{today_count} Adet")
        self.card_data_holders[1]["sub"].config(text=f"Toplam kayıtlı: {s.get('total', 0)}")

        crit_text = f"{expired + low} Kritik / {expiring} Yakın"
        self.card_data_holders[2]["val"].config(text=crit_text)
        self.card_data_holders[2]["sub"].config(text=f"{expired} SKT geçti, {low} düşük stok")

        self.card_data_holders[3]["val"].config(text=prof_name[:16])
        self.card_data_holders[3]["sub"].config(text=f"{total_items} stok kalemi tanımlı")

        # 2. Grafiği Güncelle
        self._update_chart(s)

        # 3. Son İşlemler Tablosunu Güncelle
        if self.recent_tree:
            self.recent_tree.delete(*self.recent_tree.get_children())
            recents = s.get("recent_transactions", [])
            for r in recents:
                price_str = f"₺ {r['price']:,.2f}"
                time_str = r.get("display_time", "")[-5:] or "--:--"
                self.recent_tree.insert(
                    "",
                    "end",
                    values=(
                        time_str,
                        r.get("patient_name", "-"),
                        r.get("drug_name", "-"),
                        price_str,
                        r.get("status", "Tamamlandı"),
                    ),
                    tags=("success",),
                )

    def _update_chart(self, s: Optional[dict] = None):
        if not self.chart_widget:
            return
        if s is None:
            s = stats.summary(days=7)

        metric = self.chart_metric_var.get()
        if metric == "turnover":
            data = s.get("turnover_by_day", [])
            self.chart_widget.set_data(data, title="Haftalık Ciro Trendi (TL)", unit="TL")
        else:
            data = s.get("by_day", [])
            self.chart_widget.set_data(data, title="Haftalık Etiket Basım Sayısı", unit="adet")


def open_dashboard_dialog(parent):
    """Ana ekrandan bağımsız veya modal Dashboard penceresi açar."""
    top = tk.Toplevel(parent)
    top.title("📊 Eczane Dashboard & Performans Paneli")
    top.geometry("920x620")
    top.minsize(780, 520)
    top.configure(bg=theme.BG_APP)

    dash = DashboardView(top, padding=14)
    dash.pack(fill="both", expand=True)

    bottom_bar = ttk.Frame(top, padding=(14, 0, 14, 12))
    bottom_bar.pack(fill="x")
    ttk.Button(bottom_bar, text="Kapat", command=top.destroy).pack(side="right")
    return top
