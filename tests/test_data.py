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
