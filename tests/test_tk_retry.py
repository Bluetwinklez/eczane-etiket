"""Windows CI'da ara sıra görülen geçici Tcl/Tk başlatma hataları yeniden denenir; diğer hatalar denenmez."""

import tkinter as tk

from tests.conftest import app_olustur, tk_gecici_hata_mi


def test_gecici_hata_mesajlari_taninir():
    for mesaj in ('invalid command name "tcl_findLibrary"', "couldn't read file init.tcl: No error", "tk wasn't installed properly"):
        assert tk_gecici_hata_mi(tk.TclError(mesaj)), mesaj
    assert not tk_gecici_hata_mi(tk.TclError("no display name and no $DISPLAY environment variable"))


def test_app_olustur_gecici_hatada_tekrar_dener():
    cagri = []

    class Sahte:
        def __init__(self):
            cagri.append(1)
            if len(cagri) < 3:
                raise tk.TclError('invalid command name "tcl_findLibrary"')

    assert isinstance(app_olustur(Sahte, deneme=5, bekleme=0), Sahte)
    assert len(cagri) == 3


def test_app_olustur_kalici_hatada_hemen_yukseltir():
    cagri = []

    class Bozuk:
        def __init__(self):
            cagri.append(1)
            raise tk.TclError("no display name and no $DISPLAY environment variable")

    try:
        app_olustur(Bozuk, deneme=5, bekleme=0)
    except tk.TclError:
        pass
    else:
        raise AssertionError("TclError yükselmeliydi")
    assert len(cagri) == 1
