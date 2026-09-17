"""İlaç kayıtları ve farmasötik şekle (form) göre hızlı talimat şablonları.

`DRUGS_SEED` yalnızca yaygın bilinen, iyi belgelenmiş ürünlerden oluşan
küçük bir örnek listedir - eczanenin gerçek/güncel ilaç envanteri değildir.
Kapsamlı ve resmi ilaç listesi ya `drug_api.py` üzerinden (varsayılan:
turkish-medicine-api) ya da `drug_import.py` ile CSV/Excel içe aktararak
elde edilir (bkz. plan: Medula'ya canlı bağlanılmıyor).
"""

from dataclasses import asdict, dataclass
import datetime as _dt
import re
from typing import Optional

from .jsonutil import read_json, write_json
from .paths import DRUGS_FILE, TEMPLATES_FILE

FORM_LABELS = {
    "tablet": "Tablet",
    "kapsul": "Kapsül",
    "surup": "Şurup",
    "damla": "Damla",
    "merhem_krem": "Merhem / Krem",
    "supozituvar": "Süpozituvar",
    "sprey": "Sprey",
}


DEFAULT_SAKLAMA_KOSULU = (
    "Çocukların göremeyeceği, erişemeyeceği yerlerde ve ambalajında saklayınız. "
    "25°C'nin altındaki oda sıcaklığında saklayınız."
)


@dataclass
class Drug:
    name: str
    form: str = "tablet"
    kullanim_amaci: Optional[str] = None
    kisa_prospektus: Optional[str] = None
    saklama_kosulu: Optional[str] = None
    barcode: Optional[str] = None
    use_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# Küçük örnek/seed liste. `kullanim_amaci` (tek satır özet) ve
