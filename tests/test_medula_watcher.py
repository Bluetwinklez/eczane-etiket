import time
import urllib.request
import urllib.parse
import json
from eczane_etiket import medula_watcher


def test_is_medula_prescription_text():
    # Medula formatı 1: Başlıklar ve reçete no
    t1 = """
    T.C. Kimlik No: 12345678901
    Hasta Adı: Mehmet Kaya
    E-Reçete No: 4A1B2C
    PAROL 500 MG 20 TB 3x1 Tok
    """
    assert medula_watcher.is_medula_prescription_text(t1) is True

    # Medula formatı 2: Çoklu ilaç ve doz kalıpları
    t2 = """
    AUGMENTIN BID 1000MG 14 TB 2x1 tok
    PAROL 500MG 20 TABLET 3x1
    """
    assert medula_watcher.is_medula_prescription_text(t2) is True

    # Normal metin (reçete değil)
    t3 = "Sayın veli, yarın saat 10:00'da okulumuzda toplantı yapılacaktır. Katılımınızı rica ederiz."
    assert medula_watcher.is_medula_prescription_text(t3) is False

    # Çok kısa metin
    assert medula_watcher.is_medula_prescription_text("kısa") is False


def test_bookmarklet_and_userscript_generators():
    bm = medula_watcher.get_bookmarklet_code(18888)
    assert "javascript:" in bm
    assert "18888/medula" in bm

    us = medula_watcher.get_userscript_code(18888)
    assert "// ==UserScript==" in us
    assert "medula.sgk.gov.tr" in us
    assert "18888/medula" in us


def test_medula_server_lifecycle_and_post():
    received_texts = []

    def on_rx(txt):
        received_texts.append(txt)

    # Test için serbest bir port deneyelim
    server = medula_watcher.MedulaServer(port=18895, on_prescription_received=on_rx)
    started = server.start()
    assert started is True
    assert server.is_running is True

    try:
        url = f"http://127.0.0.1:{server.port}/medula"
        test_payload = "Hasta: Zeynep Çelik\nPAROL 500MG 20 TABLET 3x1"
        req = urllib.request.Request(
            url,
            data=test_payload.encode("utf-8"),
            headers={"Content-Type": "text/plain; charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["status"] == "OK"

        # Gelen veriyi kontrol et
        time.sleep(0.1)
        assert len(received_texts) == 1
        assert "PAROL" in received_texts[0]
        assert "Zeynep Çelik" in received_texts[0]

        # GET /status kontrolü
        get_url = f"http://127.0.0.1:{server.port}/status"
        with urllib.request.urlopen(get_url, timeout=3) as resp:
            assert resp.status == 200
            st_data = json.loads(resp.read().decode("utf-8"))
            assert st_data["status"] == "ONLINE"

    finally:
        server.stop()
        assert server.is_running is False
