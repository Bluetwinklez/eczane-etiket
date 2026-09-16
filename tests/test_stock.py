import datetime as dt

from eczane_etiket import stock


def _iso(days_from_today: int) -> str:
    return (dt.date.today() + dt.timedelta(days=days_from_today)).strftime("%Y-%m-%d")


def test_add_update_delete_item(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")

    item = stock.add_item("Parol 500mg", 10, _iso(200), "raf 3")
    assert item["name"] == "Parol 500mg"
    assert len(stock.load_stock()) == 1

    updated = stock.update_item(item["id"], quantity=5)
    assert updated["quantity"] == 5

    stock.delete_item(item["id"])
    assert stock.load_stock() == []


def test_get_expiring_items_buckets(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")

    stock.add_item("Süresi Geçmiş", 1, _iso(-5))
    stock.add_item("Yaklaşan", 1, _iso(30))
    stock.add_item("Güvenli", 1, _iso(400))
    stock.add_item("Tarihsiz", 1, "")

    buckets = stock.get_expiring_items(days_threshold=90)
    assert [i["name"] for i in buckets["expired"]] == ["Süresi Geçmiş"]
    assert [i["name"] for i in buckets["expiring_soon"]] == ["Yaklaşan"]
    names_ok = [i["name"] for i in buckets["ok"]]
    assert "Güvenli" in names_ok
    assert "Tarihsiz" in names_ok  # tarih ayrıştırılamıyorsa güvenli varsayılır


def test_get_expiring_items_accepts_different_date_formats(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")
    expiry = dt.date.today() - dt.timedelta(days=1)
    stock.add_item("Nokta Formatlı", 1, expiry.strftime("%d.%m.%Y"))
    stock.add_item("Slash Formatlı", 1, expiry.strftime("%d/%m/%Y"))

    buckets = stock.get_expiring_items()
    expired_names = {i["name"] for i in buckets["expired"]}
    assert expired_names == {"Nokta Formatlı", "Slash Formatlı"}


def test_import_stock_csv(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")
    csv_path = tmp_path / "stok.csv"
    csv_path.write_text(
        "name,quantity,expiry_date,note\n"
        "Parol 500mg,20,2027-01-01,raf 1\n"
        "Majezik 100mg,5,2026-06-01,\n",
        encoding="utf-8",
    )

    imported = stock.import_stock_csv(str(csv_path))
    assert len(imported) == 2
    assert imported[0]["quantity"] == 20
    assert len(stock.load_stock()) == 2


def test_get_low_stock_items_only_flags_items_with_threshold(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")

    stock.add_item("Eşik Altı", 2, _iso(200), min_quantity=5)
    stock.add_item("Eşiğe Eşit", 5, _iso(200), min_quantity=5)
    stock.add_item("Eşik Üstü", 10, _iso(200), min_quantity=5)
    stock.add_item("Eşiksiz", 0, _iso(200))  # min_quantity=0 -> hiç uyarılmaz

    low = stock.get_low_stock_items()
    names = {i["name"] for i in low}
    assert names == {"Eşik Altı", "Eşiğe Eşit"}


def test_import_stock_csv_parses_min_quantity(tmp_path, monkeypatch):
    monkeypatch.setattr(stock, "STOCK_FILE", tmp_path / "stock.json")
    csv_path = tmp_path / "stok.csv"
    csv_path.write_text(
        "name,quantity,expiry_date,note,min_quantity\n"
        "Parol 500mg,2,2027-01-01,raf 1,5\n",
        encoding="utf-8",
    )
    imported = stock.import_stock_csv(str(csv_path))
    assert imported[0]["min_quantity"] == 5
    assert stock.get_low_stock_items(imported) == imported
