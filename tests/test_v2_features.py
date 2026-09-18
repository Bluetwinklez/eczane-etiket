import os
import tempfile
import pytest
from eczane_etiket import (
    translator,
    clinical,
    pricing,
    counseling_msg,
    diagnostics,
    z_report,
    theme,
)


def test_translator_basic_patterns():
    # Günde 2 kez tok karnına
    tr_text = "Günde 2 kez tok karnına 1 tablet"
    en = translator.translate_instruction(tr_text, target_lang="en")
    assert "2 times a day" in en or "twice" in en.lower() or "after meals" in en.lower()

    de = translator.translate_instruction(tr_text, target_lang="de")
    assert "nach dem essen" in de.lower() or "tag" in de.lower() or "mahlzeit" in de.lower()

    ar = translator.translate_instruction("Günde 1 kez aç karnına", target_lang="ar")
    assert len(ar) > 0

    ru = translator.translate_instruction("Günde 3 kez tok karnına", target_lang="ru")
    assert "после еды" in ru or "день" in ru.lower() or len(ru) > 0


def test_clinical_interactions():
    # Warfarin + Aspirin should trigger major interaction
    drugs = ["Coumadin 5mg", "Coraspin 100mg Tablet"]
    warnings = clinical.check_clinical_interactions(drugs)
    assert len(warnings) >= 1
    assert any("Kanamayı artırabilir" in w["message"] or "kanama" in w["message"].lower() for w in warnings)

    # Clean list without interaction
    clean_drugs = ["Parol 500mg Tablet", "Amoklavin 1000mg"]
    clean_warnings = clinical.check_clinical_interactions(clean_drugs)
    assert len(clean_warnings) == 0


def test_clinical_max_daily_dose():
    # Overdose case: 5x2 = 10 tablets of 500mg Paracetamol = 5000mg > 4000mg
    overdose = clinical.check_max_daily_dose("Parol 500mg Tablet", "Günde 5 kez 2 tablet tok")
    assert overdose is not None
    assert overdose["daily_mg"] == 5000
    assert overdose["max_mg"] == 4000
    assert "AŞILDI" in overdose["warning"] or "GÜNLÜK DOZ AŞIMI" in overdose["warning"]

    # Safe case: 3x1 = 1500mg <= 4000mg
    safe = clinical.check_max_daily_dose("Parol 500mg Tablet", "Günde 3 kez 1 tablet tok")
    assert safe is None


def test_clinical_pediatric_calculator():
    # Paracetamol: 10-15 mg/kg/dose. 20 kg child -> 200-300 mg per dose
    dose_info = clinical.calculate_pediatric_dose("paracetamol", 20.0)
    assert dose_info is not None
    assert dose_info["dose_mg_single_min"] == 200.0
    assert dose_info["dose_mg_single_max"] == 300.0
    assert dose_info["max_daily_mg"] == 1500.0

    # Unknown drug returns None
    assert clinical.calculate_pediatric_dose("bilinmeyen_ilac", 15.0) is None


def test_clinical_geriatric_beers_risk():
    # Diazepam (Benzodiazepin) in elderly
    diaz = clinical.check_geriatric_beers_risk("Diazem 5mg Kapsül")
    assert diaz is not None
    assert "düşme riski" in diaz.lower()

    # Safe drug
    assert clinical.check_geriatric_beers_risk("Parol 500mg Tablet") is None


def test_clinical_food_interactions():
    food_warns = clinical.get_food_interactions(["Cipro 500mg Film Tablet", "Lipitor 20mg Tablet"])
    assert len(food_warns) >= 1
    text_combined = " ".join([w["warning"] for w in food_warns])
    assert "Süt" in text_combined or "Greyfurt" in text_combined


def test_pricing_and_copay():
    # SGK Employee (%20 co-pay)
    fin_emp = pricing.calculate_prescription_financials(
        retail_price=200.0,
        sgk_covered_price=180.0,
        category="sgk_employee",
    )
    assert fin_emp["patient_copay_ratio"] == 0.20
    assert fin_emp["patient_copay_amount"] == 36.0  # 180 * 0.20
    assert fin_emp["price_difference"] == 20.0     # 200 - 180
    assert fin_emp["patient_total_payable"] == 56.0 # 36 + 20
    assert fin_emp["sgk_payable"] == 144.0         # 180 - 36

    # SGK Chronic report (%0 co-pay)
    fin_chronic = pricing.calculate_prescription_financials(
        retail_price=100.0,
        sgk_covered_price=100.0,
        category="sgk_chronic",
    )
    assert fin_chronic["patient_total_payable"] == 0.0
    assert fin_chronic["sgk_payable"] == 100.0


def test_counseling_msg_generation():
    items = [
        {"name": "Parol 500mg", "instructions": "Günde 3 kez tok karnına", "refill_date": "15.10.2026"},
        {"name": "Augmentin 1000mg", "instructions": "Günde 2 kez 12 saatte bir tok", "refill_date": "25.09.2026"},
    ]
    summary = counseling_msg.generate_patient_whatsapp_summary(
        patient_name="Ahmet Yılmaz",
        pharmacy_name="Şifa Eczanesi",
        pharmacy_phone="0212 555 0000",
        items=items,
    )
    assert "Ahmet Yılmaz" in summary
    assert "ŞIFA ECZANESI" in summary.upper()
    assert "Parol 500mg" in summary
    assert "Augmentin 1000mg" in summary
    assert "15.10.2026" in summary

    sms = counseling_msg.generate_sms_refill_reminder(
        patient_name="Ayşe Kaya",
        pharmacy_name="Şifa Eczanesi",
        drug_name="Coraspin 100mg",
        refill_date="20.09.2026",
    )
    assert "Ayşe Kaya" in sms
    assert "Coraspin 100mg" in sms
    assert "20.09.2026" in sms


def test_system_diagnostics():
    diag = diagnostics.run_system_diagnostics()
    assert "overall_status" in diag
    assert "checks" in diag
    assert len(diag["checks"]) >= 4

    summary = diagnostics.format_diagnostics_report(diag)
    assert "SİSTEM SAĞLIK VE TANI RAPORU" in summary
    assert "Python" in summary


def test_z_report_pdf_generation():
    sample_profile = {
        "name": "Örnek Test Eczanesi",
        "pharmacist": "Ecz. Test Uzman",
        "address": "Atatürk Cad. No: 1",
        "phone": "0212 123 4567",
    }
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        res_path = z_report.build_z_report_pdf(tmp_path, sample_profile)
        assert os.path.exists(res_path)
        assert os.path.getsize(res_path) > 1000
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def test_extended_themes():
    # Verify new ocean and cosmic themes in THEMES
    assert "ocean" in theme.THEMES
    assert "cosmic" in theme.THEMES
    ocean = theme.THEMES["ocean"]
    assert ocean["primary"] == "#0284c7"
    cosmic = theme.THEMES["cosmic"]
    assert cosmic["bg_app"] == "#05070e"
