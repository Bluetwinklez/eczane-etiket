from eczane_etiket import prescription_parser
from eczane_etiket.data import DRUGS_SEED

DRUGS = [d.to_dict() for d in DRUGS_SEED]


def test_parses_line_with_dash_separator():
    text = "PAROL 500MG 20 TABLET - Günde 3x1 tok karnına yutulacak"
    result = prescription_parser.parse_prescription_text(text, DRUGS)
    assert len(result) == 1
    line = result[0]
    assert line.matched_drug is not None
    assert line.drug_name == "PAROL 500MG 20 TABLET"
    assert line.instructions == "Günde 3x1 tok karnına yutulacak"


def test_strips_leading_numbering():
    text = "1) MAJEZIK 100MG 10 TABLET: Ağrı olunca 1 adet"
    result = prescription_parser.parse_prescription_text(text, DRUGS)
    assert result[0].matched_drug["name"] == "MAJEZIK 100MG 10 TABLET"
    assert result[0].instructions == "Ağrı olunca 1 adet"


def test_multiple_lines_parsed_independently():
    text = "\n".join(
        [
            "PAROL 500MG 20 TABLET - Günde 3x1",
            "",  # boş satır atlanmalı
            "NEXIUM 40MG 14 KAPSÜL - Sabah aç karnına",
        ]
    )
    result = prescription_parser.parse_prescription_text(text, DRUGS)
    assert len(result) == 2
    assert result[0].matched_drug["name"] == "PAROL 500MG 20 TABLET"
    assert result[1].matched_drug["name"] == "NEXIUM 40MG 14 KAPSÜL"


def test_unmatched_drug_returns_none_but_keeps_guess():
    text = "BILINMEYEN ILAC XYZ - bir talimat"
    result = prescription_parser.parse_prescription_text(text, DRUGS)
    assert result[0].matched_drug is None
    assert result[0].drug_name == "BILINMEYEN ILAC XYZ"


def test_empty_text_returns_empty_list():
    assert prescription_parser.parse_prescription_text("   \n\n  ", DRUGS) == []
