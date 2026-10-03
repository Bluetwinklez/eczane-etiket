import os
import tempfile
import tkinter as tk
import pytest

from eczane_etiket import charts, dashboard, history, receipt_pdf, stats, stock, theme, toast
from eczane_etiket.main import App


@pytest.fixture(scope="module")
def app():
    instance = App()
    instance.update()
    yield instance
    try:
        instance.destroy()
    except Exception:
        pass


def test_stats_turnover_and_recent_transactions(tmp_path, monkeypatch):
    test_records = [
        {"timestamp": "2026-09-18T10:00:00", "drug_name": "PAROL", "patient_name": "Ahmet Kaya", "staff_name": "Ecz. Ali", "price": 120.0},
        {"timestamp": "2026-09-18T11:30:00", "drug_name": "AUGMENTIN", "patient_name": "Fatma Yılmaz", "staff_name": "Ecz. Ayşe", "price": 180.50},
        {"timestamp": "2026-09-17T15:00:00", "drug_name": "APRANAX", "patient_name": "Mehmet Demir", "staff_name": "Ecz. Ali", "price": 95.0},
    ]
    monkeypatch.setattr(stats, "load_history", lambda: test_records)

    # Günlük ciro testi
    ciro = stats.daily_turnover(day="2026-09-18", records=test_records)
    assert ciro == 300.50

    # Haftalık ciro trendi
    trends = stats.turnover_by_day(days=7, records=test_records)
    assert len(trends) == 7
    day_map = dict(trends)
    assert day_map.get("2026-09-18") == 300.50
    assert day_map.get("2026-09-17") == 95.0

    # Son işlemler listesi
    recents = stats.recent_transactions(limit=5, records=test_records)
    assert len(recents) == 3
    assert recents[0]["patient_name"] == "Ahmet Kaya"
    assert recents[0]["price"] == 120.0


def test_charts_canvas_rendering(app):
    data = [("12.09", 10.0), ("13.09", 25.0), ("14.09", 18.0), ("15.09", 32.0)]
    chart = charts.CanvasChart(app, data=data, chart_type="bar", height=180)
    chart.pack()
    app.update()

    # Bar grafik çizimi kontrolü
    assert chart.canvas.find_all()  # Canvas boş değil

    # Çizgi grafik moduna geçiş
    chart.set_chart_type("line")
    app.update()
    assert chart.chart_type == "line"
    assert chart.canvas.find_all()

    chart.destroy()


def test_receipt_pdf_thermal_and_a4(tmp_path):
    profile = {
        "name": "Şifa Eczanesi",
        "phone": "0212 555 12 34",
    }
    items = [
        {"name": "PAROL 500MG 20 TABLET", "instructions": "Günde 3x1 Tok", "quantity": 2, "price": 65.0},
        {"name": "AUGMENTIN BID 1000MG 14 TABLET", "instructions": "Günde 2x1 Tok 12 saat arayla", "quantity": 1, "price": 140.0},
    ]

    # 1. Termal 80mm Satış Fişi Testi
    thermal_out = str(tmp_path / "thermal_receipt.pdf")
    res1 = receipt_pdf.build_receipt_pdf(
        filename=thermal_out,
        profile=profile,
        items=items,
        patient_name="Caner Erkin",
        format_type="thermal_80",
    )
    assert os.path.isfile(res1)
    assert os.path.getsize(res1) > 1000

    # 2. A4 Eczane Teslim Makbuzu Testi
    a4_out = str(tmp_path / "a4_receipt.pdf")
    res2 = receipt_pdf.build_receipt_pdf(
        filename=a4_out,
        profile=profile,
        items=items,
        patient_name="Caner Erkin",
        format_type="a4",
    )
    assert os.path.isfile(res2)
    assert os.path.getsize(res2) > 1000


def test_toast_notification_lifecycle(app):
    t = toast.show_toast(app, "Etiket başarıyla basıldı", level="success", duration_ms=500)
    assert t.top is not None
    app.update()

    # Kapatma çağrısı
    t.destroy()
    assert t._is_destroyed is True


def test_dashboard_view_and_responsive_reflow(app):
    dash = dashboard.DashboardView(app, padding=8)
    dash.pack(fill="both", expand=True)
    app.update()

    # Kartların oluşturulduğunu doğrula
    assert len(dash.card_widgets) == 4
    assert dash.chart_widget is not None
    assert dash.recent_tree is not None

    # Responsive reflow simülasyonu
    class EventMock:
        def __init__(self, w):
            self.width = w

    # Geniş ekran (>= 820)
    dash._on_container_resize(EventMock(950))
    # Tablet ekran (480 - 820)
    dash._on_container_resize(EventMock(650))
    # Mobil ekran (< 480)
    dash._on_container_resize(EventMock(360))

    dash.destroy()


def test_pos_shortcuts_and_helpers(app):
    # F6 Doz döngüsü
    app._cycle_quick_dose()
    assert app.dose_times["sabah"] is True

    # F7 Aç/Tok döngüsü
    orig = app.food_status.get()
    app._toggle_quick_food()
    assert app.food_status.get() != orig

    # Kısayol yardım penceresi açılıp kapanabilmeli
    help_top = None
    try:
        app._show_shortcut_help()
        # Açılan toplevel pencereleri bul
        children = [c for c in app.winfo_children() if isinstance(c, tk.Toplevel)]
        assert len(children) > 0
        help_top = children[-1]
    finally:
        if help_top:
            help_top.destroy()


def test_reorder_batch_items_with_shortcuts(app):
    app.batch_mode.set(True)
    app._on_mode_change()
    app.batch_entries.clear()

    e1 = app._build_current_entry()
    e1.drug_name = "İlaç 1"
    e2 = app._build_current_entry()
    e2.drug_name = "İlaç 2"

    app.batch_entries.extend([e1, e2])
    app.batch_tree.delete(*app.batch_tree.get_children())
    app.batch_tree.insert("", "end", iid="item1", values=(e1.drug_name, "1x1", 1))
    app.batch_tree.insert("", "end", iid="item2", values=(e2.drug_name, "1x1", 1))

    # item1 seç ve aşağı taşı (Alt+Down)
    app.batch_tree.selection_set("item1")
    app._reorder_batch_item(1)

    assert app.batch_entries[0].drug_name == "İlaç 2"
    assert app.batch_entries[1].drug_name == "İlaç 1"

    # item1'i tekrar yukarı taşı (Alt+Up)
    kids = app.batch_tree.get_children()
    app.batch_tree.selection_set(kids[1])
    app._reorder_batch_item(-1)

    assert app.batch_entries[0].drug_name == "İlaç 1"
    assert app.batch_entries[1].drug_name == "İlaç 2"

    app.batch_mode.set(False)
    app._on_mode_change()
