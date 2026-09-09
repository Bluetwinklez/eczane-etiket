from eczane_etiket import drug_import


def test_guess_form_from_name():
    assert drug_import.guess_form_from_name("PAROL 500MG 20 TABLET") == "tablet"
    assert drug_import.guess_form_from_name("PROSPAN ÖKSÜRÜK ŞURUBU 100ML") == "surup"
    assert drug_import.guess_form_from_name("VOLTAREN EMULGEL 100GR") == "merhem_krem"
    assert drug_import.guess_form_from_name("D VİTAMİNİ DAMLA 15ML") == "damla"
    assert drug_import.guess_form_from_name("DULCOLAX SÜPOZİTUVAR") == "supozituvar"
    assert drug_import.guess_form_from_name("OTRIVINE BURUN SPREYİ") == "sprey"
    # Hiçbir anahtar kelime geçmiyorsa varsayılan olarak tablet döner.
    assert drug_import.guess_form_from_name("BİLİNMEYEN ÜRÜN") == "tablet"


def test_guess_column_mapping_turkish_headers():
    headers = ["İlaç Adı", "Farmasötik Şekil", "Kullanım Amacı", "Barkod"]
    mapping = drug_import.guess_column_mapping(headers)
    assert mapping["name"] == "İlaç Adı"
    assert mapping["form"] == "Farmasötik Şekil"
    assert mapping["kullanim_amaci"] == "Kullanım Amacı"
    assert mapping["barcode"] == "Barkod"


def test_guess_column_mapping_missing_columns():
    mapping = drug_import.guess_column_mapping(["Rastgele Sütun"])
    assert "name" not in mapping


def test_import_drug_list_from_csv(tmp_path):
    csv_path = tmp_path / "ilaclar.csv"
    csv_path.write_text(
        "İlaç Adı,Farmasötik Şekil,Kullanım Amacı,Barkod\n"
        "TEST TABLET 10 ADET,tablet,Test amaçlı,8699999999999\n"
        "TEST ŞURUP 100ML,,Öksürük giderici,\n",
        encoding="utf-8",
    )
    drugs = drug_import.import_drug_list(str(csv_path), save=False)
    assert len(drugs) == 2
    assert drugs[0]["name"] == "TEST TABLET 10 ADET"
    assert drugs[0]["barcode"] == "8699999999999"
    # Form sütunu boş olan ikinci satırda form ilaç adından tahmin edilmeli.
    assert drugs[1]["form"] == "surup"
    assert drugs[1]["barcode"] is None
    # Saklama koşulu belirtilmemişse standart uyarı otomatik atanmalı.
    assert drugs[0]["saklama_kosulu"] == drug_import.DEFAULT_SAKLAMA_KOSULU


def test_import_drug_list_raises_without_name_column(tmp_path):
    csv_path = tmp_path / "gecersiz.csv"
    csv_path.write_text("Sütun1,Sütun2\nA,B\n", encoding="utf-8")
    try:
        drug_import.import_drug_list(str(csv_path), save=False)
        assert False, "ValueError bekleniyordu"
    except ValueError:
        pass


def test_import_drug_list_skips_empty_name_rows(tmp_path):
    csv_path = tmp_path / "ilaclar.csv"
    csv_path.write_text("name,form\nGeçerli İlaç,tablet\n,tablet\n", encoding="utf-8")
    drugs = drug_import.import_drug_list(str(csv_path), save=False)
    assert len(drugs) == 1
    assert drugs[0]["name"] == "Geçerli İlaç"


def test_import_drug_list_saves_when_requested(tmp_path, monkeypatch):
    monkeypatch.setattr(drug_import, "save_drug_list", lambda drugs: saved.append(drugs))
    saved = []
    csv_path = tmp_path / "ilaclar.csv"
    csv_path.write_text("name,form\nKayıt İlacı,tablet\n", encoding="utf-8")
    drug_import.import_drug_list(str(csv_path), save=True)
    assert len(saved) == 1
    assert saved[0][0]["name"] == "Kayıt İlacı"
