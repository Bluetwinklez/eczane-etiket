"""Portable storage must not touch an unrelated user's default profile."""
import runpy
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "eczane_etiket" / "paths.py"


def test_explicit_data_directory_keeps_all_records_together(monkeypatch, tmp_path):
    chosen = tmp_path / "portable profile"
    monkeypatch.setenv("ECZANE_ETIKET_DATA_DIR", str(chosen))
    paths = runpy.run_path(str(MODULE))
    assert paths["DATA_DIR"] == chosen
    for key, value in paths.items():
        if key.endswith("_FILE"):
            assert value.parent == chosen
    assert not chosen.exists()
    assert paths["ensure_data_dir"]() == chosen
    assert chosen.is_dir()


def test_unset_override_preserves_default_profile(monkeypatch, tmp_path):
    monkeypatch.delenv("ECZANE_ETIKET_DATA_DIR", raising=False)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    paths = runpy.run_path(str(MODULE))
    assert paths["DATA_DIR"] == tmp_path / ".eczane_etiket"
    assert not paths["DATA_DIR"].exists()
