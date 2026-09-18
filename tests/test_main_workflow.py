import os
import pytest
from unittest.mock import patch
from eczane_etiket import data, history, profiles
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


@pytest.fixture(autouse=True)
def clean_app_state(app, tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_FILE", tmp_path / "history.json")
    monkeypatch.setattr(data, "DRUGS_FILE", tmp_path / "drugs.json")
    monkeypatch.setattr(profiles, "PROFILES_FILE", tmp_path / "profiles.json")
    app.active_profile = profiles.get_active_profile()
    app._clear_form()
    app.batch_mode.set(False)
    app._on_mode_change()
    app.batch_entries.clear()
    if hasattr(app, "batch_tree"):
        for item in app.batch_tree.get_children():
            app.batch_tree.delete(item)
    app.pediatric_mode.set(False)
    app.active_warning_tags.clear()
    for btn in app.warning_chip_buttons.values():
        btn.configure(style="Chip.TButton")
    app.update()


def test_barcode_scan_and_auto_fill(app):
    # Parol 2D Karekod okutma testi
    karekod = "010869952509532821999999999999"
    app.barcode_var.set(karekod)
    app._on_barcode_scanned()
    app.update()

    assert app.drug_var.get() == "PAROL 500MG 20 TABLET"
    assert "Ağrı ve ateş düşürücü" in app.purpose_var.get()
    assert "Baş ağrısı" in app.detail_text.get("1.0", "end")

    # İlaç değiştirildiğinde önceki ilacın bilgileri yığılmamalı
    app.drug_var.set("AUGMENTIN BID 1000MG 14 TABLET")
    app._on_drug_selected()
    app.update()

    assert "Antibiyotik" in app.purpose_var.get()
    assert "Ağrı ve ateş" not in app.purpose_var.get()
    assert "Bakteri" in app.detail_text.get("1.0", "end")
    assert "Baş ağrısı" not in app.detail_text.get("1.0", "end")


def test_smart_instructions_replace(app):
    app.instructions_text.delete("1.0", "end")
    app._append_instruction("Günde 1x1 tok karnına yutulacak")
    assert app.instructions_text.get("1.0", "end").strip() == "Günde 1x1 tok karnına yutulacak"

    # Dozaj değiştirildiğinde eskisinin yerine geçmeli, yanına eklenmemeli
    app._append_instruction("Günde 2x1 tok karnına yutulacak")
    assert app.instructions_text.get("1.0", "end").strip() == "Günde 2x1 tok karnına yutulacak"


def test_batch_mode_preserves_patient(app):
    app.drug_var.set("PAROL 500MG 20 TABLET")
    app._on_drug_selected()
    app.patient_var.set("Mehmet Demir")
    app.staff_var.set("Fatma Eczacı")
    app.batch_mode.set(True)
    app._on_mode_change()
    app.update()

    app._add_to_batch()

    assert len(app.batch_entries) == 1
    # Hasta ve personel bilgisi reçetedeki sonraki ilaç için korunmalı
    assert app.patient_var.get() == "Mehmet Demir"
    assert app.staff_var.get() == "Fatma Eczacı"
    # İlaç adı sıfırlanmış olmalı
    assert app.drug_var.get() == ""


def test_batch_double_click_loads_item_for_editing(app):
    app.drug_var.set("PAROL 500MG 20 TABLET")
    app._on_drug_selected()
    app.batch_mode.set(True)
    app._on_mode_change()
    app._add_to_batch()
    assert len(app.batch_entries) == 1

    # İlk elemanı seç ve çift tıkla
    first_iid = app.batch_tree.get_children()[0]
    app.batch_tree.selection_set(first_iid)
    app._on_batch_double_click()

    # Forma geri yüklenmiş olmalı ve listeden çıkarılmış olmalı
    assert app.drug_var.get() == "PAROL 500MG 20 TABLET"
    assert len(app.batch_entries) == 0


def test_form_change_updates_default_instructions(app):
    # Önce tablet seç (varsayılan: yutulacak)
    app.drug_var.set("PAROL 500MG 20 TABLET")
    app._on_drug_selected()
    assert "yutulacak" in app.instructions_text.get("1.0", "end")

    # Sonra merhem seç (krem formuna uygun sürülecek talimatına otomatik güncellenmeli)
    app.drug_var.set("VOLTAREN EMULGEL 100GR")
    app._on_drug_selected()
    assert "sürülecek" in app.instructions_text.get("1.0", "end")
    assert "yutulacak" not in app.instructions_text.get("1.0", "end")


def test_dose_matrix_and_hunger_builder(app):
    # 2x1 multiplier seç
    app._set_quick_dose_multiplier("2x1")
    assert app.dose_times["sabah"] is True
    assert app.dose_times["aksam"] is True
    assert app.dose_times["ogle"] is False
    instr = app.instructions_text.get("1.0", "end").strip()
    assert "Günde 2x1" in instr
    assert "Sabah-Akşam" in instr
    assert "Tok karnına" in instr

    # Açlık durumuna çevir
    app._set_food_status("ac")
    instr2 = app.instructions_text.get("1.0", "end").strip()
    assert "Aç karnına" in instr2


def test_warning_chips_toggle(app):
    assert len(app.active_warning_tags) == 0
    app._toggle_warning_chip("Çalkalayınız")
    assert "Çalkalayınız" in app.active_warning_tags

    entry = app._build_current_entry()
    assert entry.warning_tags == ["Çalkalayınız"]

    # Tekrar tıklandığında kalkmalı
    app._toggle_warning_chip("Çalkalayınız")
    assert len(app.active_warning_tags) == 0


def test_majistral_mode_application(app):
    app._apply_majistral_mode()
    assert "Majistral" in app.drug_var.get()
    assert "HARİCEN" in app.purpose_var.get()
    assert "Çalkalayınız" in app.active_warning_tags
    assert "Işıktan Koruyunuz" in app.active_warning_tags
    assert len(app.end_date_var.get()) == 10  # DD.MM.YYYY format


def test_header_template_switch(app):
    app.header_template_var.set(profiles.LABEL_TEMPLATES["thermal_80x50"])
    app._on_header_template_selected()
    assert app.active_profile.get("label_template") == "thermal_80x50"


def test_theme_switcher_on_app(app):
    app.theme_var.set("🌙 Gece Nöbeti")
    app._on_theme_selected()
    app.update()
    assert app.theme_colors["bg_app"] == "#0b1329"

    app.theme_var.set("🌿 Eczane Yeşili")
    app._on_theme_selected()
    app.update()
    assert app.theme_colors["primary"] == "#059669"

    app.theme_var.set("☀️ Gündüz")
    app._on_theme_selected()
    app.update()
    assert app.theme_colors["bg_app"] == "#f1f5f9"


def test_pediatric_mode_toggle(app):
    assert not app.pediatric_mode.get()
    app._toggle_pediatric_mode()
    assert app.pediatric_mode.get()
    assert "Pediatrik" in app.instr_buttons_frame.cget("text")

    app._toggle_pediatric_mode()
    assert not app.pediatric_mode.get()


def test_auto_calc_refill_date_on_app(app):
    app.package_var.set("30 Tablet")
    app.instructions_text.delete("1.0", "end")
    app.instructions_text.insert("1.0", "Günde 2x1 Sabah Akşam Tok")
    app._auto_calc_refill_date()

    assert app.refill_date_var.get() != ""


def test_insert_food_interaction(app):
    app.detail_text.delete("1.0", "end")
    app._insert_food_interaction("Süt, yoğurt ve antiasitlerle en az 2 saat arayla alınız.")

    assert "Süt, yoğurt" in app.detail_text.get("1.0", "end")


def test_auto_package_extraction_and_refill_on_drug_selected(app):
    app.drug_var.set("PAROL 500MG 20 TABLET")
    app._on_drug_selected()

    assert app.package_var.get() == "20 Tablet"
    assert app.refill_date_var.get() != ""


def test_batch_mode_refill_date_and_dose_grid(app):
    app.batch_mode.set(True)
    app._on_mode_change()

    app.drug_var.set("AUGMENTIN BID 1000MG 14 TABLET")
    app._on_drug_selected()
    app.print_dose_grid_var.set(True)
    saved_refill = app.refill_date_var.get()
    assert saved_refill != ""

    app._add_to_batch()
    app.update()

    # Form alanları temizlenmeli
    assert app.drug_var.get() == ""
    assert app.refill_date_var.get() == ""
    assert len(app.batch_entries) == 1
    assert app.batch_entries[0].print_dose_grid is True
    assert app.batch_entries[0].refill_date == saved_refill

    # Çift tıklamayla forma geri çağırma
    children = app.batch_tree.get_children()
    assert len(children) == 1
    app.batch_tree.selection_set(children[0])
    app._on_batch_double_click()
    app.update()

    assert app.drug_var.get() == "AUGMENTIN BID 1000MG 14 TABLET"
    assert app.refill_date_var.get() == saved_refill
    assert app.print_dose_grid_var.get() is True


def test_theme_and_printer_persistence_in_app(app):
    # Tema değiştirme ve profile kaydetme
    app._switch_theme("dark")
    assert app.active_profile.get("theme") == "dark"

    # Yazıcı seçme ve profile kaydetme
    app.selected_printer_var.set("Xprinter 365B")
    app._on_printer_selected()
    assert app.active_profile.get("default_printer") == "Xprinter 365B"

    # Kaydedilen veriyi profil dosyasından yeniden oku
    saved_p = profiles.get_active_profile()
    assert saved_p.get("theme") == "dark"
    assert saved_p.get("default_printer") == "Xprinter 365B"


def test_warning_chips_count_and_options(app):
    assert len(app.warning_chip_buttons) == 8
    assert "Soğuk Zincir" in app.warning_chip_buttons
    assert "15 Gün" in app.warning_chip_buttons

    app._toggle_warning_chip("Soğuk Zincir")
    assert "Soğuk Zincir" in app.active_warning_tags


def test_medula_quick_paste_prompts_to_print(app, monkeypatch):
    from tkinter import messagebox

    sample_medula = (
        "Reçete No: 123456\n"
        "Hasta: Fatma Demir\n"
        "Tanı: Akut Faranjit\n"
        "1- PAROL 500MG 20 TABLET - Günde 3x1 Tok\n"
        "2- AUGMENTIN BID 1000MG 14 TABLET - Günde 2x1 Tok\n"
    )
    monkeypatch.setattr(app, "clipboard_get", lambda: sample_medula)

    ask_called = []
    def mock_askyesno(title, message, parent=None):
        ask_called.append((title, message))
        return True

    print_called = []
    monkeypatch.setattr(messagebox, "askyesno", mock_askyesno)
    monkeypatch.setattr(app, "_on_print", lambda: print_called.append(True))

    app._quick_paste_from_clipboard()
    app.update()

    # Doğrulama: 2 ilaç eklenmiş olmalı, hasta adı set edilmiş olmalı
    assert len(app.batch_entries) == 2
    assert app.patient_var.get() == "Fatma Demir"
    # Yazdırılsın mı sorusu sorulmuş olmalı
    assert len(ask_called) == 1
    assert "Yazdırılsın mı" in ask_called[0][0]
    # 'Evet' dendiği için _on_print tetiklenmiş olmalı
    assert len(print_called) == 1

