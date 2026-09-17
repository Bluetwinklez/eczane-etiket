from eczane_etiket import data


def test_load_drug_list_falls_back_to_seed(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "DRUGS_FILE", tmp_path / "drugs.json")
    drugs = data.load_drug_list()
    assert len(drugs) == len(data.DRUGS_SEED)
    names = {d["name"] for d in drugs}
    assert "PAROL 500MG 20 TABLET" in names


def test_load_drug_list_prefers_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "DRUGS_FILE", tmp_path / "drugs.json")
    custom = [{"name": "ÖZEL İLAÇ", "form": "tablet", "use_count": 0}]
    data.save_drug_list(custom)
    drugs = data.load_drug_list()
    assert len(drugs) == 1
    assert drugs[0]["name"] == "ÖZEL İLAÇ"


def test_search_drugs_case_insensitive():
    drugs = [d.to_dict() for d in data.DRUGS_SEED]
    results = data.search_drugs("parol", drugs)
    assert len(results) == 1
    assert results[0]["name"] == "PAROL 500MG 20 TABLET"


def test_search_drugs_empty_query_returns_all():
    drugs = [d.to_dict() for d in data.DRUGS_SEED]
    assert data.search_drugs("", drugs) == drugs


def test_find_drug_by_name():
    drugs = [d.to_dict() for d in data.DRUGS_SEED]
    found = data.find_drug("MAJEZIK 100MG 10 TABLET", drugs)
    assert found is not None
    assert found["form"] == "tablet"
    assert data.find_drug("YOK BÖYLE BİR İLAÇ", drugs) is None


def test_find_drug_by_barcode():
    drugs = [
        {"name": "TEST İLAÇ", "form": "tablet", "barcode": "8699999999999", "use_count": 0},
        {"name": "BARKODSUZ İLAÇ", "form": "tablet", "barcode": None, "use_count": 0},
    ]
    found = data.find_drug_by_barcode("8699999999999", drugs)
    assert found is not None
    assert found["name"] == "TEST İLAÇ"
    assert data.find_drug_by_barcode("", drugs) is None
    assert data.find_drug_by_barcode("0000000000000", drugs) is None


def test_bump_use_count_affects_ordering(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "DRUGS_FILE", tmp_path / "drugs.json")
    data.bump_use_count("MAJEZIK 100MG 10 TABLET")
    data.bump_use_count("MAJEZIK 100MG 10 TABLET")
    drugs = data.load_drug_list()
    assert drugs[0]["name"] == "MAJEZIK 100MG 10 TABLET"
    assert drugs[0]["use_count"] == 2


def test_get_instruction_templates_by_form():
    templates = data.get_instruction_templates("merhem_krem")
    assert any("sürülecek" in t for t in templates)
    assert data.get_instruction_templates("bilinmeyen_form") == []


def test_save_and_get_instruction_templates_override(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "TEMPLATES_FILE", tmp_path / "templates.json")
    data.save_instruction_templates("tablet", ["Özel talimat 1", "Özel talimat 2"])
    assert data.get_instruction_templates("tablet") == ["Özel talimat 1", "Özel talimat 2"]
    # Diğer formlar override'dan etkilenmemeli.
    assert data.get_instruction_templates("surup") == data.INSTRUCTION_TEMPLATES_BY_FORM["surup"]


def test_seed_storage_condition_defaults_applied():
    for drug in data.DRUGS_SEED:
        assert drug.saklama_kosulu


def test_update_drug(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "DRUGS_FILE", tmp_path / "drugs.json")
    custom = [{"name": "ESKİ İLAÇ", "form": "tablet", "barcode": "111", "use_count": 0}]
    data.save_drug_list(custom)
    res = data.update_drug("ESKİ İLAÇ", name="YENİ İLAÇ", barcode="222")
    assert res is not None
    assert res["name"] == "YENİ İLAÇ"
    assert res["barcode"] == "222"
    drugs = data.load_drug_list()
    assert drugs[0]["name"] == "YENİ İLAÇ"
    assert data.update_drug("YOK", name="X") is None


def test_karekod_barcode_matching():
    karekod = "010869952509532821123456789"
    gtin = data.extract_gtin_from_karekod(karekod)
    assert gtin == "8699525095328"
    drug = data.find_drug_by_barcode(karekod)
    assert drug is not None
    assert "PAROL" in drug["name"]


