"""Yerel veri klasörü ve dosya yolları."""

from pathlib import Path

DATA_DIR = Path.home() / ".eczane_etiket"

PROFILES_FILE = DATA_DIR / "profiles.json"
DRUGS_FILE = DATA_DIR / "drugs.json"
TEMPLATES_FILE = DATA_DIR / "templates.json"
HISTORY_FILE = DATA_DIR / "history.json"
STOCK_FILE = DATA_DIR / "stock.json"
API_CONFIG_FILE = DATA_DIR / "api_config.json"
STAFF_FILE = DATA_DIR / "staff.json"


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR
