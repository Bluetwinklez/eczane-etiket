"""Masaüstü göstergesi için saf istatistik mantığı (tkinter gerektirmez)."""

import datetime as dt

from eczane_etiket import stats

BUGUN = dt.date(2026, 10, 14)  # sabit tarih: test zamandan bağımsız


def kayit(gun_farki, saat, fiyat, ilac="PAROL"):
    gun = BUGUN - dt.timedelta(days=gun_farki)
    return {"timestamp": f"{gun.isoformat()}T{saat:02d}:15:00", "drug_name": ilac, "price": fiyat}


def test_period_comparison_son_7_gun_ve_oncesi():
    records = [kayit(0, 10, 100), kayit(3, 11, 100), kayit(6, 12, 100)] + [kayit(7, 9, 50), kayit(10, 9, 50), kayit(13, 9, 50), kayit(14, 9, 999)]
    c = stats.period_comparison(7, records, BUGUN)
    assert (c["count"], c["prev_count"]) == (3, 3)
    assert c["turnover"] == 300.0 and c["prev_turnover"] == 150.0
    assert c["turnover_change_pct"] == 100.0
    assert c["count_change_pct"] == 0.0  # 14. gün (kayit(14)) kapsam dışı


def test_period_comparison_onceki_donem_bossa_yuzde_yok():
    c = stats.period_comparison(7, [kayit(1, 10, 80)], BUGUN)
    assert c["turnover_change_pct"] is None and c["count_change_pct"] is None


def test_busiest_hour_en_yogun_saat_ve_payi():
    records = [kayit(1, 14, 10), kayit(2, 14, 10), kayit(3, 14, 10), kayit(4, 9, 10)]
    peak = stats.busiest_hour(30, records, BUGUN)
    assert peak == {"hour": 14, "count": 3, "share_pct": 75.0}
    assert stats.hourly_distribution(30, records, BUGUN)[9] == 1
    # pencere dışındaki kayıtlar sayılmaz
    assert stats.busiest_hour(30, [kayit(90, 8, 10)], BUGUN) is None
    assert stats.busiest_hour(30, [], BUGUN) is None


def test_busiest_hour_esitlikte_erken_saat():
    records = [kayit(1, 16, 10), kayit(1, 11, 10)]
    assert stats.busiest_hour(30, records, BUGUN)["hour"] == 11


def test_build_insights_uyari_ve_olumlu_durumlar():
    veri = {
        "stock_alerts": {"expired_count": 2, "low_stock_count": 3, "expiring_soon_count": 1},
        "comparison": {"days": 7, "turnover": 300.0, "turnover_change_pct": 100.0},
        "busiest_hour": {"hour": 14, "count": 3, "share_pct": 75.0},
        "yesterday_turnover": 100.0,
        "today_turnover": 120.0,
    }
    ins = stats.build_insights(veri)
    metin = " | ".join(i["text"] for i in ins)
    assert "2 kalemin son kullanma tarihi geçmiş" in metin
    assert "3 kalem kritik stok" in metin
    assert "1 kalemin SKT'si yaklaşıyor" in metin
    assert "cirosu öncekine göre %100 arttı" in metin
    assert "14:00–15:00" in metin and "%75" in metin
    assert "Bugünkü ciro dünün toplamını geçti" in metin
    seviyeler = {i["level"] for i in ins}
    assert {"warn", "good", "info"} <= seviyeler


def test_build_insights_azalis_ve_bos_veri():
    ins = stats.build_insights({"comparison": {"days": 7, "turnover": 50.0, "turnover_change_pct": -40.0}})
    assert ins[0]["level"] == "warn" and "%40 azaldı" in ins[0]["text"]
    bos = stats.build_insights({})
    assert bos == [{"level": "good", "text": "Her şey yolunda görünüyor; bekleyen uyarı yok."}]


def test_summary_yeni_alanlari_icerir(monkeypatch):
    bugun = dt.date.today()
    records = [
        {"timestamp": f"{bugun.isoformat()}T10:00:00", "drug_name": "PAROL", "price": 100.0},
        {"timestamp": f"{(bugun - dt.timedelta(days=1)).isoformat()}T10:00:00", "drug_name": "PAROL", "price": 80.0},
    ]
    monkeypatch.setattr(stats, "load_history", lambda: records)
    s = stats.summary(7)
    assert s["comparison"]["count"] == 2
    assert s["yesterday_turnover"] == 80.0
    assert s["busiest_hour"]["hour"] == 10
    assert isinstance(s["insights"], list) and s["insights"]


def test_attention_items_siralama_ve_ayrintilar():
    items = [
        {"name": "Parol", "quantity": 2, "min_quantity": 5, "expiry_date": "2030-01-01"},
        {"name": "Aspirin", "quantity": 10, "expiry_date": (BUGUN - dt.timedelta(days=3)).isoformat()},
        {"name": "Majezik", "quantity": 7, "expiry_date": (BUGUN + dt.timedelta(days=10)).isoformat()},
        {"name": "Sağlam", "quantity": 50, "min_quantity": 5, "expiry_date": "2031-01-01"},
        {"name": "Bugün", "quantity": 1, "expiry_date": BUGUN.isoformat()},
    ]
    r = stats.attention_items(10, items, BUGUN)
    assert [x["kind"] for x in r] == ["expired", "expiring", "expiring", "low"]
    assert r[0]["name"] == "Aspirin" and r[0]["detail"] == "SKT 3 gün önce geçti"
    assert r[1]["name"] == "Bugün" and r[1]["detail"] == "SKT bugün"
    assert r[2]["detail"] == "SKT'ye 10 gün kaldı"
    assert r[3]["detail"] == "Stok 2 / alt sınır 5"
    assert stats.attention_items(2, items, BUGUN)[1]["name"] == "Bugün"
    assert stats.attention_items(5, [], BUGUN) == []