# `kisa_prospektus` (hastaya yönelik 1-2 cümlelik "ne işe yarar" açıklaması)
# yalnızca genel bilinirlikte, tartışmasız bilgilerle dolduruldu; emin
# olunmayan alanlar uydurulmadı ve boş (None) bırakıldı. Bu alan resmi bir
# kısa ürün bilgisi/kullanma talimatının (KÜB/KT) yerine geçmez — sadece
# hastanın ilacı tanımasına yardımcı, bilgilendirici kısa bir nottur.
DRUGS_SEED = [
    Drug("PAROL 500MG 20 TABLET", "tablet", "Ağrı ve ateş düşürücü",
         "Baş ağrısı, adet ağrısı, kas-eklem ağrısı ve ateşli durumlarda kullanılan bir ağrı kesici/ateş düşürücüdür.",
         barcode="8699525095328"),
    Drug("MAJEZIK 100MG 10 TABLET", "tablet", "Ağrı kesici",
         "Kas, eklem ve adet ağrıları gibi orta şiddetli ağrılarda kullanılan bir ağrı kesicidir.",
         barcode="8699525093782"),
    Drug("ARVELES 25MG 20 FILM TABLET", "tablet", "Ağrı kesici",
         "Ağrı ve iltihabı azaltan, kas-iskelet sistemi ağrılarında sık kullanılan bir ilaçtır.",
         barcode="8699514092415"),
    Drug("NUROFEN 400MG 20 TABLET", "tablet", "Ağrı ve ateş düşürücü",
         "Ağrı, ateş ve iltihabı azaltmak için kullanılan bir ağrı kesici/ateş düşürücüdür.",
         barcode="8699546091019"),
    Drug("AUGMENTIN BID 1000MG 14 TABLET", "tablet", "Antibiyotik",
         "Bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotiktir; doktorun belirttiği süre boyunca düzenli kullanılmalıdır.",
         barcode="8699546090234"),
    Drug("CORASPIN 100MG 30 TABLET", "tablet", "Kan sulandırıcı",
         "Kalp-damar hastalıklarında pıhtı oluşumunu önlemeye yardımcı, düşük doz kan sulandırıcı bir ilaçtır.",
         barcode="8699546011314"),
    Drug("CONCOR 5MG 28 TABLET", "tablet", "Tansiyon / kalp ritmi düzenleyici",
         "Yüksek tansiyon ve bazı kalp ritmi bozukluklarının tedavisinde kullanılan bir ilaçtır.",
         barcode="8699546012014"),
    Drug("CIPRO 500MG 10 TABLET", "tablet", "Antibiyotik",
         "Bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotiktir; doktorun belirttiği süre boyunca düzenli kullanılmalıdır.",
         barcode="8699546090210"),
    Drug("CATAFLAM 50MG 20 DRAJE", "tablet", "Ağrı ve iltihap giderici",
         "Ağrı ve iltihabı azaltmak için kullanılan bir ilaçtır.",
         barcode="8699504120159"),
    Drug("RENNIE 24 ÇİĞNEME TABLETİ", "tablet", "Mide ekşimesi giderici",
         "Mide ekşimesi ve hazımsızlık şikayetlerini hafifletmek için kullanılan bir antasittir.",
         barcode="8699546012212"),
    Drug("ZYRTEC 10MG 20 TABLET", "tablet", "Alerji giderici (antihistaminik)",
         "Alerjik rahatsızlıklara bağlı kaşıntı, hapşırma ve burun akıntısı gibi belirtileri hafifletmek için kullanılır.",
         barcode="8699546090418"),
    Drug("METPAMID 10MG 30 TABLET", "tablet", None, None),
    Drug("NEXIUM 40MG 14 KAPSÜL", "kapsul", "Mide asidini azaltıcı",
         "Mide asidinin fazla salgılanmasına bağlı reflü ve yanma şikayetlerinde kullanılan bir ilaçtır.",
         barcode="8699546090319"),
    Drug("DEPRIM FORTE 30 KAPSÜL", "kapsul", None, None),
    Drug("PROSPAN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici (bitkisel)",
         "Bitkisel içerikli, öksürüğü yumuşatmaya yardımcı bir şuruptur."),
    Drug("CALPOL 120MG/5ML ŞURUP 100ML", "surup", "Ağrı ve ateş düşürücü (pediatrik)",
         "Çocuklarda ağrı ve ateşi düşürmek için kullanılan bir şuruptur.",
         barcode="8699546570118"),
    Drug("NOTUSSIN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici",
         "Öksürüğü hafifletmeye yardımcı bir şuruptur."),
    Drug("D VİTAMİNİ DAMLA 15ML", "damla", "D vitamini takviyesi",
         "D vitamini eksikliğini desteklemek amacıyla kullanılan bir takviyedir."),
    Drug("BEBEKOL GAZ DAMLASI 30ML", "damla", "Bebeklerde gaz sancısını giderici",
         "Bebeklerde sindirim kaynaklı gaz sancısını hafifletmeye yardımcı bir damladır."),
    Drug("OPTIVE GÖZ DAMLASI 10ML", "damla", "Göz kuruluğunu giderici",
         "Göz kuruluğu şikayetlerini hafifletmek için kullanılan yapay gözyaşı damlasıdır."),
    Drug("OTRIVINE BURUN SPREYİ 10ML", "sprey", "Nazal konjesyonu (burun tıkanıklığını) açıcı",
         "Burun tıkanıklığını geçici olarak açmaya yardımcı bir burun spreyidir.",
         barcode="8699504540117"),
    Drug("COLDAMIN BOĞAZ SPREYİ", "sprey", "Boğaz ağrısını giderici",
         "Boğaz ağrısı ve tahrişini hafifletmeye yardımcı bir boğaz spreyidir."),
    Drug("VOLTAREN EMULGEL 100GR", "merhem_krem", "Ağrı ve iltihap giderici jel",
         "Kas ve eklem ağrılarında cilt üzerine uygulanan, ağrı ve iltihabı azaltan bir jeldir.",
         barcode="8699504340113"),
    Drug("BEPANTHEN KREM 30GR", "merhem_krem", "Cilt tahrişini/pişiği önleyici",
         "Cilt tahrişi ve bebek pişiğini önlemeye/iyileştirmeye yardımcı bir kremdir.",
         barcode="8699546350116"),
    Drug("FUCIDIN KREM 15GR", "merhem_krem", "Bakteriyel cilt enfeksiyonu tedavisi",
         "Ciltte bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotikli kremdir.",
         barcode="8699546350123"),
    Drug("WILKINSON POMAD %12,5 100GR", "merhem_krem", "Kaşıntı, kızarıklık ve uyuz tedavisi",
         "Uyuz gibi cilt parazitlerine bağlı kaşıntı ve kızarıklığın tedavisinde kullanılan bir pomaddır."),
    Drug("DOLOREX FORT SÜPOZİTUVAR 10 ADET", "supozituvar", "Ağrı kesici",
         "Ağız yoluyla ilaç alınamadığında kullanılabilen bir ağrı kesici süpozituvardır.",
         barcode="8699504120166"),
    Drug("DULCOLAX 5MG SÜPOZİTUVAR 6 ADET", "supozituvar", "Kabızlık giderici",
         "Kabızlığı gidermeye yardımcı, rektal yolla uygulanan bir müshildir."),
    Drug("GRİPİN 10 TABLET", "tablet", "Soğuk algınlığı belirtilerini hafifletici",
         "Baş ağrısı, ateş ve vücut ağrısı gibi soğuk algınlığı belirtilerini hafifletmek için kullanılan bir ilaçtır.",
         barcode="8699508010111"),
    Drug("TALCID 20 ÇİĞNEME TABLETİ", "tablet", "Mide ekşimesi giderici",
         "Mide ekşimesi ve hazımsızlık şikayetlerini hafifletmek için kullanılan bir antasittir."),
    Drug("BUSCOPAN 10MG 20 DRAJE", "tablet", "Karın kramp/ağrısını giderici",
         "Karın bölgesindeki kas kramplarına bağlı ağrıları hafifletmek için kullanılan bir ilaçtır.",
         barcode="8699546012021"),
    Drug("FERROGRAD 325MG 30 TABLET", "tablet", "Demir takviyesi",
         "Demir eksikliğini desteklemek amacıyla kullanılan bir takviyedir."),
    Drug("MAGNEZYUM 375MG 30 TABLET", "tablet", "Magnezyum takviyesi",
         "Magnezyum eksikliğini desteklemek amacıyla kullanılan bir takviyedir."),
    Drug("ORAMED B12 DAMLA 20ML", "damla", "B12 vitamini takviyesi",
         "B12 vitamini eksikliğini desteklemek amacıyla kullanılan bir damladır."),
    Drug("FUCİTHALMİC GÖZ DAMLASI", "damla", "Bakteriyel göz enfeksiyonu tedavisi",
         "Gözde bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotikli damladır."),
]

