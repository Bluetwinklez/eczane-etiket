"""Resmi ilaç listesini (SGK/Sağlık Bakanlığı CSV/Excel) içe aktarma.

API'den bağımsız, her zaman çalışan bir yedek yoldur. Sütun adları
dosyadan dosyaya değişebildiği için başlıklar anahtar kelimeyle eşleştirilir;
kullanıcı isterse eşlemeyi elle de belirtebilir (`column_map`).
"""

import csv
from pathlib import Path
from typing import Optional

from .data import DEFAULT_SAKLAMA_KOSULU, Drug, save_drug_list

NAME_HEADER_HINTS = ["ilaç adı", "ilac adi", "ürün adı", "urun adi", "name", "ad"]
FORM_HEADER_HINTS = ["form", "farmasötik şekil", "farmasotik sekil", "şekil", "sekil"]
PURPOSE_HEADER_HINTS = ["kullanım amacı", "kullanim amaci", "endikasyon"]
PROSPEKTUS_HEADER_HINTS = ["prospektüs", "prospektus", "kısa bilgi", "kisa bilgi", "açıklama", "aciklama"]
SAKLAMA_HEADER_HINTS = ["saklama", "storage"]
BARCODE_HEADER_HINTS = ["barkod", "barcode", "gtin"]

FORM_KEYWORDS = {
    "tablet": ["TABLET", "DRAJE", "ÇİĞNEME", "CIGNEME"],
    "kapsul": ["KAPSUL", "KAPSÜL"],
    "surup": ["ŞURU", "SURU"],  # "şurup"/"şurubu" gibi çekimli halleri de yakalar
    "damla": ["DAMLA"],
    "merhem_krem": ["KREM", "MERHEM", "POMAD", "JEL", "GEL"],
    "supozituvar": ["SUPOZITUVAR", "SÜPOZİTUVAR", "FITIL"],
    "sprey": ["SPREY", "SPRAY"],
}


def guess_form_from_name(name: str) -> str:
    upper = name.upper()
    for form, keywords in FORM_KEYWORDS.items():
        if any(kw in upper for kw in keywords):
            return form
    return "tablet"


def _normalize_header(header: str) -> str:
    return header.strip().casefold()


def guess_column_mapping(headers: list) -> dict:
    """Başlık listesinden {logical_field: original_header} eşlemesi tahmin eder."""
    normalized = {_normalize_header(h): h for h in headers}
    mapping = {}
    for logical, hints in (
        ("name", NAME_HEADER_HINTS),
        ("form", FORM_HEADER_HINTS),
        ("kullanim_amaci", PURPOSE_HEADER_HINTS),
        ("kisa_prospektus", PROSPEKTUS_HEADER_HINTS),
        ("saklama_kosulu", SAKLAMA_HEADER_HINTS),
        ("barcode", BARCODE_HEADER_HINTS),
    ):
        for norm_header, original in normalized.items():
            if any(hint in norm_header for hint in hints):
                mapping[logical] = original
                break
    return mapping


def _read_csv_rows(path: Path) -> tuple:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        headers = reader.fieldnames or []
    return headers, rows


def _read_excel_rows(path: Path) -> tuple:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = wb.active
    rows_iter = sheet.iter_rows(values_only=True)
    headers = [str(h) if h is not None else "" for h in next(rows_iter)]
    rows = []
    for values in rows_iter:
        row = {headers[i]: values[i] for i in range(len(headers)) if i < len(values)}
        rows.append(row)
    return headers, rows


def read_file_rows(path: str) -> tuple:
    """Dosyayı okuyup (headers, rows) döner. .csv ve .xlsx destekler."""
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        return _read_excel_rows(p)
    return _read_csv_rows(p)


def import_drug_list(path: str, column_map: Optional[dict] = None, save: bool = True) -> list:
    """CSV/Excel dosyasından ilaç listesi içe aktarır.

    `column_map` verilmezse başlıklar otomatik tahmin edilir. `name` sütunu
    bulunamayan satırlar atlanır. Form belirtilmemişse ilaç adından tahmin edilir.
    """
    headers, rows = read_file_rows(path)
    mapping = column_map or guess_column_mapping(headers)
    name_col = mapping.get("name")
    if not name_col:
        raise ValueError(
            "İlaç adı sütunu bulunamadı. Lütfen sütun eşlemesini elle belirtin."
        )
    form_col = mapping.get("form")
    purpose_col = mapping.get("kullanim_amaci")
    prospektus_col = mapping.get("kisa_prospektus")
    saklama_col = mapping.get("saklama_kosulu")
    barcode_col = mapping.get("barcode")

    drugs = []
    for row in rows:
        name = row.get(name_col)
        if not name:
            continue
        name = str(name).strip()
        form = str(row.get(form_col)).strip().lower() if form_col and row.get(form_col) else None
        if not form:
            form = guess_form_from_name(name)
        purpose = row.get(purpose_col) if purpose_col else None
        purpose = str(purpose).strip() if purpose else None
        prospektus = row.get(prospektus_col) if prospektus_col else None
        prospektus = str(prospektus).strip() if prospektus else None
        saklama = row.get(saklama_col) if saklama_col else None
        saklama = str(saklama).strip() if saklama else DEFAULT_SAKLAMA_KOSULU
        barcode = row.get(barcode_col) if barcode_col else None
        barcode = str(barcode).strip() if barcode else None
        drugs.append(Drug(
            name=name, form=form, kullanim_amaci=purpose,
            kisa_prospektus=prospektus, saklama_kosulu=saklama, barcode=barcode,
        ).to_dict())

    if save:
        save_drug_list(drugs)
    return drugs
