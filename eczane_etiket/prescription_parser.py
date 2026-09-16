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


@dataclass
class ParsedLine:
    raw_line: str
    drug_name: str
    instructions: str
    matched_drug: Optional[dict]


def _split_name_and_instructions(line: str) -> tuple:
    for sep in _SEPARATORS:
        if sep in line:
            name, _, rest = line.partition(sep)
            return name.strip(), rest.strip()
    # Ayırıcı yoksa: ilk birkaç kelimeyi ilaç adı, gerisini talimat kabul et
    # (kaba bir tahmindir; kullanıcı önizlemede düzeltebilir).
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
    contains = [d for d in drugs if q in d["name"].casefold() or d["name"].casefold() in q]
    if len(contains) == 1:
        return contains[0]
    first_word = q.split()[0] if q.split() else q
    if len(first_word) >= 3:
        starts_with = [d for d in drugs if d["name"].casefold().startswith(first_word)]
        if len(starts_with) == 1:
            return starts_with[0]
    return None


def parse_prescription_text(text: str, drugs: Optional[list] = None) -> list:
    """Yapıştırılan reçete metnini satır satır ayrıştırır.

    Her boş olmayan satır bağımsız bir ilaç satırı kabul edilir. Baştaki
    "1-", "2)" gibi sıra numaraları atılır. Dönüş: list[ParsedLine].
    """
    if drugs is None:
        drugs = data.load_drug_list()
    results = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
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
