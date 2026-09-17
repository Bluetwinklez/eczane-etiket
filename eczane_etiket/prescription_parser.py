"""Reçete metni ayrıştırma — "Hızlı Yapıştır".

ÖNEMLİ: Bu bir Medula ENTEGRASYONU DEĞİLDİR. Medula'nın eczane/provizyon
tarafı için genel, dokümante edilmiş bir API bulunmadığından (yalnızca
eczanenin kendi SGK kimlik bilgileriyle giriş yaptığı kapalı bir portaldır),
bu proje Medula'ya canlı/otomatik bağlanmaz (bkz. README).

Bunun yerine eczacı, Medula ekranındaki (ya da elle yazılmış/başka bir
kaynaktan kopyalanmış) reçete metnini kopyalayıp buraya yapıştırır. Bu
modül metni satır satır ayrıştırır, her satırı bilinen ilaç listesiyle
eşleştirmeye çalışır ve toplu etiket moduna aktarılabilecek taslak
girişler üretir. Eşleşme SEZGİSELDİR ve kesin değildir — eczacı sonucu
her zaman gözden geçirip yazdırmadan önce düzeltmelidir.
"""

import re
from dataclasses import dataclass
from typing import Optional

from . import data

_LEADING_NUMBER_RE = re.compile(r"^\s*\d+[\.\)\-]\s*")
_SEPARATORS = (" - ", " – ", ": ", " : ")

# Reçete başlık/üstveri satırları (ilaç olarak algılanmamalıdır)
_METADATA_PATTERNS = [
    re.compile(r"^(?:hasta\s*ad[ıi]\s*soyad[ıi]|hasta\s*ad[ıi]|hasta|say[ıi]n|ad[ıi]\s*soyad[ıi])\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:t\.?c\.?\s*(?:kimlik)?(?:\s*no)?)\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:e-?re[çc]ete\s*no|re[çc]ete\s*no|protokol(?:\s*no)?|takip\s*no)\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:re[çc]ete\s*tarihi|tarih)\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:doktor|hekim|dr\.?|uzm\.?\s*dr\.?|prof\.?\s*dr\.?|op\.?\s*dr\.?)\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:tan[ıi]|te[şs]his)\s*[:\-]\s*(.+)$", re.IGNORECASE),
    re.compile(r"^(?:sgk|medula|provizyon|sosyal\s+güvenlik\s+kurumu)", re.IGNORECASE),
]

_DOSAGE_INLINE_RE = re.compile(
    r"\s+((?:günde\s+)?\d+\s*[xX\*]\s*\d+.*|(?:sabah|öğle|akşam|gece)\s+.*)$",
    re.IGNORECASE,
)


@dataclass
class ParsedLine:
    raw_line: str
    drug_name: str
    instructions: str
    matched_drug: Optional[dict]


def is_metadata_line(line: str) -> bool:
    """Satırın hasta adı, reçete no, tarih veya SGK başlığı olup olmadığını belirler."""
    stripped = line.strip()
    return any(p.search(stripped) for p in _METADATA_PATTERNS)


def extract_prescription_metadata(text: str) -> dict:
    """Yapıştırılan reçete metninden hasta adı ve tanı gibi bilgileri çıkarır."""
    meta = {"patient_name": None, "diagnosis": None}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        p_match = re.search(r"^(?:hasta\s*ad[ıi]\s*soyad[ıi]|hasta\s*ad[ıi]|hasta|say[ıi]n|ad[ıi]\s*soyad[ıi])\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if p_match and not meta["patient_name"]:
            meta["patient_name"] = p_match.group(1).strip()
            continue
        d_match = re.search(r"^(?:tan[ıi]|te[şs]his)\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if d_match and not meta["diagnosis"]:
            meta["diagnosis"] = d_match.group(1).strip()
    return meta


def _split_name_and_instructions(line: str) -> tuple:
    for sep in _SEPARATORS:
        if sep in line:
            name, _, rest = line.partition(sep)
            return name.strip(), rest.strip()

    # Dozaj deseni eşleşmesi (ör. "AUGMENTIN BID 1000MG 14 TB 2x1 tok")
    dosage_match = _DOSAGE_INLINE_RE.search(line)
    if dosage_match:
        name = line[:dosage_match.start()].strip()
        instructions = dosage_match.group(1).strip()
        if name:
            return name, instructions

    # Ayırıcı yoksa: ilk birkaç kelimeyi ilaç adı, gerisini talimat kabul et
    parts = line.split()
    if len(parts) > 4:
        return " ".join(parts[:4]), " ".join(parts[4:])
    return line.strip(), ""


def _match_drug(name_guess: str, drugs: list) -> Optional[dict]:
    if not name_guess:
        return None
    q = name_guess.casefold()
    for d in drugs:
        if d["name"].casefold() == q:
            return d

    q_norm = data.turkish_normalize(name_guess)
    for d in drugs:
        if data.turkish_normalize(d["name"]) == q_norm:
            return d

    contains = [d for d in drugs if q in d["name"].casefold() or d["name"].casefold() in q or q_norm in data.turkish_normalize(d["name"])]
    if len(contains) == 1:
        return contains[0]

    first_word = q.split()[0] if q.split() else q
    first_norm = data.turkish_normalize(first_word)
    if len(first_word) >= 3:
        starts_with = [d for d in drugs if d["name"].casefold().startswith(first_word) or data.turkish_normalize(d["name"]).startswith(first_norm)]
        if len(starts_with) == 1:
            return starts_with[0]
    return None


def parse_prescription_text(text: str, drugs: Optional[list] = None) -> list:
    """Yapıştırılan reçete metnini satır satır ayrıştırır.

    Her boş olmayan ilaç satırı bağımsız bir ilaç kabul edilir.
    Hasta adı, reçete no, tarih gibi başlık satırları otomatik atlanır.
    Baştaki "1-", "2)" gibi sıra numaraları temizlenir.
    """
    if drugs is None:
        drugs = data.load_drug_list()
    results = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if is_metadata_line(line):
            continue
        line = _LEADING_NUMBER_RE.sub("", line)
        name_guess, instructions = _split_name_and_instructions(line)
        matched = _match_drug(name_guess, drugs)
        results.append(
            ParsedLine(
                raw_line=raw_line.strip(),
                drug_name=matched["name"] if matched else name_guess,
                instructions=instructions,
                matched_drug=matched,
            )
        )
    return results