# Saklama koşulu ayrıca belirtilmemiş ürünlere Türkiye'de ilaç ambalajlarında
# standart olarak yer alan genel saklama uyarısı uygulanır (ilaca özgü bir
# istisna biliniyorsa yukarıda Drug(...) çağrısına `saklama_kosulu=...`
# eklenip buradaki varsayılanın önüne geçirilebilir).
for _drug in DRUGS_SEED:
    if _drug.saklama_kosulu is None:
        _drug.saklama_kosulu = DEFAULT_SAKLAMA_KOSULU
del _drug

# Farmasötik şekle göre varsayılan hızlı talimat butonları. Kullanıcı bunları
# Admin Panelinden (templates.json aracılığıyla) düzenleyebilir.
INSTRUCTION_TEMPLATES_BY_FORM = {
    "tablet": [
        "Günde 1x1 tok karnına yutulacak",
        "Günde 2x1 tok karnına yutulacak",
        "Günde 3x1 tok karnına yutulacak",
        "Günde 1x1 aç karnına yutulacak",
        "Gece yatarken 1 adet yutulacak",
        "Ağrı olduğunda 1 adet yutulacak",
    ],
    "kapsul": [
        "Günde 1x1 tok karnına yutulacak",
        "Günde 2x1 tok karnına yutulacak",
        "Sabah aç karnına 1 kapsül yutulacak",
    ],
    "surup": [
        "Günde 3x1 ölçek (5ml) içilecek",
        "Günde 2x1 ölçek (5ml) içilecek",
        "İhtiyaç halinde günde en fazla 3 kez 1 ölçek içilecek",
    ],
    "damla": [
        "Günde 3x 1-2 damla damlatılacak",
        "Günde 1x birkaç damla damlatılacak",
        "Doktorun belirttiği doz kadar damlatılacak",
    ],
    "merhem_krem": [
        "Günde 1x ince tabaka halinde sürülecek",
        "Günde 2x ince tabaka halinde sürülecek",
        "Etkilenen bölgeye hafifçe masaj yaparak sürülecek",
    ],
    "supozituvar": [
        "Günde 1x rektal yolla uygulanacak",
        "Günde 2x rektal yolla uygulanacak",
        "İhtiyaç halinde günde en fazla 2 kez uygulanacak",
    ],
    "sprey": [
        "Günde 2-3x her burun deliğine 1 püskürtme",
        "Günde 3x boğaza 1-2 püskürtme",
    ],
}

