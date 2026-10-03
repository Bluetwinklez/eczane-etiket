"""Modern Bildirim / Toast mesajı bileşeni (Tkinter).

İşlem başarılı, hata, uyarı ve bilgilendirme durumlarında ekranın
sağ üst köşesinde zarif bir animasyonla belirir, otomatik kaybolur
veya tıklandığında anında kapanır.
"""

import tkinter as tk
from tkinter import ttk
from typing import Optional

from . import theme

_ACTIVE_TOASTS = []


class ToastNotification:
    LEVELS = {
        "success": {
            "icon": "✓",
            "bg": "#ecfdf5",
            "fg": "#065f46",
            "border": "#10b981",
            "dark_bg": "#064e3b",
            "dark_fg": "#ecfdf5",
            "dark_border": "#34d399",
            "title": "Başarılı",
        },
        "error": {
            "icon": "✕",
            "bg": "#fef2f2",
            "fg": "#991b1b",
            "border": "#ef4444",
            "dark_bg": "#7f1d1d",
            "dark_fg": "#fef2f2",
            "dark_border": "#f87171",
            "title": "Hata",
        },
        "warning": {
            "icon": "⚠️",
            "bg": "#fffbeb",
            "fg": "#92400e",
            "border": "#f59e0b",
            "dark_bg": "#78350f",
            "dark_fg": "#fffbeb",
            "dark_border": "#fbbf24",
            "title": "Uyarı",
        },
        "info": {
            "icon": "ℹ",
            "bg": "#eff6ff",
            "fg": "#1e40af",
            "border": "#3b82f6",
            "dark_bg": "#1e3a8a",
            "dark_fg": "#eff6ff",
            "dark_border": "#60a5fa",
            "title": "Bilgi",
        },
    }

    def __init__(
        self,
        master: tk.Misc,
        message: str,
        level: str = "success",
        title: Optional[str] = None,
        duration_ms: int = 3200,
    ):
        self.master = master
        self.level = level if level in self.LEVELS else "info"
        self.cfg = self.LEVELS[self.level]
        self.duration_ms = duration_ms
        self.message = message
        self.title = title or self.cfg["title"]
        self.top: Optional[tk.Toplevel] = None
        self._after_id = None
        self._is_destroyed = False

        self._create_window()

    def _is_dark_mode(self) -> bool:
        try:
            colors = getattr(self.master, "theme_colors", {})
            bg_app = colors.get("bg_app", "")
            return bg_app in ("#0b1329", "#152238", "#1e293b", "#0f172a")
        except Exception:
            return False

    def _create_window(self):
        try:
            self.top = tk.Toplevel(self.master)
            self.top.overrideredirect(True)
            self.top.attributes("-topmost", True)
        except Exception:
            return

        dark = self._is_dark_mode()
        bg_color = self.cfg["dark_bg"] if dark else self.cfg["bg"]
        fg_color = self.cfg["dark_fg"] if dark else self.cfg["fg"]
        border_color = self.cfg["dark_border"] if dark else self.cfg["border"]

        # Dış kenarlık çerçevesi
        outer = tk.Frame(self.top, bg=border_color, padx=1, pady=1)
        outer.pack(fill="both", expand=True)

        inner = tk.Frame(outer, bg=bg_color, padx=12, pady=8)
        inner.pack(fill="both", expand=True)

        # İkon
        icon_lbl = tk.Label(
            inner,
            text=self.cfg["icon"],
            font=(theme.FONT_FAMILY, 14, "bold"),
            bg=bg_color,
            fg=border_color,
        )
        icon_lbl.pack(side="left", padx=(0, 8), anchor="center")

        # Metin alanı
        text_box = tk.Frame(inner, bg=bg_color)
        text_box.pack(side="left", fill="both", expand=True)

        title_lbl = tk.Label(
            text_box,
            text=self.title,
            font=(theme.FONT_FAMILY, 9, "bold"),
            bg=bg_color,
            fg=fg_color,
            anchor="w",
        )
        title_lbl.pack(fill="x")

        msg_lbl = tk.Label(
            text_box,
            text=self.message,
            font=(theme.FONT_FAMILY, 9),
            bg=bg_color,
            fg=fg_color,
            anchor="w",
            wraplength=280,
            justify="left",
        )
        msg_lbl.pack(fill="x")

        # Kapat Butonu
        close_lbl = tk.Label(
            inner,
            text="✕",
            font=(theme.FONT_FAMILY, 9),
            bg=bg_color,
            fg=fg_color,
            cursor="hand2",
        )
        close_lbl.pack(side="right", padx=(8, 0), anchor="ne")
        close_lbl.bind("<Button-1>", lambda e: self.destroy())

        # Tıklamayla kapatma
        for w in (outer, inner, icon_lbl, text_box, title_lbl, msg_lbl):
            w.bind("<Button-1>", lambda e: self.destroy())

        self.top.update_idletasks()
        self._position_toast()

        _ACTIVE_TOASTS.append(self)

        if self.duration_ms > 0:
            self._after_id = self.top.after(self.duration_ms, self.destroy)

    def _position_toast(self):
        try:
            # Ana pencereye göre hizala
            if hasattr(self.master, "winfo_rootx") and self.master.winfo_viewable():
                mx = self.master.winfo_rootx()
                my = self.master.winfo_rooty()
                mw = self.master.winfo_width()
            else:
                mx = 0
                my = 0
                mw = self.top.winfo_screenwidth()

            # Yüksekliği ve sıradaki offset'i hesapla
            toast_w = max(self.top.winfo_reqwidth(), 260)
            toast_h = max(self.top.winfo_reqheight(), 46)

            idx = len(_ACTIVE_TOASTS)
            x = mx + mw - toast_w - 20
            y = my + 30 + (idx * (toast_h + 8))

            self.top.geometry(f"{toast_w}x{toast_h}+{x}+{y}")
        except Exception:
            pass

    def destroy(self):
        if self._is_destroyed:
            return
        self._is_destroyed = True

        if self in _ACTIVE_TOASTS:
            _ACTIVE_TOASTS.remove(self)

        if self.top:
            try:
                if self._after_id:
                    self.top.after_cancel(self._after_id)
                self.top.destroy()
            except Exception:
                pass
            self.top = None


def show_toast(
    master: tk.Misc,
    message: str,
    level: str = "success",
    title: Optional[str] = None,
    duration_ms: int = 3200,
) -> ToastNotification:
    """Tek satırda toast bildirim gösterme yardımcısı."""
    return ToastNotification(
        master=master,
        message=message,
        level=level,
        title=title,
        duration_ms=duration_ms,
    )