def test_turkish_normalize_and_search():
    drugs = [
        {"name": "CİPRO 500MG TABLET", "form": "tablet", "use_count": 5},
        {"name": "PAROL 500MG 20 TABLET", "form": "tablet", "use_count": 10},
        {"name": "ŞURUP PROSPAN", "form": "surup", "use_count": 1},
    ]
    # 'cipro' (küçük i) ile 'CİPRO' (büyük İ) eşleşmeli
    res1 = data.search_drugs("cipro", drugs)
    assert len(res1) == 1
    assert "CİPRO" in res1[0]["name"]

    # 'surup' (Türkçe olmayan s) ile 'ŞURUP' eşleşmeli
    res2 = data.search_drugs("surup", drugs)
    assert len(res2) == 1
    assert "ŞURUP" in res2[0]["name"]

    # find_drug küçük harfle arandığında da bulmalı
    found = data.find_drug("parol 500mg 20 tablet", drugs)
    assert found is not None
    assert found["name"] == "PAROL 500MG 20 TABLET"


def test_calculate_refill_date():
    import datetime as dt
    start = dt.date(2026, 1, 1)

    # 30 Tablet, 2x1 = 15 gün sonra
    refill1 = data.calculate_refill_date("30 Tablet", "Günde 2x1 tok karnına", start_date=start)
    assert refill1 == "16.01.2026"

    # 14 Kapsül, 1x1 = 14 gün sonra
    refill2 = data.calculate_refill_date("14 Kapsül", "Günde 1x1 aç karnına", start_date=start)
    assert refill2 == "15.01.2026"

    # 20 Draje, 3x1 = 6 gün sonra (20 // 3)
    refill3 = data.calculate_refill_date("20 Draje", "3x1", start_date=start)
    assert refill3 == "07.01.2026"

    # Geçersiz ambalaj metni
    assert data.calculate_refill_date("", "1x1") is None
    assert data.calculate_refill_date("Bilinmeyen", "1x1") is None


def test_parse_dose_grid():
    g1 = data.parse_dose_grid("Günde 2x1 Sabah Akşam Tok")
    assert g1 == {"sabah": "1", "öğle": "-", "akşam": "1", "gece": "-"}

    g2 = data.parse_dose_grid("Günde 3x1 Sabah Öğle Akşam Tok")
    assert g2 == {"sabah": "1", "öğle": "1", "akşam": "1", "gece": "-"}

    g3 = data.parse_dose_grid("1x1 Gece Yatarken")
    assert g3 == {"sabah": "-", "öğle": "-", "akşam": "-", "gece": "1"}

    g4 = data.parse_dose_grid("4x1 Günde 4 Defa")
    assert g4 == {"sabah": "1", "öğle": "1", "akşam": "1", "gece": "1"}

    g5 = data.parse_dose_grid("1x1/2 Sabah Tok")
    assert g5["sabah"] == "½"

    g_empty = data.parse_dose_grid("")
    assert g_empty == {"sabah": "-", "öğle": "-", "akşam": "-", "gece": "-"}


def test_food_interactions_and_pediatric_constants():
    assert len(data.FOOD_INTERACTIONS) >= 4
    for title, hint in data.FOOD_INTERACTIONS:
        assert isinstance(title, str) and len(title) > 0
        assert isinstance(hint, str) and len(hint) > 0

    assert len(data.PEDIATRIC_TEMPLATES) >= 4
    for tmpl in data.PEDIATRIC_TEMPLATES:
        assert isinstance(tmpl, str) and len(tmpl) > 0


def test_extract_package_info():
    assert data.extract_package_info("PAROL 500MG 20 TABLET") == "20 Tablet"
    assert data.extract_package_info("AUGMENTIN BID 1000MG 14 FILM TABLET") == "14 Film Tablet"
    assert data.extract_package_info("CALPOL 120MG/5ML ŞURUP 100ML") == "100Ml"
    assert data.extract_package_info("D VİTAMİNİ DAMLA 15ML") == "15Ml"
    assert data.extract_package_info("DOLOREX 10 ADET") == "10 Adet"
    assert data.extract_package_info("VOLTAREN EMULGEL 100GR") == "100Gr"
    assert data.extract_package_info("NEXIUM 40MG 28 KAPSÜL") == "28 Kapsül"
    assert data.extract_package_info("ASPIRIN") is None
    assert data.extract_package_info("") is None