DEFAULT_FORM = "tablet"


def _load_templates_override() -> dict:
    return read_json(TEMPLATES_FILE, {})


def get_instruction_templates(form: str) -> list:
    override = _load_templates_override()
    if form in override and isinstance(override[form], list):
        valid = [t for t in override[form] if isinstance(t, str) and "\ufffd" not in t]
        if valid:
            return valid
    return INSTRUCTION_TEMPLATES_BY_FORM.get(form, [])


def save_instruction_templates(form: str, templates: list) -> None:
    override = _load_templates_override()
    override[form] = templates
    write_json(TEMPLATES_FILE, override)


def _seed_as_dicts() -> list:
    return [d.to_dict() for d in DRUGS_SEED]


def _normalize_drug_dict(d: dict) -> dict:
    name = d.get("name", "")
    form = d.get("form", "tablet")
    if form == "merhem":
        form = "merhem_krem"
    kullanim_amaci = d.get("kullanim_amaci") or d.get("banner")
    kisa_prospektus = d.get("kisa_prospektus") or d.get("detail")
    saklama_kosulu = d.get("saklama_kosulu") or DEFAULT_SAKLAMA_KOSULU
    barcode = d.get("barcode")
    use_count = d.get("use_count", d.get("usage_count", 0))
    return {
        "name": name,
        "form": form,
        "kullanim_amaci": kullanim_amaci,
        "kisa_prospektus": kisa_prospektus,
        "saklama_kosulu": saklama_kosulu,
        "barcode": barcode,
        "use_count": use_count,
    }


def load_drug_list() -> list:
    """Önbellekteki (API'den çekilmiş/içe aktarılmış) listeyi, yoksa seed listeyi döner.

    Kullanım sayısına (favoriler) göre azalan sırada döner.
    """
    cached = read_json(DRUGS_FILE, None)
    if cached is None:
        drugs = _seed_as_dicts()
    else:
        drugs = [_normalize_drug_dict(d) for d in cached if isinstance(d, dict)]
    return sorted(drugs, key=lambda d: d.get("use_count", 0), reverse=True)


def save_drug_list(drugs: list) -> None:
    write_json(DRUGS_FILE, drugs)


def update_drug(old_name: str, **fields) -> Optional[dict]:
    """Mevcut bir ilacın alanlarını günceller ve kaydeder."""
    drugs = load_drug_list()
    for d in drugs:
        if d["name"] == old_name:
            d.update(fields)
            save_drug_list(drugs)
            return d
    return None


def bump_use_count(drug_name: str) -> None:
    drugs = read_json(DRUGS_FILE, None) or _seed_as_dicts()
    found = False
    for d in drugs:
        if d["name"] == drug_name:
            d["use_count"] = d.get("use_count", 0) + 1
            found = True
            break
    if found:
        save_drug_list(drugs)


_TR_MAP = str.maketrans({
    "İ": "i", "I": "ı", "ı": "i",
    "Ğ": "g", "ğ": "g",
    "Ü": "u", "ü": "u",
    "Ş": "s", "ş": "s",
    "Ö": "o", "ö": "o",
    "Ç": "c", "ç": "c",
})


def turkish_normalize(text: str) -> str:
    """Türkçe karakterleri (İ, ı, ş, ğ, ü, ö, ç) normalize ederek aramalarda klavye farklarını çözer."""
    if not text:
        return ""
    return text.translate(_TR_MAP).casefold()


