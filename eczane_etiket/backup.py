"""Tüm yerel verilerin (.zip) yedeklenmesi ve geri yüklenmesi."""

import zipfile
from pathlib import Path

from .paths import (
    API_CONFIG_FILE,
    DRUGS_FILE,
    HISTORY_FILE,
    PROFILES_FILE,
    STAFF_FILE,
    STOCK_FILE,
    TEMPLATES_FILE,
    ensure_data_dir,
)

BACKUP_FILES = [
    PROFILES_FILE,
    DRUGS_FILE,
    TEMPLATES_FILE,
    HISTORY_FILE,
    STOCK_FILE,
    API_CONFIG_FILE,
    STAFF_FILE,
]


def create_backup(zip_path: str) -> str:
    ensure_data_dir()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in BACKUP_FILES:
            if file_path.exists():
                zf.write(file_path, arcname=file_path.name)
    return zip_path


def restore_backup(zip_path: str) -> list:
    """Yedekteki dosyaları geri yükler. Geri yüklenen dosya adlarının listesini döner."""
    data_dir = ensure_data_dir()
    restored = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        allowed_names = {f.name for f in BACKUP_FILES}
        for member in zf.namelist():
            if member in allowed_names:
                zf.extract(member, path=data_dir)
                restored.append(member)
    return restored
