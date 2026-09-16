"""Stok / SKT (son kullanma tarihi) takip modülü.

Gerçek zamanlı bir stok/ERP sistemi değildir — eczacının kendi girdiği
(veya CSV'den içe aktardığı) basit bir ürün/SKT takip defteridir.
"""

import csv
import datetime as _dt
import uuid
from typing import Optional

from .jsonutil import read_json, write_json
from .paths import STOCK_FILE

DEFAULT_WARNING_DAYS = 90


def load_stock() -> list:
    return read_json(STOCK_FILE, [])


def save_stock(items: list) -> None:
    write_json(STOCK_FILE, items)


def add_item(name: str, quantity: int, expiry_date: str, note: str = "", min_quantity: int = 0) -> dict:
    items = load_stock()
    item = {
        "id": str(uuid.uuid4()),
        "name": name,
        "quantity": quantity,
        "expiry_date": expiry_date,  # "YYYY-MM-DD"
        "note": note,
        "min_quantity": min_quantity,  # 0 = düşük stok uyarısı yok
    }
    items.append(item)
    save_stock(items)
    return item


def update_item(item_id: str, **changes) -> Optional[dict]:
    items = load_stock()
    for item in items:
        if item["id"] == item_id:
            item.update(changes)
            save_stock(items)
            return item
    return None


def delete_item(item_id: str) -> None:
    items = [i for i in load_stock() if i["id"] != item_id]
    save_stock(items)


def _parse_date(value: str) -> Optional[_dt.date]:
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return _dt.datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def get_expiring_items(days_threshold: int = DEFAULT_WARNING_DAYS) -> dict:
    """SKT durumuna göre üç gruba ayrılmış ürünleri döner: expired, expiring_soon, ok."""
    today = _dt.date.today()
    result = {"expired": [], "expiring_soon": [], "ok": []}
    for item in load_stock():
        expiry = _parse_date(item.get("expiry_date", ""))
        if expiry is None:
            result["ok"].append(item)
            continue
        days_left = (expiry - today).days
        if days_left < 0:
            result["expired"].append(item)
        elif days_left <= days_threshold:
            result["expiring_soon"].append(item)
        else:
            result["ok"].append(item)
    return result


def get_low_stock_items(items: Optional[list] = None) -> list:
    """`min_quantity` alanı 0'dan büyük ayarlanmış ve mevcut miktarı bu eşiğin
    altında ya da eşit olan ürünleri döner. `min_quantity` girilmemiş (0)
    ürünler için düşük stok uyarısı üretilmez — eşik belirtilmediği sürece
    her ürünü "düşük" saymak yanlış alarmlara yol açar.
    """
    items = items if items is not None else load_stock()
    return [
        item
        for item in items
        if item.get("min_quantity", 0) > 0 and item.get("quantity", 0) <= item.get("min_quantity", 0)
    ]


def import_stock_csv(path: str, save: bool = True) -> list:
    """CSV'den stok içe aktarır. Beklenen sütunlar: name, quantity, expiry_date,
    note, min_quantity (hepsi Türkçe başlıklarla da desteklenir, hepsi opsiyonel
    name/quantity/expiry_date hariç)."""
    items = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or row.get("Ürün Adı") or "").strip()
            if not name:
                continue
            try:
                quantity = int(row.get("quantity") or row.get("Miktar") or 0)
            except ValueError:
                quantity = 0
            try:
                min_quantity = int(row.get("min_quantity") or row.get("Min Stok") or 0)
            except ValueError:
                min_quantity = 0
            expiry = (row.get("expiry_date") or row.get("SKT") or "").strip()
            note = (row.get("note") or row.get("Not") or "").strip()
            items.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "quantity": quantity,
                    "expiry_date": expiry,
                    "note": note,
                    "min_quantity": min_quantity,
                }
            )
    if save:
        existing = load_stock()
        save_stock(existing + items)
    return items