def search_drugs(query: str, drugs: Optional[list] = None) -> list:
    """Canlı arama: Türkçe karakter ve klavye duyarsız, öncelikli akıllı sıralama.

    1. Tam isim eşleşmesi
    2. İsim başlangıcı eşleşmesi
    3. Alt dize eşleşmesi
    Eşleşenler kullanım sıklığına (use_count) göre sıralanır.
    """
    if drugs is None:
        drugs = load_drug_list()
    q = query.strip()
    if not q:
        return drugs

    q_case = q.casefold()
    q_norm = turkish_normalize(q)

    matched = []
    for d in drugs:
        name = d["name"]
        name_case = name.casefold()
        name_norm = turkish_normalize(name)

        if q_case in name_case or q_norm in name_norm:
            if name_case == q_case or name_norm == q_norm:
                score = 0
            elif name_case.startswith(q_case) or name_norm.startswith(q_norm):
                score = 1
            else:
                score = 2
            matched.append((score, -d.get("use_count", 0), d))

    matched.sort(key=lambda x: (x[0], x[1]))
    return [item[2] for item in matched]


def find_drug(name: str, drugs: Optional[list] = None) -> Optional[dict]:
    """İlaç adına göre tam, büyük/küçük harf duyarsız ve Türkçe normalize arama yapar."""
    if drugs is None:
        drugs = load_drug_list()
    target = name.strip()
    if not target:
        return None

    # 1. Birebir tam eşleşme
    for d in drugs:
        if d["name"] == target:
            return d

    # 2. Casefold eşleşme
    target_case = target.casefold()
    for d in drugs:
        if d["name"].casefold() == target_case:
            return d

    # 3. Türkçe normalize eşleşme
    target_norm = turkish_normalize(target)
    for d in drugs:
        if turkish_normalize(d["name"]) == target_norm:
            return d

    return None


def extract_gtin_from_karekod(raw: str) -> str:
    """Türk İlaç Takip Sistemi (İTS) 2D Karekod veya standart EAN-13 barkodundan GTIN numarasını ayıklar.

    Örnekler:
    - Standart 13 haneli EAN-13: '8699525095328' -> '8699525095328'
    - GS1 2D DataMatrix Karekod: '010869952509532821...' -> '8699525095328'
    """
    clean = re.sub(r"[^\w]", "", raw.strip())
    if len(clean) == 13 and clean.isdigit():
        return clean
    if clean.startswith("01") and len(clean) >= 16:
        gtin14 = clean[2:16]
        if gtin14.startswith("0"):
            return gtin14[1:]
        return gtin14
    return clean


def find_drug_by_barcode(barcode: str, drugs: Optional[list] = None) -> Optional[dict]:
    """Barkod okuyucudan gelen kodla (EAN-13 veya İTS 2D Karekod) eşleşen ilacı bulur."""
    raw = barcode.strip()
    if not raw:
        return None
    gtin = extract_gtin_from_karekod(raw)
    if drugs is None:
        drugs = load_drug_list()
    for d in drugs:
        b = str(d.get("barcode") or "").strip()
        if not b:
            continue
        if b == raw or b == gtin:
            return d
        if len(b) == 13 and len(gtin) == 14 and gtin.endswith(b):
            return d
        if len(b) == 14 and len(gtin) == 13 and b.endswith(gtin):
            return d
    return None


FOOD_INTERACTIONS = [
    ("Süt Ürünleri", "Süt, yoğurt ve antiasitlerle en az 2 saat arayla alınız."),
    ("Greyfurt", "Greyfurt veya greyfurt suyu ile birlikte tüketmeyiniz."),
    ("Çay / Kahve / Demir", "Çay, kahve ve sütle almayınız; emilimi azaltır."),
    ("Alkol Yasağı", "Tedavi süresince kesinlikle alkol tüketmeyiniz."),
    ("Yemekten Önce (Aç)", "Sabah kahvaltıdan 30 dakika önce aç karnına alınız."),
    ("Tok / Bol Su", "Yemekten hemen sonra en az 1 bardak bol su ile alınız."),
]

PEDIATRIC_TEMPLATES = [
    "Günde 3x1 Ölçek (5 ml) tok karnına",
    "Günde 2x1 Ölçek (5 ml) tok karnına",
    "Günde 3xYarım Ölçek (2.5 ml) tok karnına",
    "Günde 2xYarım Ölçek (2.5 ml) tok karnına",
    "Günde 3x10 Damla tok karnına",
    "Ateş veya ağrıda 1 Ölçek (5 ml)",
]


