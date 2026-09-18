"""Unit tests for drug safety checks and 2D DataMatrix barcode parsing."""

from eczane_etiket.data import (
    parse_datamatrix_details,
    get_drug_safety_classes,
    check_drug_safety_warnings,
)


def test_parse_datamatrix_details_standard():
    raw = "01086995250901232112345678901726053110ABC1234"
    details = parse_datamatrix_details(raw)
    assert details["gtin"] == "8699525090123"
    assert details["sn"] == "1234567890"
    assert details["expiry_date"] == "31.05.2026"
    assert details["lot_number"] == "ABC1234"


def test_parse_datamatrix_details_no_ai():
    raw = "8699525090123"
    details = parse_datamatrix_details(raw)
    assert details["gtin"] == "8699525090123"
    assert details["lot_number"] == ""
    assert details["expiry_date"] == ""


def test_get_drug_safety_classes():
    parol_classes = get_drug_safety_classes("PAROL 500 MG TABLET")
    assert "parasetamol" in parol_classes

    zyrtec_classes = get_drug_safety_classes("ZYRTEC 10 MG TABLET")
    assert "antihistaminik" in zyrtec_classes

    coraspin_classes = get_drug_safety_classes("CORASPIN 100 MG ENTERIK TABLET")
    assert "kan_sulandirici" in coraspin_classes

    majezik_classes = get_drug_safety_classes("MAJEZIK 100 MG FILM TABLET")
    assert "nsaii" in majezik_classes


def test_check_drug_safety_warnings_paracetamol_duplicate():
    existing = ["A-FERIN FORTE TABLET"]
    warnings = check_drug_safety_warnings("PAROL 500 MG 20 TABLET", existing)
    assert any("Parasetamol" in w for w in warnings)


def test_check_drug_safety_warnings_dual_nsaid():
    existing = ["APRANAX PLUS FILM TABLET"]
    warnings = check_drug_safety_warnings("MAJEZIK 100 MG FILM TABLET", existing)
    assert any("NSAİİ" in w for w in warnings)


def test_check_drug_safety_warnings_blood_thinner_and_nsaid():
    existing = ["CORASPIN 100 MG ENTERIK TABLET"]
    warnings = check_drug_safety_warnings("ARVELES 25 MG FILM TABLET", existing)
    assert any("KANAMA" in w or "Kanama" in w for w in warnings)


def test_check_drug_safety_warnings_duplicate_ppi():
    existing = ["NEXIUM 40 MG ENTERIK TABLET"]
    warnings = check_drug_safety_warnings("PANPAS 40 MG ENTERIK KAPLI TABLET", existing)
    assert any("MİDE" in w or "Mide" in w for w in warnings)


def test_check_drug_safety_warnings_duplicate_antibiotic():
    existing = ["AUGMENTIN-BID 1000 MG FILM TABLET"]
    warnings = check_drug_safety_warnings("KLACID 500 MG FILM TABLET", existing)
    assert any("ANTİBİYOTİK" in w or "Antibiyotik" in w for w in warnings)


def test_check_drug_safety_warnings_no_conflict():
    existing = ["AUGMENTIN-BID 1000 MG FILM TABLET", "PANPAS 40 MG ENTERIK KAPLI TABLET"]
    warnings = check_drug_safety_warnings("PAROL 500 MG TABLET", existing)
    assert len(warnings) == 0
