"""Etiket geçmişi kaydı, hasta bazlı arama/gruplama ve CSV dışa aktarım."""

import csv
import datetime as _dt
from typing import Optional

from .jsonutil import read_json, write_json
from .paths import HISTORY_FILE


def log_label(entry: dict) -> None:
    """Basılan bir etiketi geçmişe ekler.

    entry: {patient_name, drug_name, kullanim_amaci_tani, instructions, staff_name}
    Tarih/saat otomatik eklenir.
    """
    history = read_json(HISTORY_FILE, [])
    record = dict(entry)
    record["timestamp"] = _dt.datetime.now().isoformat(timespec="seconds")
    history.append(record)
    write_json(HISTORY_FILE, history)


def load_history(date_from: Optional[str] = None, date_to: Optional[str] = None) -> list:
    history = read_json(HISTORY_FILE, [])
    if not date_from and not date_to:
        return list(reversed(history))

    def in_range(record: dict) -> bool:
        ts = record.get("timestamp", "")
        if date_from and ts < date_from:
            return False
        if date_to and ts > date_to:
            return False
        return True

    return list(reversed([r for r in history if in_range(r)]))


def search_by_patient(patient_name: str) -> list:
    """Hasta adına göre (alt dize, büyük/küçük harf duyarsız) geçmiş arar."""
    query = patient_name.strip().casefold()
    if not query:
        return []
    history = read_json(HISTORY_FILE, [])
    matches = [r for r in history if query in (r.get("patient_name") or "").casefold()]
    return list(reversed(matches))


def group_by_patient() -> dict:
    history = read_json(HISTORY_FILE, [])
    grouped: dict = {}
    for record in history:
        patient = record.get("patient_name") or "(Hasta adı girilmemiş)"
        grouped.setdefault(patient, []).append(record)
    return grouped


def export_history_csv(path: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> str:
    records = load_history(date_from, date_to)
    fieldnames = [
        "timestamp",
        "patient_name",
        "drug_name",
        "package_info",
        "kullanim_amaci_tani",
        "instructions",
        "patient_note",
        "end_date",
        "refill_date",
        "staff_name",
    ]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(record)
    return path
