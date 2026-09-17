from eczane_etiket import history


def test_log_and_load_history(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_FILE", tmp_path / "history.json")

    history.log_label({"patient_name": "Ahmet Yılmaz", "drug_name": "PAROL 500MG", "instructions": "Günde 3x1"})
    history.log_label({"patient_name": "Ayşe Demir", "drug_name": "MAJEZIK 100MG", "instructions": "Günde 2x1"})

    records = history.load_history()
    assert len(records) == 2
    # En son eklenen en üstte olmalı (ters kronolojik sıralama).
    assert records[0]["drug_name"] == "MAJEZIK 100MG"
    assert "timestamp" in records[0]


def test_search_by_patient(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_FILE", tmp_path / "history.json")

    history.log_label({"patient_name": "Ahmet Yılmaz", "drug_name": "PAROL 500MG"})
    history.log_label({"patient_name": "Ayşe Demir", "drug_name": "MAJEZIK 100MG"})

    results = history.search_by_patient("ahmet")
    assert len(results) == 1
    assert results[0]["drug_name"] == "PAROL 500MG"


def test_export_history_csv(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_FILE", tmp_path / "history.json")
    history.log_label({
        "patient_name": "Ahmet Yılmaz",
        "drug_name": "PAROL 500MG",
        "instructions": "Günde 3x1",
        "refill_date": "20.10.2026",
    })

    csv_path = tmp_path / "export.csv"
    history.export_history_csv(str(csv_path))

    assert csv_path.exists()
    content = csv_path.read_text(encoding="utf-8-sig")
    assert "PAROL 500MG" in content
    assert "Ahmet Yılmaz" in content
    assert "refill_date" in content
    assert "20.10.2026" in content
