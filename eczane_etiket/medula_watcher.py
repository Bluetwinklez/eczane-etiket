"""Medula Otomatik Reçete Çekme ve Canlı Dinleyici Servisi (Medula Auto-Fetcher).

Bu modül eczacının Medula Eczane ekranındaki reçeteleri hiçbir zahmete girmeden
otomatik olarak etiket programına aktarmasını sağlar:

1. Akıllı Pano İzleyici (Clipboard Watcher):
   Medula'dan bir reçete seçilip kopyalandığında (Ctrl+C) veya tarayıcıda
   işlem yapıldığında metni otomatik tanır, sisteme yükler ve "Yazdırılsın mı?" diye sorar.

2. Yerel HTTP Dinleyici (Local Webhook - 127.0.0.1:18888):
   Tarayıcıdaki Medula ekranından tek tıkla reçeteyi doğrudan programa gönderen
   1-tık yer imi (bookmarklet) ve eklenti köprüsü sunar.
"""

import hashlib
import http.server
import json
import re
import socketserver
import threading
from typing import Callable, Optional

# Medula reçete belirteçleri
MEDULA_PATTERNS = [
    re.compile(r"e-?re[çc]ete\s*no", re.IGNORECASE),
    re.compile(r"re[çc]ete\s*no", re.IGNORECASE),
    re.compile(r"takip\s*no", re.IGNORECASE),
    re.compile(r"provizyon\s*no", re.IGNORECASE),
    re.compile(r"hasta\s*ad[ıi]", re.IGNORECASE),
    re.compile(r"t\.?c\.?\s*kimlik", re.IGNORECASE),
    re.compile(r"teslim\s*alan", re.IGNORECASE),
    re.compile(r"ila[çc]\s*ad[ıi]", re.IGNORECASE),
    re.compile(r"kullan[ıi]m\s*periyodu", re.IGNORECASE),
    re.compile(r"doktor\s*ad[ıi]", re.IGNORECASE),
]

_DOSAGE_LINE_RE = re.compile(r"\b\d+\s*[xX\*]\s*\d+\b")


def is_medula_prescription_text(text: str) -> bool:
    """Verilen metnin Medula reçetesi veya çoklu ilaç dökümü olup olmadığını belirler."""
    if not text or len(text.strip()) < 15:
        return False

    t_lower = text.lower()

    # 1. Doğrudan Medula anahtar kelime eşleşmesi
    matches = sum(1 for p in MEDULA_PATTERNS if p.search(t_lower))
    if matches >= 2:
        return True

    # 2. İlaç + doz kalıpları içeren çoklu satır reçete (örn: "PAROL ... 3x1")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    dose_lines = sum(1 for line in lines if _DOSAGE_LINE_RE.search(line))

    if matches >= 1 and dose_lines >= 1:
        return True

    pharma_words = (
        "tablet", "tb", "şurup", "surup", "kapsül", "kapsul", "mg", "günde",
        "gunde", "damla", "merhem", "krem", "flakon", "kutu", "poset", "saşe"
    )
    if dose_lines >= 1 and any(w in t_lower for w in pharma_words):
        return True

    return False


def get_userscript_code(port: int = 18888) -> str:
    """Tampermonkey / Violentmonkey için otomatik Medula Reçete Aktarıcı betiği."""
    return f"""// ==UserScript==
// @name         Medula Otomatik Reçete Aktarıcı
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Medula reçetelerini tek tıkla veya otomatik olarak Eczane İlaç Etiketi Programına aktarır.
// @author       Eczane Etiket
// @match        https://medula.sgk.gov.tr/*
// @match        http://medula.sgk.gov.tr/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {{
    'use strict';

    function sendPrescription() {{
        const text = document.body ? document.body.innerText : '';
        if (!text || text.length < 20) {{
            alert("Sayfa içeriği okunamadı.");
            return;
        }}
        GM_xmlhttpRequest({{
            method: "POST",
            url: "http://127.0.0.1:{port}/medula",
            headers: {{ "Content-Type": "text/plain; charset=utf-8" }},
            data: text,
            onload: function(response) {{
                try {{
                    const data = JSON.parse(response.responseText);
                    alert("✓ " + data.message);
                }} catch(e) {{
                    alert("✓ Reçete Eczane Etiket Programına aktarıldı!");
                }}
            }},
            onerror: function(err) {{
                alert("⚠️ Eczane Etiket Programına ulaşılamadı. Lütfen programın açık olduğundan emin olun.");
            }}
        }});
    }}

    // Sayfaya şık, yüzen bir "Etiket Yazdır" butonu ekle
    const btn = document.createElement("button");
    btn.innerHTML = "🏷️ <b>Etiket Yazdır</b>";
    btn.style.position = "fixed";
    btn.style.bottom = "20px";
    btn.style.right = "20px";
    btn.style.zIndex = "999999";
    btn.style.padding = "12px 20px";
    btn.style.backgroundColor = "#2563eb";
    btn.style.color = "#ffffff";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "bold";
    btn.onclick = sendPrescription;
    document.body.appendChild(btn);
}})();
"""


def get_bookmarklet_code(port: int = 18888) -> str:
    """Medula web sayfasından tek tıkla reçeteyi bu programa aktaran Bookmarklet kodu."""
    return (
        f"javascript:(function(){{"
        f"const text = document.body ? document.body.innerText : '';"
        f"if (!text) {{ alert('Sayfa içeriği okunamadı.'); return; }}"
        f"fetch('http://127.0.0.1:{port}/medula', {{"
        f"  method: 'POST',"
        f"  headers: {{'Content-Type': 'text/plain; charset=utf-8'}},"
        f"  body: text"
        f"}})"
        f".then(res => res.json())"
        f".then(data => alert('✓ ' + data.message))"
        f".catch(err => alert('⚠️ Eczane Etiket Programına ulaşılamadı. Programın açık olduğundan emin olun.'));"
        f"}})();"
    )


class _MedulaHTTPHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Arka planda terminali meşgul etmemek için sessiz çalış
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/status"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = {"status": "ONLINE", "app": "Eczane İlaç Etiketi - Medula Servisi"}
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length).decode("utf-8", errors="ignore")

        # Gelen veri JSON ise içindeki metni veya ham metni al
        raw_text = post_data
        try:
            parsed_json = json.loads(post_data)
            if isinstance(parsed_json, dict):
                raw_text = parsed_json.get("text") or parsed_json.get("body") or post_data
        except Exception:
            pass

        callback = getattr(self.server, "rx_callback", None)
        if callback and raw_text.strip():
            callback(raw_text.strip())

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        response = {"status": "OK", "message": "Reçete Eczane Etiket programına aktarıldı."}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))


class MedulaServer:
    """Arka planda Medula web isteklerini dinleyen hafif HTTP sunucusu."""

    def __init__(self, port: int = 18888, on_prescription_received: Optional[Callable[[str], None]] = None):
        self.port = port
        self.on_prescription_received = on_prescription_received
        self.server: Optional[socketserver.TCPServer] = None
        self.thread: Optional[threading.Thread] = None
        self.is_running = False

    def start(self) -> bool:
        if self.is_running:
            return True

        for p in (self.port, self.port + 1, self.port + 2):
            try:
                srv = socketserver.TCPServer(("127.0.0.1", p), _MedulaHTTPHandler)
                srv.rx_callback = self.on_prescription_received
                self.server = srv
                self.port = p
                break
            except OSError:
                continue

        if not self.server:
            return False

        self.is_running = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return True

    def stop(self):
        if self.server:
            try:
                self.server.shutdown()
                self.server.server_close()
            except Exception:
                pass
        self.is_running = False
