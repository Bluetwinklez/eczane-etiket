"""Basit istatistik/özet panosu.

Gerçek bir analitik/BI sistemi değildir — yalnızca `history.json` üzerinden
en çok basılan ilaçlar, en aktif personel ve son N günün etiket sayısı gibi
basit özetler çıkarır. Admin Panelindeki "İstatistikler" sekmesinde gösterilir.
"""

import datetime as _dt
from collections import Counter
from typing import Optional

from .history import load_history

DEFAULT_DAYS = 7


def top_drugs(limit: int = 10, records: Optional[list] = None) -> list:
    """En çok basılan ilaçları (ad, sayı) çiftleri halinde azalan sırada döner."""
    records = records if records is not None else load_history()
    counter = Counter(r.get("drug_name") for r in records if r.get("drug_name"))
    return counter.most_common(limit)


def top_staff(limit: int = 10, records: Optional[list] = None) -> list:
    """En çok etiket basan personeli (ad, sayı) çiftleri halinde azalan sırada döner."""
    records = records if records is not None else load_history()
    counter = Counter(r.get("staff_name") for r in records if r.get("staff_name"))
    return counter.most_common(limit)


def counts_by_day(days: int = DEFAULT_DAYS, records: Optional[list] = None) -> list:
    """Son `days` gün için (tarih, sayı) çiftlerini eskiden yeniye sıralı döner."""
    records = records if records is not None else load_history()
    today = _dt.date.today()
    buckets = {(today - _dt.timedelta(days=i)).isoformat(): 0 for i in range(days)}
    for record in records:
        day = (record.get("timestamp") or "")[:10]
        if day in buckets:
            buckets[day] += 1
    return [(day, buckets[day]) for day in sorted(buckets)]


def total_labels(records: Optional[list] = None) -> int:
    records = records if records is not None else load_history()
    return len(records)


def summary(days: int = DEFAULT_DAYS) -> dict:
    records = load_history()
    return {
        "total": total_labels(records),
        "top_drugs": top_drugs(10, records),
        "top_staff": top_staff(10, records),
        "by_day": counts_by_day(days, records),
    }
