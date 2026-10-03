"""Theme engine ve renk paleti testleri."""

from eczane_etiket import theme


def test_theme_keys_and_tokens():
    expected_themes = ["light", "dark", "emerald"]
    for th in expected_themes:
        assert th in theme.THEMES
        t_data = theme.THEMES[th]
        assert "bg_app" in t_data
        assert "bg_card" in t_data
        assert "bg_header" in t_data
        assert "primary" in t_data
        assert "success" in t_data
        assert "border" in t_data
        assert "text_primary" in t_data


def test_theme_switching_logic(monkeypatch):
    class MockRoot:
        def __init__(self):
            self.cfg = {}

        def configure(self, **kwargs):
            self.cfg.update(kwargs)

    class MockStyle:
        def __init__(self):
            self.configured = {}

        def theme_names(self):
            return ["clam", "default"]

        def theme_use(self, name):
            pass

        def configure(self, name, **kwargs):
            self.configured[name] = kwargs

        def map(self, name, **kwargs):
            pass

    monkeypatch.setattr(theme, "enable_high_dpi", lambda: None)
    monkeypatch.setattr(theme.ttk, "Style", MockStyle)

    root = MockRoot()

    colors_dark = theme.apply_theme(root, "dark")
    assert colors_dark["bg_app"] == "#0b1329"
    assert theme.BG_APP == "#0b1329"
    assert root.cfg.get("bg") == "#0b1329"

    colors_emerald = theme.apply_theme(root, "emerald")
    assert colors_emerald["primary"] == "#059669"
    assert theme.PRIMARY == "#059669"

    colors_light = theme.apply_theme(root, "light")
    assert colors_light["bg_app"] == "#f1f5f9"
    assert theme.BG_APP == "#f1f5f9"
    assert root.cfg.get("bg") == "#f1f5f9"

    # Geçersiz tema anahtarında güvenle light'a düşmeli
    fallback = theme.apply_theme(root, "non_existent_theme")
    assert fallback["bg_app"] == "#f1f5f9"
