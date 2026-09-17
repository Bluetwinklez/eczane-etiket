from eczane_etiket import profiles


def test_profiles_lifecycle(tmp_path, monkeypatch):
    monkeypatch.setattr(profiles, "PROFILES_FILE", tmp_path / "profiles.json")

    # İlk çalıştırma: varsayılan profil üretmeli
    active = profiles.get_active_profile()
    assert active["name"] == "Eczanem"
    assert active["label_template"] == profiles.DEFAULT_LABEL_TEMPLATE

    # Yeni profil ekleme
    new_p = profiles.add_profile(
        name="Şifa Eczanesi",
        phone="0212 555 12 34",
        label_template="thermal_60x40",
    )
    assert new_p["name"] == "Şifa Eczanesi"
    assert new_p["label_template"] == "thermal_60x40"

    # Aktif profil değiştirme
    profiles.set_active_profile(new_p["id"])
    active2 = profiles.get_active_profile()
    assert active2["id"] == new_p["id"]
    assert active2["name"] == "Şifa Eczanesi"

    # Güncelleme
    profiles.update_profile(new_p["id"], name="Yeni Şifa Eczanesi", phone="0212 999 99 99")
    active3 = profiles.get_active_profile()
    assert active3["name"] == "Yeni Şifa Eczanesi"
    assert active3["phone"] == "0212 999 99 99"

    # PIN testi
    profiles.set_pin(active3, "1234")
    assert profiles.verify_pin(active3, "1234") is True
    assert profiles.verify_pin(active3, "9999") is False

    # PIN kaldırma
    profiles.set_pin(active3, None)
    assert profiles.verify_pin(active3, "herhangi_bir_pin") is True

    # Silme
    profiles.delete_profile(active["id"])
    all_profiles = profiles.load_profiles()
    assert len(all_profiles) == 1
    assert all_profiles[0]["id"] == new_p["id"]


def test_profile_theme_and_printer_preferences(tmp_path, monkeypatch):
    monkeypatch.setattr(profiles, "PROFILES_FILE", tmp_path / "profiles.json")

    p = profiles.add_profile(
        name="Gece Nöbet Eczanesi",
        theme="dark",
        default_printer="Xprinter XP-365B",
    )
    assert p["theme"] == "dark"
    assert p["default_printer"] == "Xprinter XP-365B"

    # Update theme and printer
    profiles.set_active_profile(p["id"])
    profiles.update_profile(p["id"], theme="emerald", default_printer=None)
    updated = profiles.get_active_profile()
    assert updated["theme"] == "emerald"
    assert updated["default_printer"] is None

