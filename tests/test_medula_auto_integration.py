import unittest.mock as mock
import pytest
import tkinter as tk
from eczane_etiket.main import App
from eczane_etiket import medula_watcher


@pytest.fixture
def app():
    # Tkinter root başlat
    try:
        root = App()
    except tk.TclError:
        pytest.skip("Tkinter display not available")
    root.withdraw()
    yield root
    try:
        root._on_app_close()
    except Exception:
        pass


def test_handle_auto_medula_rx_loads_batch_and_prompts(app):
    raw_rx = """
    T.C. Kimlik No: 12345678901
    Hasta Adı: Fatma Şahin
    Tanı: Akut Tonsillit
    E-Reçete No: MED9988
    1- PAROL 500MG 20 TABLET - Günde 3x1 Tok
    2- AUGMENTIN BID 1000MG 14 TABLET - 2x1 Tok
    """

    # messagebox.askyesno mock'layarak kullanıcı onayını test edelim
    with mock.patch("tkinter.messagebox.askyesno", return_value=True) as mock_ask, \
         mock.patch.object(app, "_on_print") as mock_print:

        handled = app._handle_auto_medula_rx(raw_rx, source="Test Medula")
        assert handled is True
        assert app.patient_var.get() == "Fatma Şahin"
        assert app.purpose_var.get() == "Akut Tonsillit"
        assert app.batch_mode.get() is True
        assert len(app.batch_entries) == 2

        # Yazdırma sorusunun sorulduğunu ve onaylanınca yazdırıldığını doğrula
        assert mock_ask.called
        assert "Medula Reçetesi Yazdırılsın mı?" in mock_ask.call_args[0][0]
        assert mock_print.called


def test_handle_auto_medula_rx_declined_print(app):
    raw_rx = """
    Hasta Adı: Kemal Sunal
    1- PAROL 500MG 20 TABLET 3x1
    """
    with mock.patch("tkinter.messagebox.askyesno", return_value=False) as mock_ask, \
         mock.patch.object(app, "_on_print") as mock_print:

        handled = app._handle_auto_medula_rx(raw_rx, source="Test Medula")
        assert handled is True
        assert len(app.batch_entries) == 1
        assert mock_ask.called
        assert not mock_print.called


def test_poll_clipboard_for_medula_detects_rx(app):
    clip_text = """
    Hasta Adı: Ali Veli
    E-Reçete No: RECT001
    1- PAROL 500MG 20 TABLET - 3x1 Tok
    """
    app._last_medula_hash = "different_hash"

    with mock.patch.object(app, "clipboard_get", return_value=clip_text), \
         mock.patch.object(app, "_handle_auto_medula_rx") as mock_handle:

        # Tek bir döngü adımı çalıştır
        app.auto_medula_var.set(True)
        # after çağrısını engellemek için mock'layabiliriz
        with mock.patch.object(app, "after"):
            app._poll_clipboard_for_medula()

        assert mock_handle.called
        assert clip_text.strip() == mock_handle.call_args[0][0]


def test_open_medula_bridge_dialog(app):
    app._open_medula_bridge_dialog()
    # Açılan toplevel pencereleri bul
    children = [w for w in app.winfo_children() if isinstance(w, tk.Toplevel)]
    assert len(children) >= 1
    dlg = children[-1]
    assert "Medula" in dlg.title()
    dlg.destroy()
