"""Tkinter Canvas tabanlı modern grafik bileşeni.

Harici ağır kütüphane bağımlılığı olmaksızın %100 yerel ve hızlı çalışan:
- Bar Grafik (çubuk grafik)
- Çizgi / Trend Grafiği (line chart & veri noktaları)
sağlar. Temaya tam uyumludur ve pencere boyutuna göre otomatik ölçeklenir.
"""

import tkinter as tk
from tkinter import ttk
from typing import List, Optional, Tuple

from . import theme


class CanvasChart(ttk.Frame):
    def __init__(
        self,
        master: tk.Misc,
        data: Optional[List[Tuple[str, float]]] = None,
        chart_type: str = "bar",  # "bar" veya "line"
        title: str = "Günlük İşlem Trendi",
        unit: str = "adet",
        height: int = 240,
        **kwargs,
    ):
        super().__init__(master, **kwargs)
        self.data = data or []
        self.chart_type = chart_type
        self.title = title
        self.unit = unit
        self.canvas_height = height

        self._build_ui()
        self.redraw()

    def _build_ui(self):
        # Üst Araç Çubuğu (Başlık + Bar/Çizgi Değiştirici)
        top_bar = ttk.Frame(self)
        top_bar.pack(fill="x", pady=(0, 6))

        self.title_label = ttk.Label(
            top_bar,
            text=self.title,
            font=(theme.FONT_FAMILY, 10, "bold"),
            foreground=theme.PRIMARY,
        )
        self.title_label.pack(side="left")

        # Butonlar
        btn_box = ttk.Frame(top_bar)
        btn_box.pack(side="right")

        self.btn_bar = ttk.Button(
            btn_box,
            text="📊 Bar",
            width=6,
            command=lambda: self.set_chart_type("bar"),
        )
        self.btn_bar.pack(side="left", padx=(0, 4))

        self.btn_line = ttk.Button(
            btn_box,
            text="📈 Çizgi",
            width=6,
            command=lambda: self.set_chart_type("line"),
        )
        self.btn_line.pack(side="left")

        # Canvas Alanı
        self.canvas = tk.Canvas(
            self,
            height=self.canvas_height,
            bg=theme.BG_CARD,
            bd=0,
            highlightthickness=1,
            highlightbackground=theme.BORDER,
        )
        self.canvas.pack(fill="both", expand=True)

        self.canvas.bind("<Configure>", lambda e: self.redraw())

    def set_data(self, data: List[Tuple[str, float]], title: Optional[str] = None, unit: Optional[str] = None):
        self.data = data
        if title:
            self.title = title
            self.title_label.config(text=title)
        if unit:
            self.unit = unit
        self.redraw()

    def set_chart_type(self, chart_type: str):
        if chart_type in ("bar", "line"):
            self.chart_type = chart_type
            self.redraw()

    def _get_theme_colors(self) -> dict:
        try:
            colors = getattr(self.winfo_toplevel(), "theme_colors", {})
            if colors:
                return colors
        except Exception:
            pass
        return {
            "bg_card": theme.BG_CARD,
            "primary": theme.PRIMARY,
            "secondary": theme.SECONDARY,
            "border": theme.BORDER,
            "text_primary": theme.TEXT_PRIMARY,
            "text_muted": theme.TEXT_MUTED,
            "success": theme.SUCCESS,
        }

    def redraw(self):
        self.canvas.delete("all")
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()

        if w <= 40:
            w = max(self.winfo_width(), self.winfo_reqwidth(), 360)
        if h <= 40:
            h = max(self.winfo_height(), self.canvas_height, 160)

        cols = self._get_theme_colors()
        self.canvas.configure(
            bg=cols.get("bg_card", "#ffffff"),
            highlightbackground=cols.get("border", "#cbd5e1"),
        )

        if not self.data:
            self.canvas.create_text(
                w // 2,
                h // 2,
                text="Henüz grafik verisi bulunmuyor",
                fill=cols.get("text_muted", "#94a3b8"),
                font=(theme.FONT_FAMILY, 10),
            )
            return

        if self.chart_type == "bar":
            self._draw_bar_chart(w, h, cols)
        else:
            self._draw_line_chart(w, h, cols)

    def _draw_bar_chart(self, w: int, h: int, cols: dict):
        pad_left = 50
        pad_right = 20
        pad_top = 30
        pad_bottom = 35

        plot_w = w - pad_left - pad_right
        plot_h = h - pad_top - pad_bottom

        max_val = max((v for _, v in self.data), default=10)
        if max_val <= 0:
            max_val = 10
        # 4 seviyeli ızgara adımı
        step = max(1, int(max_val / 4) + 1)
        grid_max = step * 4

        # Kılavuz çizgileri ve Y-Eksen etiketleri
        for i in range(5):
            val = i * step
            y = pad_top + plot_h - (val / grid_max * plot_h)
            # Kesikli kılavuz çizgisi
            self.canvas.create_line(
                pad_left, y, w - pad_right, y,
                fill=cols.get("border", "#e2e8f0"),
                dash=(2, 3),
            )
            val_str = f"{val:.0f}" if isinstance(val, int) or val.is_integer() else f"{val:.1f}"
            self.canvas.create_text(
                pad_left - 8, y,
                text=val_str,
                anchor="e",
                fill=cols.get("text_muted", "#94a3b8"),
                font=(theme.FONT_FAMILY, 8),
            )

        n = len(self.data)
        slot_w = plot_w / n
        bar_w = max(12, min(42, slot_w * 0.55))

        primary_color = cols.get("primary", "#2563eb")
        success_color = cols.get("success", "#10b981")
        text_primary = cols.get("text_primary", "#0f172a")
        text_muted = cols.get("text_muted", "#64748b")

        for idx, (label, val) in enumerate(self.data):
            cx = pad_left + (idx + 0.5) * slot_w
            x0 = cx - bar_w / 2
            x1 = cx + bar_w / 2
            bar_height = (val / grid_max) * plot_h
            y0 = pad_top + plot_h - bar_height
            y1 = pad_top + plot_h

            # Bar dolgusu ve kenarlığı
            bar_fill = primary_color if idx != n - 1 else success_color
            self.canvas.create_rectangle(
                x0, y0, x1, y1,
                fill=bar_fill,
                outline="",
            )

            # Değer etiketi
            if val > 0:
                val_text = f"{val:.0f}" if isinstance(val, int) or val.is_integer() else f"{val:.1f}"
                self.canvas.create_text(
                    cx, y0 - 8,
                    text=val_text,
                    fill=text_primary,
                    font=(theme.FONT_FAMILY, 8, "bold"),
                )

            # X-Eksen etiketi (tarih/gün)
            short_lbl = label[-5:] if len(label) >= 10 else label
            self.canvas.create_text(
                cx, y1 + 14,
                text=short_lbl,
                fill=text_muted,
                font=(theme.FONT_FAMILY, 8),
            )

        # Taban çizgisi
        self.canvas.create_line(
            pad_left, pad_top + plot_h, w - pad_right, pad_top + plot_h,
            fill=cols.get("border", "#cbd5e1"),
            width=2,
        )

    def _draw_line_chart(self, w: int, h: int, cols: dict):
        pad_left = 50
        pad_right = 25
        pad_top = 30
        pad_bottom = 35

        plot_w = w - pad_left - pad_right
        plot_h = h - pad_top - pad_bottom

        max_val = max((v for _, v in self.data), default=10)
        if max_val <= 0:
            max_val = 10
        step = max(1, int(max_val / 4) + 1)
        grid_max = step * 4

        # Kılavuz çizgileri
        for i in range(5):
            val = i * step
            y = pad_top + plot_h - (val / grid_max * plot_h)
            self.canvas.create_line(
                pad_left, y, w - pad_right, y,
                fill=cols.get("border", "#e2e8f0"),
                dash=(2, 3),
            )
            val_str = f"{val:.0f}" if isinstance(val, int) or val.is_integer() else f"{val:.1f}"
            self.canvas.create_text(
                pad_left - 8, y,
                text=val_str,
                anchor="e",
                fill=cols.get("text_muted", "#94a3b8"),
                font=(theme.FONT_FAMILY, 8),
            )

        n = len(self.data)
        slot_w = plot_w / max(1, (n - 1)) if n > 1 else plot_w

        points = []
        for idx, (label, val) in enumerate(self.data):
            cx = pad_left + (idx * slot_w if n > 1 else plot_w / 2)
            cy = pad_top + plot_h - (val / grid_max * plot_h)
            points.append((cx, cy, label, val))

        primary_color = cols.get("primary", "#2563eb")
        text_primary = cols.get("text_primary", "#0f172a")
        text_muted = cols.get("text_muted", "#64748b")

        # Çizgi bağlantıları
        if len(points) >= 2:
            coords = []
            for cx, cy, _, _ in points:
                coords.extend([cx, cy])
            self.canvas.create_line(
                *coords,
                fill=primary_color,
                width=3,
                smooth=True,
            )

        # Veri noktaları ve etiketler
        for cx, cy, label, val in points:
            r = 4
            self.canvas.create_oval(
                cx - r, cy - r, cx + r, cy + r,
                fill=primary_color,
                outline=cols.get("bg_card", "#ffffff"),
                width=2,
            )
            if val > 0:
                val_text = f"{val:.0f}" if isinstance(val, int) or val.is_integer() else f"{val:.1f}"
                self.canvas.create_text(
                    cx, cy - 10,
                    text=val_text,
                    fill=text_primary,
                    font=(theme.FONT_FAMILY, 8, "bold"),
                )

            short_lbl = label[-5:] if len(label) >= 10 else label
            self.canvas.create_text(
                cx, pad_top + plot_h + 14,
                text=short_lbl,
                fill=text_muted,
                font=(theme.FONT_FAMILY, 8),
            )

        # Taban çizgisi
        self.canvas.create_line(
            pad_left, pad_top + plot_h, w - pad_right, pad_top + plot_h,
            fill=cols.get("border", "#cbd5e1"),
            width=2,
        )
