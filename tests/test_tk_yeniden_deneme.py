import tkinter as tk

import pytest

from tests.conftest import app_olustur


class _SahteApp:
    def __init__(self, hatalar):
        self.hatalar = list(hatalar)
        self.cagri = 0

    def __call__(self):
        self.cagri += 1
        if self.hatalar:
            raise self.hatalar.pop(0)
        return "app"


def test_gecici_init_tcl_hatasinda_yeniden_dener():
    hata = tk.TclError("Can't find a usable init.tcl in the following directories: ...")
    sahte = _SahteApp([hata, hata])
    assert app_olustur(sahte, deneme=5, bekleme=0) == "app"
    assert sahte.cagri == 3


def test_tk_tcl_okunamama_hatasinda_da_yeniden_dener():
    hata = tk.TclError('couldn\'t read file "C:/x/tcl/tk8.6/icons.tcl": No error\nThis probably means that tk wasn\'t installed properly.')
    sahte = _SahteApp([hata])
    assert app_olustur(sahte, deneme=3, bekleme=0) == "app"
    assert sahte.cagri == 2


def test_baska_tcl_hatasi_hemen_yukselir():
    sahte = _SahteApp([tk.TclError("no display name and no $DISPLAY environment variable")])
    with pytest.raises(tk.TclError, match="DISPLAY"):
        app_olustur(sahte, deneme=5, bekleme=0)
    assert sahte.cagri == 1


def test_deneme_hakki_bitince_son_hata_yukselir():
    hata = tk.TclError("Can't find a usable init.tcl")
    sahte = _SahteApp([hata] * 3)
    with pytest.raises(tk.TclError, match="init.tcl"):
        app_olustur(sahte, deneme=3, bekleme=0)
    assert sahte.cagri == 3
