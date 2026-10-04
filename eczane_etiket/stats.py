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


def _parse_day(record: dict) -> str:
    return (record.get("timestamp") or "")[:10]


def _pct_change(now: float, before: float) -> Optional[float]:
    """Yüzde değişim; önceki dönem sıfırsa karşılaştırma anlamsız olduğundan None döner."""
    if not before:
        return None
    return round((now - before) / before * 100, 1)


def period_comparison(days: int = DEFAULT_DAYS, records: Optional[list] = None,
                      today: Optional[_dt.date] = None) -> dict:
    """Son `days` günü hemen öncesindeki `days` günle kıyaslar (etiket sayısı ve ciro)."""
    records = records if records is not None else load_history()
    today = today or _dt.date.today()
    current = {(today - _dt.timedelta(days=i)).isoformat() for i in range(days)}
    previous = {(today - _dt.timedelta(days=i)).isoformat() for i in range(days, days * 2)}
    count = prev_count = 0
    turnover = prev_turnover = 0.0
    for r in records:
        day = _parse_day(r)
        if day in current:
            count += 1
            turnover += _get_record_price(r)
        elif day in previous:
            prev_count += 1
            prev_turnover += _get_record_price(r)
    return {
        "days": days,
        "count": count,
        "prev_count": prev_count,
        "count_change_pct": _pct_change(count, prev_count),
        "turnover": round(turnover, 2),
        "prev_turnover": round(prev_turnover, 2),
        "turnover_change_pct": _pct_change(turnover, prev_turnover),
    }


def hourly_distribution(days: int = 30, records: Optional[list] = None,
                        today: Optional[_dt.date] = None) -> list:
    """Son `days` gün için saat saat (0-23) işlem sayısı."""
    records = records if records is not None else load_history()
    today = today or _dt.date.today()
    window = {(today - _dt.timedelta(days=i)).isoformat() for i in range(days)}
    hours = [0] * 24
    for r in records:
        ts = r.get("timestamp") or ""
        if ts[:10] in window and len(ts) >= 13 and ts[11:13].isdigit():
            hour = int(ts[11:13])
            if 0 <= hour <= 23:
                hours[hour] += 1
    return hours


def busiest_hour(days: int = 30, records: Optional[list] = None,
                 today: Optional[_dt.date] = None) -> Optional[dict]:
    """En yoğun saat ve toplam içindeki payı; hiç işlem yoksa None."""
    hours = hourly_distribution(days, records, today)
    total = sum(hours)
    if not total:
        return None
    peak = max(range(24), key=lambda h: (hours[h], -h))
    return {"hour": peak, "count": hours[peak], "share_pct": round(hours[peak] / total * 100, 1)}


def _fmt_pct(value: float) -> str:
    return f"%{abs(value):.0f}".replace(".0", "")


def build_insights(data: dict) -> list:
    """Özet verisinden okunabilir öngörü cümleleri üretir: [{"level": good|warn|info, "text": ...}].

    level: good = olumlu, warn = dikkat gerektirir, info = bilgi.
    """
    out = []
    alerts = data.get("stock_alerts") or {}
    expired = alerts.get("expired_count", 0)
    low = alerts.get("low_stock_count", 0)
    soon = alerts.get("expiring_soon_count", 0)
    if expired:
        out.append({"level": "warn", "text": f"{expired} kalemin son kullanma tarihi geçmiş: imha veya iade edin."})
    if low:
        out.append({"level": "warn", "text": f"{low} kalem kritik stok seviyesinde: sipariş vermeyi düşünün."})
    if soon:
        out.append({"level": "info", "text": f"{soon} kalemin SKT'si yaklaşıyor: önce bunları kullanın/satın."})

    cmp_ = data.get("comparison") or {}
    change = cmp_.get("turnover_change_pct")
    days = cmp_.get("days", DEFAULT_DAYS)
    if change is not None:
        if change >= 5:
            out.append({"level": "good", "text": f"Son {days} günün cirosu öncekine göre {_fmt_pct(change)} arttı."})
        elif change <= -5:
            out.append({"level": "warn", "text": f"Son {days} günün cirosu öncekine göre {_fmt_pct(change)} azaldı."})
        else:
            out.append({"level": "info", "text": f"Son {days} günün cirosu öncekiyle hemen hemen aynı."})
    elif cmp_.get("turnover", 0) > 0:
        out.append({"level": "info", "text": f"Son {days} günde {cmp_['turnover']:,.2f} ₺ ciro var; öncesi için kayıt bulunmuyor."})

    peak = data.get("busiest_hour")
    if peak:
        out.append({
            "level": "info",
            "text": f"En yoğun saat {peak['hour']:02d}:00–{(peak['hour'] + 1) % 24:02d}:00 (işlemlerin {_fmt_pct(peak['share_pct'])}'i). Bu saatte ek personel planlayın.",
        })

    yesterday = data.get("yesterday_turnover")
    today = data.get("today_turnover", 0.0)
    if yesterday and today and today >= yesterday:
        out.append({"level": "good", "text": "Bugünkü ciro dünün toplamını geçti."})

    if not out:
        out.append({"level": "good", "text": "Her şey yolunda görünüyor; bekleyen uyarı yok."})
    return out


def attention_items(limit: int = 8, items: Optional[list] = None, today: Optional[_dt.date] = None) -> list:
    """Dikkat gerektiren stok kalemleri: önce SKT'si geçmiş, sonra SKT'si yaklaşan, sonra düşük stok.

    Her öğe: {"kind": expired|expiring|low, "name", "detail", "quantity", "sort"}. En acil olan başta.
    """
    from .stock import DEFAULT_WARNING_DAYS, _parse_date

    items = items if items is not None else load_stock()
    today = today or _dt.date.today()
    found = []
    for item in items:
        name = item.get("name") or "-"
        qty = item.get("quantity", 0)
        expiry = _parse_date(item.get("expiry_date", ""))
        if expiry is not None:
            days_left = (expiry - today).days
            if days_left < 0:
                found.append({"kind": "expired", "name": name, "quantity": qty,
                              "detail": f"SKT {-days_left} gün önce geçti", "sort": (0, days_left)})
                continue
            if days_left <= DEFAULT_WARNING_DAYS:
                found.append({"kind": "expiring", "name": name, "quantity": qty,
                              "detail": "SKT bugün" if days_left == 0 else f"SKT'ye {days_left} gün kaldı", "sort": (1, days_left)})
                continue
        minimum = item.get("min_quantity", 0)
        if minimum > 0 and qty <= minimum:
            found.append({"kind": "low", "name": name, "quantity": qty,
                          "detail": f"Stok {qty} / alt sınır {minimum}", "sort": (2, qty - minimum)})
    found.sort(key=lambda f: (f["sort"], f["name"]))
    return found[:limit]


def summary(days: int = DEFAULT_DAYS) -> dict:
    records = load_history()
    today = _dt.date.today()
    data = {
        "total": total_labels(records),
        "today_count": today_label_count(records),
        "today_turnover": daily_turnover(records=records),
        "turnover_by_day": turnover_by_day(days, records),
        "top_drugs": top_drugs(10, records),
        "top_staff": top_staff(10, records),
        "by_day": counts_by_day(days, records),
        "stock_alerts": stock_alerts_summary(),
        "recent_transactions": recent_transactions(15, records),
        "comparison": period_comparison(days, records, today),
        "busiest_hour": busiest_hour(30, records, today),
        "yesterday_turnover": daily_turnover((today - _dt.timedelta(days=1)).isoformat(), records),
        "attention_items": attention_items(8, today=today),
    }
    data["insights"] = build_insights(data)
    return data
