"""İlaç kayıtları ve farmasötik şekle (form) göre hızlı talimat şablonları.

`DRUGS_SEED` yalnızca yaygın bilinen, iyi belgelenmiş ürünlerden oluşan
küçük bir örnek listedir - eczanenin gerçek/güncel ilaç envanteri değildir.
Kapsamlı ve resmi ilaç listesi ya `drug_api.py` üzerinden (varsayılan:
turkish-medicine-api) ya da `drug_import.py` ile CSV/Excel içe aktararak
elde edilir (bkz. plan: Medula'ya canlı bağlanılmıyor).
"""

from dataclasses import asdict, dataclass
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


@dataclass
class Drug:
    name: str
    form: str = "tablet"
    kullanim_amaci: Optional[str] = None
    use_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# Küçük örnek/seed liste. `kullanim_amaci` yalnızca genel bilinirlikte,
# tartışmasız olan kısa özetlerle dolduruldu; emin olunmayan alanlar
# uydurulmadı ve boş (None) bırakıldı.
DRUGS_SEED = [
    Drug("PAROL 500MG 20 TABLET", "tablet", "Ağrı ve ateş düşürücü"),
    Drug("MAJEZIK 100MG 10 TABLET", "tablet", "Ağrı kesici"),
    Drug("ARVELES 25MG 20 FILM TABLET", "tablet", "Ağrı kesici"),
    Drug("NUROFEN 400MG 20 TABLET", "tablet", "Ağrı ve ateş düşürücü"),
    Drug("AUGMENTIN BID 1000MG 14 TABLET", "tablet", "Antibiyotik"),
    Drug("CORASPIN 100MG 30 TABLET", "tablet", "Kan sulandırıcı"),
    Drug("CONCOR 5MG 28 TABLET", "tablet", "Tansiyon / kalp ritmi düzenleyici"),
    Drug("CIPRO 500MG 10 TABLET", "tablet", "Antibiyotik"),
    Drug("CATAFLAM 50MG 20 DRAJE", "tablet", "Ağrı ve iltihap giderici"),
    Drug("RENNIE 24 ÇİĞNEME TABLETİ", "tablet", "Mide ekşimesi giderici"),
    Drug("ZYRTEC 10MG 20 TABLET", "tablet", "Alerji giderici (antihistaminik)"),
    Drug("METPAMID 10MG 30 TABLET", "tablet", None),
    Drug("NEXIUM 40MG 14 KAPSÜL", "kapsul", "Mide asidini azaltıcı"),
    Drug("DEPRIM FORTE 30 KAPSÜL", "kapsul", None),
    Drug("PROSPAN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici (bitkisel)"),
    Drug("CALPOL 120MG/5ML ŞURUP 100ML", "surup", "Ağrı ve ateş düşürücü (pediatrik)"),
    Drug("NOTUSSIN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici"),
    Drug("D VİTAMİNİ DAMLA 15ML", "damla", "D vitamini takviyesi"),
    Drug("BEBEKOL GAZ DAMLASI 30ML", "damla", "Bebeklerde gaz sancısını giderici"),
    Drug("OPTIVE GÖZ DAMLASI 10ML", "damla", "Göz kuruluğunu giderici"),
    Drug("OTRIVINE BURUN SPREYİ 10ML", "sprey", "Nazal konjesyonu (burun tıkanıklığını) açıcı"),
    Drug("COLDAMIN BOĞAZ SPREYİ", "sprey", "Boğaz ağrısını giderici"),
    Drug("VOLTAREN EMULGEL 100GR", "merhem_krem", "Ağrı ve iltihap giderici jel"),
    Drug("BEPANTHEN KREM 30GR", "merhem_krem", "Cilt tahrişini/pişiği önleyici"),
    Drug("FUCIDIN KREM 15GR", "merhem_krem", "Bakteriyel cilt enfeksiyonu tedavisi"),
    Drug("WILKINSON POMAD %12,5 100GR", "merhem_krem", "Kaşıntı, kızarıklık ve uyuz tedavisi"),
    Drug("DOLOREX FORT SÜPOZİTUVAR 10 ADET", "supozituvar", "Ağrı kesici"),
    Drug("DULCOLAX 5MG SÜPOZİTUVAR 6 ADET", "supozituvar", "Kabızlık giderici"),
]

# Farmasötik şekle göre varsayılan hızlı talimat butonları. Kullanıcı bunları
# Admin Panelinden (templates.json aracılığıyla) düzenleyebilir.
INSTRUCTION_TEMPLATES_BY_FORM = {
    "tablet": [
        "Günde 1x1 tok karnına yutulacak",
        "Günde 2x1 tok karnına yutulacak",
        "Günde 3x1 tok karnına yutulacak",
        "Günde 1x1 aç karnına yutulacak",
        "Ağrı olduğunda 1 tane, günde 3 taneden fazla alınmayacak",
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
    if form in override:
        return override[form]
    return INSTRUCTION_TEMPLATES_BY_FORM.get(form, [])


def save_instruction_templates(form: str, templates: list) -> None:
    override = _load_templates_override()
    override[form] = templates
    write_json(TEMPLATES_FILE, override)


def _seed_as_dicts() -> list:
    return [d.to_dict() for d in DRUGS_SEED]


def load_drug_list() -> list:
    """Önbellekteki (API'den çekilmiş/içe aktarılmış) listeyi, yoksa seed listeyi döner.

    Kullanım sayısına (favoriler) göre azalan sırada döner.
    """
    cached = read_json(DRUGS_FILE, None)
    drugs = cached if cached else _seed_as_dicts()
    return sorted(drugs, key=lambda d: d.get("use_count", 0), reverse=True)


def save_drug_list(drugs: list) -> None:
    write_json(DRUGS_FILE, drugs)


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


def search_drugs(query: str, drugs: Optional[list] = None) -> list:
    """Canlı arama: isme göre büyük/küçük harf duyarsız alt dize eşleşmesi."""
    if drugs is None:
        drugs = load_drug_list()
    q = query.strip().casefold()
    if not q:
        return drugs
    return [d for d in drugs if q in d["name"].casefold()]


def find_drug(name: str, drugs: Optional[list] = None) -> Optional[dict]:
    if drugs is None:
        drugs = load_drug_list()
    for d in drugs:
        if d["name"] == name:
            return d
    return None