def extract_package_info(drug_name: str) -> Optional[str]:
    """İlaç adından ambalaj/kutu miktarını (ör. '20 Tablet', '100ml', '30 Kapsül') çıkarır."""
    if not drug_name:
        return None
    raw = drug_name.strip()
    pat = re.compile(
        r"(?<!/)\b(\d+(?:[.,]\d+)?\s*(?:film\s+tablet|çiğneme\s+tableti|ciğneme\s+tableti|cigneme\s+tableti|tablet[i]?|tb|kapsül[ü]?|kapsul|draje|saşe|sase|ölçek|olcek|ml|gr|gram|adet))\b",
        re.IGNORECASE,
    )
    matches = pat.findall(raw)
    if matches:
        return matches[-1].strip().title()
    return None


def calculate_refill_date(package_info: str, instructions: str, start_date: Optional[_dt.date] = None) -> Optional[str]:
    """Kutu ambalaj bilgisi (ör. 30 Tablet) ve günlük doza (ör. 1x1 veya 2x1) göre
    ilacın tahmini bitiş ve SGK'dan tekrar temin tarihini hesaplar.
    """
    if start_date is None:
        start_date = _dt.date.today()

    unit_match = re.search(
        r"(\d+)\s*(?:film\s+tablet|çiğneme\s+tableti|ciğneme\s+tableti|tablet[i]?|tb|kapsül[ü]?|kapsul|draje|saşe|ölçek|adet|ml|gr)?",
        package_info or "",
        re.IGNORECASE,
    )
    if not unit_match:
        return None
    try:
        total_units = int(unit_match.group(1))
    except Exception:
        return None

    if total_units <= 0:
        return None

    dose_match = re.search(r"(\d+)\s*[xX\*]\s*(\d+)", instructions or "")
    if dose_match:
        try:
            freq = int(dose_match.group(1))
            qty_per_dose = int(dose_match.group(2))
            daily_dose = max(1, freq * qty_per_dose)
        except Exception:
            daily_dose = 1
    else:
        instr_lower = (instructions or "").lower()
        if "3x" in instr_lower or "3 defa" in instr_lower:
            daily_dose = 3
        elif "2x" in instr_lower or "2 defa" in instr_lower:
            daily_dose = 2
        else:
            daily_dose = 1

    days = total_units // daily_dose
    if days <= 0:
        days = 1

    refill = start_date + _dt.timedelta(days=days)
    return refill.strftime("%d.%m.%Y")


def parse_dose_grid(instructions: str) -> dict[str, str]:
    """Talimat metninden (ör. '2x1 Sabah Akşam Tok', '3x1', '1x1 Gece')
    4'lü doz tablosu (Sabah, Öğle, Akşam, Gece) değerlerini çıkarır.
    """
    grid = {"sabah": "-", "öğle": "-", "akşam": "-", "gece": "-"}
    if not instructions:
        return grid

    raw = instructions.lower()
    qty = "1"
    if "1/2" in raw or "yarım" in raw or "buçuk" in raw:
        qty = "½"
    elif "2 tablet" in raw or "2 ölçek" in raw or "x2" in raw or "2 draje" in raw:
        qty = "2"

    has_sabah = "sabah" in raw
    has_ogle = "öğle" in raw or "ogle" in raw
    has_aksam = "akşam" in raw or "aksam" in raw
    has_gece = "gece" in raw or "yatarken" in raw

    if has_sabah or has_ogle or has_aksam or has_gece:
        if has_sabah:
            grid["sabah"] = qty
        if has_ogle:
            grid["öğle"] = qty
        if has_aksam:
            grid["akşam"] = qty
        if has_gece:
            grid["gece"] = qty
    else:
        m = re.search(r"(\d+)\s*[xX\*]\s*(\d+(?:[.,/]\d+)?)", raw)
        if m:
            freq = int(m.group(1))
            val = m.group(2).replace(",", "/")
            if val == "1/2":
                val = "½"
            if freq == 1:
                grid["sabah"] = val
            elif freq == 2:
                grid["sabah"] = val
                grid["akşam"] = val
            elif freq == 3:
                grid["sabah"] = val
                grid["öğle"] = val
                grid["akşam"] = val
            elif freq >= 4:
                grid["sabah"] = val
                grid["öğle"] = val
                grid["akşam"] = val
                grid["gece"] = val
        else:
            grid["sabah"] = qty

    return grid

