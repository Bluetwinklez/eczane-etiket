"""Unit tests for patient medication schedule A4 PDF generation and history autocomplete."""

import os
from pathlib import Path
from eczane_etiket.label_pdf import LabelEntry, build_patient_schedule_pdf
from eczane_etiket.history import log_label, get_recent_patients, get_patient_last_entries


def test_build_patient_schedule_pdf(tmp_path: Path):
    entries = [
        LabelEntry(
            drug_name="PAROL 500 MG TABLET",
            instructions="Günde 3 defa 1 tablet tok karnına",
            patient_name="AYŞE YILMAZ",
            patient_note="Ağrı ve ateş durumunda",
            storage_note="25°C altında",
            warning_tags=["tok", "bol_su"],
            dose_grid={"sabah": "1", "öğle": "1", "akşam": "1", "gece": "-"},
            refill_date="15.10.2026",
            lot_number="P12345",
            expiry_date="31.12.2026",
        ),
        LabelEntry(
            drug_name="AUGMENTIN-BID 1000 MG FILM TABLET",
            instructions="12 saatte bir 1 tablet tok karnına",
            patient_name="AYŞE YILMAZ",
            patient_note="Antibiyotik kürü bitene kadar düzenli alınız",
            storage_note="25°C altında",
            warning_tags=["tok", "bol_su", "surdur"],
            dose_grid={"sabah": "1", "öğle": "-", "akşam": "1", "gece": "-"},
            refill_date="05.10.2026",
            lot_number="AUG998",
            expiry_date="30.06.2027",
        ),
    ]

    out_pdf = tmp_path / "hasta_cizelgesi.pdf"
    res = build_patient_schedule_pdf(
        patient_name="AYŞE YILMAZ",
        pharmacy_name="ŞİFA ECZANESİ",
        phone="0212 555 0123",
        entries=entries,
        output_path=out_pdf,
    )

    assert Path(res).exists()
    assert os.path.getsize(res) > 2000  # PDF contains multiple elements and is valid


def test_patient_history_helpers(tmp_path: Path, monkeypatch):
    test_hist_file = tmp_path / "test_history.json"
    import eczane_etiket.history as hist_mod

    monkeypatch.setattr(hist_mod, "HISTORY_FILE", test_hist_file)

    log_label(
        {
            "patient_name": "MEHMET DEMİR",
            "drug_name": "CORASPIN 100 MG",
            "instructions": "Günde 1 tablet",
            "staff_name": "Eczacı Ali",
        }
    )
    log_label(
        {
            "patient_name": "FATMA ÇELİK",
            "drug_name": "NEXIUM 40 MG",
            "instructions": "Sabah aç",
            "staff_name": "Eczacı Ali",
        }
    )
    log_label(
        {
            "patient_name": "MEHMET DEMİR",
            "drug_name": "LIPITOR 20 MG",
            "instructions": "Akşam 1 tablet",
            "staff_name": "Eczacı Ali",
        }
    )

    patients = get_recent_patients(limit=10)
    assert "MEHMET DEMİR" in patients
    assert "FATMA ÇELİK" in patients
    assert patients[0] == "MEHMET DEMİR"

    mehmet_entries = get_patient_last_entries("MEHMET DEMİR", limit=5)
    assert len(mehmet_entries) == 2
    drug_names = [e.get("drug_name") for e in mehmet_entries]
    assert "LIPITOR 20 MG" in drug_names
    assert "CORASPIN 100 MG" in drug_names
