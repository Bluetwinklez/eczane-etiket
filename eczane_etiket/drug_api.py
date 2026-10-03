"""Yapılandırılabilir ilaç veri API istemcisi.

ÖNEMLİ NOT (kurulum sırasında doğrulandı): varsayılan olarak önerilen
`turkish-medicine-api` (github.com/tugcantopaloglu/turkish-medicine-api)
herkese açık, barındırılan bir servis DEĞİLDİR — Node.js 18+ ile
kullanıcının kendi bilgisayarında/sunucusunda çalıştırması gereken açık
kaynak bir projedir (`npm install && npm run download && npm start`,
varsayılan adres `http://localhost:3000`). Bu yüzden API adresi
varsayılan olarak BOŞ bırakılır (özellik pasif) — kullanıcı bu sunucuyu
kendi çalıştırıp Admin Panelinden adresi girdiğinde aktif olur.
Program bu API olmadan da (seed liste + CSV içe aktarma ile) tam
çalışır durumdadır; bu yalnızca opsiyonel bir otomatik güncelleme yoludur.

API her zaman ulaşılamaz/hatalı olabilir; bu modül hiçbir durumda
istisna fırlatıp programı çökertmez, yalnızca boş sonuç döner.
"""

from dataclasses import asdict, dataclass
from typing import Optional

from .data import Drug
from .jsonutil import read_json, write_json
from .paths import API_CONFIG_FILE

DEFAULT_TIMEOUT_SECONDS = 8

# API'nin döndürebileceği kayıtlarda ilgili mantıksal alan için denenecek
# olası anahtar adları (gerçek şema kullanıcı sunucusu çalıştırılıp
# GET /api/columns incelenene kadar kesin bilinmiyor).
FIELD_CANDIDATES = {
    "name": ["name", "ad", "ilac_adi", "İlaç Adı", "urun_adi", "product_name", "İLAÇ ADI"],
    "form": ["form", "farmasotik_sekil", "Farmasötik Şekil", "dosage_form"],
    "kullanim_amaci": ["indication", "kullanim_amaci", "Kullanım Amacı", "aciklama"],
}


@dataclass
class ApiConfig:
    base_url: str = ""
    api_key: Optional[str] = None
    sheet: str = "active"

    def to_dict(self) -> dict:
        return asdict(self)


def load_api_config() -> ApiConfig:
    raw = read_json(API_CONFIG_FILE, None)
    if not raw:
        return ApiConfig()
    return ApiConfig(**raw)


def save_api_config(config: ApiConfig) -> None:
    write_json(API_CONFIG_FILE, config.to_dict())


def _pick_field(record: dict, keys: list) -> Optional[str]:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return str(record[key])
    return None


def _record_to_drug(record: dict) -> Optional[Drug]:
    name = _pick_field(record, FIELD_CANDIDATES["name"])
    if not name:
        return None
    form = _pick_field(record, FIELD_CANDIDATES["form"]) or "tablet"
    kullanim_amaci = _pick_field(record, FIELD_CANDIDATES["kullanim_amaci"])
    return Drug(name=name.strip(), form=form.strip().lower(), kullanim_amaci=kullanim_amaci)


def fetch_drug_list(config: Optional[ApiConfig] = None, max_pages: int = 200) -> list:
    """Yapılandırılmış API'den ilaç listesini çeker.

    Başarısız/pasif durumda boş liste döner; asla istisna fırlatmaz.
    """
    config = config or load_api_config()
    if not config.base_url:
        return []

    try:
        import requests
    except ImportError:
        return []

    headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
    drugs: list = []
    page = 1
    try:
        while page <= max_pages:
            resp = requests.get(
                f"{config.base_url.rstrip('/')}/api/medicines",
                params={"page": page, "limit": 200, "sheet": config.sheet},
                headers=headers,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            if resp.status_code != 200:
                break
            payload = resp.json()
            records = payload.get("data", [])
            if not records:
                break
            for record in records:
                drug = _record_to_drug(record)
                if drug:
                    drugs.append(drug.to_dict())
            total_pages = payload.get("totalPages", page)
            if page >= total_pages:
                break
            page += 1
    except Exception:
        # Ağ hatası, zaman aşımı, JSON parse hatası vb. — sessizce boş dön.
        return drugs if drugs else []

    return drugs


def refresh_drug_cache(config: Optional[ApiConfig] = None) -> bool:
    """API'den ilaç listesini çekip yerel önbelleğe yazar.

    Başarılıysa True, veri gelmezse (mevcut önbellek/seed korunur) False döner.
    """
    from .paths import DRUGS_FILE

    fetched = fetch_drug_list(config)
    if not fetched:
        return False
    write_json(DRUGS_FILE, fetched)
    return True
