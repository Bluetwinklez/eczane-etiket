import os
import sys
import time

import pytest

def _configure_tcl_tk():
    """Ensure TCL_LIBRARY and TK_LIBRARY are robustly configured across local and CI environments."""
    tcl_env = os.environ.get("TCL_LIBRARY")
    if tcl_env and os.path.isfile(os.path.join(tcl_env, "init.tcl")):
        return

    search_roots = [
        os.environ.get("pythonLocation", ""),
        sys.base_prefix,
        getattr(sys, "real_prefix", ""),
        os.path.dirname(sys.executable),
    ]

    for root in search_roots:
        if not root or not os.path.isdir(root):
            continue

        # 1. Standard python layout
        cand_tcl = os.path.join(root, "tcl", "tcl8.6")
        cand_tk = os.path.join(root, "tcl", "tk8.6")
        if os.path.isfile(os.path.join(cand_tcl, "init.tcl")):
            os.environ["TCL_LIBRARY"] = cand_tcl
            if os.path.isdir(cand_tk):
                os.environ["TK_LIBRARY"] = cand_tk
            return

        # 2. Recursive search in hostedtoolcache / custom installations
        for dirpath, _, filenames in os.walk(root):
            if "init.tcl" in filenames and "TCL_LIBRARY" not in os.environ:
                os.environ["TCL_LIBRARY"] = dirpath
            if ("tk.tcl" in filenames or "pkgIndex.tcl" in filenames) and "tk" in os.path.basename(dirpath).lower() and "TK_LIBRARY" not in os.environ:
                os.environ["TK_LIBRARY"] = dirpath
            if "TCL_LIBRARY" in os.environ and "TK_LIBRARY" in os.environ:
                return

_configure_tcl_tk()


# Windows CI runner'larında aynı süreçte Tk ikinci kez oluşturulurken Tcl, var olan
# init.tcl dosyasını ara sıra okuyamıyor ("couldn't read file ...: No error").
# Hata geçici: hemen ardından yapılan deneme başarılı oluyor. Bu yüzden yalnızca
# bu hata için kısa beklemeyle yeniden denenir; diğer TclError'lar aynen yükselir.
TK_DENEME_SAYISI = 5
TK_BEKLEME_SN = 0.5


def tk_gecici_hata_mi(exc):
    return "init.tcl" in str(exc)


def app_olustur(app_sinifi=None, deneme=TK_DENEME_SAYISI, bekleme=TK_BEKLEME_SN):
    import tkinter as tk

    if app_sinifi is None:
        from eczane_etiket.main import App as app_sinifi

    for i in range(deneme):
        try:
            return app_sinifi()
        except tk.TclError as exc:
            if not tk_gecici_hata_mi(exc) or i == deneme - 1:
                raise
            time.sleep(bekleme)


@pytest.fixture(scope="session")
def app_olusturucu():
    """Testlerin App örneğini geçici Tcl hatalarına karşı dayanıklı oluşturması için."""
    return app_olustur
