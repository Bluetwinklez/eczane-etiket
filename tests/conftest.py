import os
import sys

# Ensure TCL_LIBRARY and TK_LIBRARY are robustly configured for Tkinter
tcl_dir = os.path.join(sys.base_prefix, "tcl", "tcl8.6")
tk_dir = os.path.join(sys.base_prefix, "tcl", "tk8.6")

if os.path.isdir(tcl_dir) and "TCL_LIBRARY" not in os.environ:
    os.environ["TCL_LIBRARY"] = tcl_dir
if os.path.isdir(tk_dir) and "TK_LIBRARY" not in os.environ:
    os.environ["TK_LIBRARY"] = tk_dir
