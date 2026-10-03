import os
import tempfile

from eczane_etiket.label_pdf import LabelEntry, build_label_pdf

SAMPLE_PROFILE = {
    "name": "ABC ECZANESİ",
    "phone": "0262 000 00 00",
    "label_template": "thermal_50x30",
}


def test_build_label_pdf_creates_nonempty_file():
    entry = LabelEntry(
        drug_name="PAROL 500MG 20 TABLET",
        kullanim_amaci_tani="Ağrı ve ateş düşürücü",
        instructions="Günde 3x1 tok karnına yutulacak",
        detail_note="Günde 3 defadan fazla kullanmayınız.",
        patient_name="Ahmet Yılmaz",
        copies=2,
    )
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "etiket.pdf")
        result = build_label_pdf(SAMPLE_PROFILE, [entry], output_path)
        assert result == output_path
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_a4_grid_template():
    profile = dict(SAMPLE_PROFILE, label_template="a4_grid_6")
    entries = [
        LabelEntry(drug_name=f"İLAÇ {i}", instructions="Günde 1x1 yutulacak")
        for i in range(8)
    ]
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "toplu.pdf")
        build_label_pdf(profile, entries, output_path)
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_without_optional_fields():
    entry = LabelEntry(drug_name="BASIT İLAÇ", instructions="Günde 1x1")
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "basit.pdf")
        build_label_pdf(SAMPLE_PROFILE, [entry], output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_a4_grid_with_qr_enabled():
    profile = dict(SAMPLE_PROFILE, label_template="a4_grid_6", qr_enabled=True)
    entries = [
        LabelEntry(
            drug_name="PAROL 500MG 20 TABLET",
            kullanim_amaci_tani="Ağrı ve ateş düşürücü",
            instructions="Günde 3x1 tok karnına yutulacak",
        )
    ]
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "qr.pdf")
        build_label_pdf(profile, entries, output_path)
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0


def test_thermal_template_ignores_qr_enabled():
    # QR kod yalnızca A4 ızgara şablonunda gösterilir; termal şablonda
    # qr_enabled=True olsa bile hata vermeden, QR olmadan basılabilmeli.
    profile = dict(SAMPLE_PROFILE, qr_enabled=True)
    entry = LabelEntry(drug_name="BASIT İLAÇ", instructions="Günde 1x1")
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "thermal_qr.pdf")
        build_label_pdf(profile, [entry], output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_with_patient_note_and_storage():
    entry = LabelEntry(
        drug_name="PAROL 500MG 20 TABLET",
        instructions="Günde 3x1 tok karnına yutulacak",
        patient_name="Ahmet Yılmaz",
        patient_note="Penisilin alerjisi (çok uzun bir not olsa bile satır taşmamalı ve kesilmeli test testtest)",
        storage_note="25°C altında saklayınız.",
    )
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "not_test.pdf")
        build_label_pdf(SAMPLE_PROFILE, [entry], output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_with_warning_tags_and_barcode():
    entry = LabelEntry(
        drug_name="PAROL 500MG 20 TABLET",
        instructions="Günde 2x1 tok karnına yutulacak",
        warning_tags=["Çalkalayınız", "Uyku Yapabilir"],
        print_barcode=True,
        barcode_value="8699500000001",
    )
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "warning_barcode.pdf")
        build_label_pdf(SAMPLE_PROFILE, [entry], output_path)
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0


def test_build_label_pdf_with_dose_grid_and_refill_date():
    from eczane_etiket.label_pdf import get_system_printers, print_pdf

    entry = LabelEntry(
        drug_name="AUGMENTIN 1000MG 14 TABLET",
        package_info="14 Tablet",
        kullanim_amaci_tani="Antibiyotik Tedavisi",
        instructions="Günde 2x1 Sabah Akşam Tok",
        refill_date="15.02.2026",
        dose_grid={"sabah": "1", "öğle": "-", "akşam": "1", "gece": "-"},
        print_dose_grid=True,
    )
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = os.path.join(tmp_dir, "grid_refill.pdf")
        build_label_pdf(SAMPLE_PROFILE, [entry], output_path)
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0


def test_get_system_printers_returns_list():
    from eczane_etiket.label_pdf import get_system_printers
    printers = get_system_printers()
    assert isinstance(printers, list)
    # Hata fırlatmamalı ve liste tipinde dönmeli

