import os
import sys

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
