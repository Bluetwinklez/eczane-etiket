from eczane_etiket import stats

SAMPLE_RECORDS = [
    {"timestamp": "2026-09-15T10:00:00", "drug_name": "PAROL 500MG 20 TABLET", "staff_name": "Ayşe"},
    {"timestamp": "2026-09-15T11:00:00", "drug_name": "PAROL 500MG 20 TABLET", "staff_name": "Ayşe"},
    {"timestamp": "2026-09-16T09:00:00", "drug_name": "MAJEZIK 100MG 10 TABLET", "staff_name": "Mehmet"},
    {"timestamp": "2026-09-16T09:30:00", "drug_name": "", "staff_name": ""},
]


def test_top_drugs_counts_descending():
    result = stats.top_drugs(records=SAMPLE_RECORDS)
    assert result[0] == ("PAROL 500MG 20 TABLET", 2)
    assert ("MAJEZIK 100MG 10 TABLET", 1) in result


def test_top_staff_counts_descending():
    result = stats.top_staff(records=SAMPLE_RECORDS)
    assert result[0] == ("Ayşe", 2)


def test_top_drugs_ignores_empty_names():
    result = stats.top_drugs(records=SAMPLE_RECORDS)
    names = [name for name, _ in result]
    assert "" not in names


def test_total_labels():
    assert stats.total_labels(SAMPLE_RECORDS) == 4


def test_counts_by_day_includes_full_range():
    result = stats.counts_by_day(days=3, records=[])
    assert len(result) == 3
    assert all(count == 0 for _, count in result)


def test_summary_shape(monkeypatch, tmp_path):
    from eczane_etiket import history

    monkeypatch.setattr(history, "HISTORY_FILE", tmp_path / "history.json")
    history.log_label({"drug_name": "TEST İLAÇ", "staff_name": "Test"})
    s = stats.summary(days=2)
    assert s["total"] == 1
    assert s["top_drugs"][0][0] == "TEST İLAÇ"
    assert len(s["by_day"]) == 2
