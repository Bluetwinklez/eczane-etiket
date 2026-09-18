"""İstatistik, ciro ve dashboard özet panosu modülü.

`history.json` ve `stock.json` üzerinden:
- Günlük ve haftalık etiket sayısı,
- Tahmini günlük ciro ve ciro trendleri,
- En çok basılan ilaçlar ve personel aktiviteleri,
- Kritik stok ve SKT uyarı sayıları,
- Son işlemler listesi
hesaplanır ve Dashboard üzerinde görselleştirilir.
"""

import datetime as _dt
from collections import Counter
from typing import Optional

from .history import load_history
from .stock import get_expiring_items, get_low_stock_items, load_stock

DEFAULT_DAYS = 7
DEFAULT_ITEM_PRICE = 95.0  # Ortalama tahmini ilaç / işlem bedeli (₺)


def _get_record_price(record: dict) -> float:
    """Kaydın fiyatını veya varsayılan tahmini birim fiyatı döner."""
    if "price" in record:
        try:
            return float(record["price"])
        except (ValueError, TypeError):
            pass
    return DEFAULT_ITEM_PRICE


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


def turnover_by_day(days: int = DEFAULT_DAYS, records: Optional[list] = None) -> list:
    """Son `days` gün için (tarih, ciro_tutari_tl) çiftlerini eskiden yeniye döner."""
    records = records if records is not None else load_history()
    today = _dt.date.today()
    buckets = {(today - _dt.timedelta(days=i)).isoformat(): 0.0 for i in range(days)}
    for record in records:
        day = (record.get("timestamp") or "")[:10]
        if day in buckets:
            buckets[day] += _get_record_price(record)
    return [(day, round(buckets[day], 2)) for day in sorted(buckets)]


def daily_turnover(day: Optional[str] = None, records: Optional[list] = None) -> float:
    """Belirtilen gün (varsayılan: bugün) için toplam tahmini ciroyu döner."""
    records = records if records is not None else load_history()
    target_day = day or _dt.date.today().isoformat()
    total = 0.0
    for record in records:
        rec_day = (record.get("timestamp") or "")[:10]
        if rec_day == target_day:
            total += _get_record_price(record)
    return round(total, 2)


def today_label_count(records: Optional[list] = None) -> int:
    """Bugün basılan etiket sayısını döner."""
    records = records if records is not None else load_history()
    today_str = _dt.date.today().isoformat()
    return sum(1 for r in records if (r.get("timestamp") or "")[:10] == today_str)


def total_labels(records: Optional[list] = None) -> int:
    records = records if records is not None else load_history()
    return len(records)


def stock_alerts_summary() -> dict:
    """Kritik stok ve SKT uyarı sayılarını döner."""
    items = load_stock()
    exp = get_expiring_items()
    low = get_low_stock_items(items)
    return {
        "expired_count": len(exp.get("expired", [])),
        "expiring_soon_count": len(exp.get("expiring_soon", [])),
        "low_stock_count": len(low),
        "total_stock_items": len(items),
    }


def recent_transactions(limit: int = 15, records: Optional[list] = None) -> list:
    """Dashboard için son N işlemi zenginleştirilmiş alanlarla döner."""
    records = records if records is not None else load_history()
    result = []
    for r in records[:limit]:
        ts = r.get("timestamp") or ""
        time_part = ts[11:16] if len(ts) >= 16 else "--:--"
        date_part = ts[:10] if len(ts) >= 10 else ""
        price = _get_record_price(r)
        result.append({
            "id": r.get("id", ""),
            "timestamp": ts,
            "display_time": f"{date_part} {time_part}".strip(),
            "patient_name": r.get("patient_name") or "(Hasta Belirtilmemiş)",
            "drug_name": r.get("drug_name") or "-",
            "instructions": r.get("instructions") or "-",
            "staff_name": r.get("staff_name") or "-",
            "price": price,
            "status": "Tamamlandı",
        })
    return result


def summary(days: int = DEFAULT_DAYS) -> dict:
    records = load_history()
    return {
        "total": total_labels(records),
        "today_count": today_label_count(records),
        "today_turnover": daily_turnover(records=records),
        "turnover_by_day": turnover_by_day(days, records),
        "top_drugs": top_drugs(10, records),
        "top_staff": top_staff(10, records),
        "by_day": counts_by_day(days, records),
        "stock_alerts": stock_alerts_summary(),
        "recent_transactions": recent_transactions(15, records),
    }
