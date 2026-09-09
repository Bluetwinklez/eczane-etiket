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
    kisa_prospektus: Optional[str] = None
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
         "Baş ağrısı, adet ağrısı, kas-eklem ağrısı ve ateşli durumlarda kullanılan bir ağrı kesici/ateş düşürücüdür."),
    Drug("MAJEZIK 100MG 10 TABLET", "tablet", "Ağrı kesici",
         "Kas, eklem ve adet ağrıları gibi orta şiddetli ağrılarda kullanılan bir ağrı kesicidir."),
    Drug("ARVELES 25MG 20 FILM TABLET", "tablet", "Ağrı kesici",
         "Ağrı ve iltihabı azaltan, kas-iskelet sistemi ağrılarında sık kullanılan bir ilaçtır."),
    Drug("NUROFEN 400MG 20 TABLET", "tablet", "Ağrı ve ateş düşürücü",
         "Ağrı, ateş ve iltihabı azaltmak için kullanılan bir ağrı kesici/ateş düşürücüdür."),
    Drug("AUGMENTIN BID 1000MG 14 TABLET", "tablet", "Antibiyotik",
         "Bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotiktir; doktorun belirttiği süre boyunca düzenli kullanılmalıdır."),
    Drug("CORASPIN 100MG 30 TABLET", "tablet", "Kan sulandırıcı",
         "Kalp-damar hastalıklarında pıhtı oluşumunu önlemeye yardımcı, düşük doz kan sulandırıcı bir ilaçtır."),
    Drug("CONCOR 5MG 28 TABLET", "tablet", "Tansiyon / kalp ritmi düzenleyici",
         "Yüksek tansiyon ve bazı kalp ritmi bozukluklarının tedavisinde kullanılan bir ilaçtır."),
    Drug("CIPRO 500MG 10 TABLET", "tablet", "Antibiyotik",
         "Bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotiktir; doktorun belirttiği süre boyunca düzenli kullanılmalıdır."),
    Drug("CATAFLAM 50MG 20 DRAJE", "tablet", "Ağrı ve iltihap giderici",
         "Ağrı ve iltihabı azaltmak için kullanılan bir ilaçtır."),
    Drug("RENNIE 24 ÇİĞNEME TABLETİ", "tablet", "Mide ekşimesi giderici",
         "Mide ekşimesi ve hazımsızlık şikayetlerini hafifletmek için kullanılan bir antasittir."),
    Drug("ZYRTEC 10MG 20 TABLET", "tablet", "Alerji giderici (antihistaminik)",
         "Alerjik rahatsızlıklara bağlı kaşıntı, hapşırma ve burun akıntısı gibi belirtileri hafifletmek için kullanılır."),
    Drug("METPAMID 10MG 30 TABLET", "tablet", None, None),
    Drug("NEXIUM 40MG 14 KAPSÜL", "kapsul", "Mide asidini azaltıcı",
         "Mide asidinin fazla salgılanmasına bağlı reflü ve yanma şikayetlerinde kullanılan bir ilaçtır."),
    Drug("DEPRIM FORTE 30 KAPSÜL", "kapsul", None, None),
    Drug("PROSPAN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici (bitkisel)",
         "Bitkisel içerikli, öksürüğü yumuşatmaya yardımcı bir şuruptur."),
    Drug("CALPOL 120MG/5ML ŞURUP 100ML", "surup", "Ağrı ve ateş düşürücü (pediatrik)",
         "Çocuklarda ağrı ve ateşi düşürmek için kullanılan bir şuruptur."),
    Drug("NOTUSSIN ÖKSÜRÜK ŞURUBU 100ML", "surup", "Öksürük giderici",
         "Öksürüğü hafifletmeye yardımcı bir şuruptur."),
    Drug("D VİTAMİNİ DAMLA 15ML", "damla", "D vitamini takviyesi",
         "D vitamini eksikliğini desteklemek amacıyla kullanılan bir takviyedir."),
    Drug("BEBEKOL GAZ DAMLASI 30ML", "damla", "Bebeklerde gaz sancısını giderici",
         "Bebeklerde sindirim kaynaklı gaz sancısını hafifletmeye yardımcı bir damladır."),
    Drug("OPTIVE GÖZ DAMLASI 10ML", "damla", "Göz kuruluğunu giderici",
         "Göz kuruluğu şikayetlerini hafifletmek için kullanılan yapay gözyaşı damlasıdır."),
    Drug("OTRIVINE BURUN SPREYİ 10ML", "sprey", "Nazal konjesyonu (burun tıkanıklığını) açıcı",
         "Burun tıkanıklığını geçici olarak açmaya yardımcı bir burun spreyidir."),
    Drug("COLDAMIN BOĞAZ SPREYİ", "sprey", "Boğaz ağrısını giderici",
         "Boğaz ağrısı ve tahrişini hafifletmeye yardımcı bir boğaz spreyidir."),
    Drug("VOLTAREN EMULGEL 100GR", "merhem_krem", "Ağrı ve iltihap giderici jel",
         "Kas ve eklem ağrılarında cilt üzerine uygulanan, ağrı ve iltihabı azaltan bir jeldir."),
    Drug("BEPANTHEN KREM 30GR", "merhem_krem", "Cilt tahrişini/pişiği önleyici",
         "Cilt tahrişi ve bebek pişiğini önlemeye/iyileştirmeye yardımcı bir kremdir."),
    Drug("FUCIDIN KREM 15GR", "merhem_krem", "Bakteriyel cilt enfeksiyonu tedavisi",
         "Ciltte bakteri kaynaklı enfeksiyonları tedavi etmek için kullanılan bir antibiyotikli kremdir."),
    Drug("WILKINSON POMAD %12,5 100GR", "merhem_krem", "Kaşıntı, kızarıklık ve uyuz tedavisi",
         "Uyuz gibi cilt parazitlerine bağlı kaşıntı ve kızarıklığın tedavisinde kullanılan bir pomaddır."),
    Drug("DOLOREX FORT SÜPOZİTUVAR 10 ADET", "supozituvar", "Ağrı kesici",
         "Ağız yoluyla ilaç alınamadığında kullanılabilen bir ağrı kesici süpozituvardır."),
    Drug("DULCOLAX 5MG SÜPOZİTUVAR 6 ADET", "supozituvar", "Kabızlık giderici",
         "Kabızlığı gidermeye yardımcı, rektal yolla uygulanan bir müshildir."),
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
