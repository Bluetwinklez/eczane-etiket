"""Eczane profil(ler)i: yükle/kaydet, aktif profil seçimi, opsiyonel PIN koruması.

Birden fazla eczane/şube profili desteklenir (madde 17). Her profil kendi
etiket şablonunu (boyutunu) seçebilir (madde 10). PIN, kurumsal bir
kimlik doğrulama sistemi değildir; tek kullanıcılı yerel bir araçta
Admin Paneline erişimi kabaca kısıtlamak içindir.
"""

import hashlib
import uuid
from dataclasses import asdict, dataclass
from typing import Optional

from .jsonutil import read_json, write_json
from .paths import PROFILES_FILE

DEFAULT_LABEL_TEMPLATE = "thermal_50x30"

LABEL_TEMPLATES = {
    "thermal_50x30": "Termal Etiket (50x30mm)",
    "thermal_60x40": "Termal Etiket (60x40mm)",
    "thermal_80x50": "Termal Etiket (80x50mm)",
    "a4_grid_6": "A4 Sayfa - 6'lı Etiket Izgarası",
}


@dataclass
class Profile:
    id: str
    name: str = ""
    phone: str = ""
    logo_path: Optional[str] = None
    pin_hash: Optional[str] = None
    label_template: str = DEFAULT_LABEL_TEMPLATE
    qr_enabled: bool = False  # yalnızca a4_grid_6 şablonunda gösterilir (bkz. label_pdf.py)
    theme: str = "light"
    default_printer: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def verify_pin(profile: dict, pin: str) -> bool:
    pin_hash = profile.get("pin_hash")
    if not pin_hash:
        return True
    return _hash_pin(pin) == pin_hash


def set_pin(profile: dict, pin: Optional[str]) -> dict:
    profile["pin_hash"] = _hash_pin(pin) if pin else None
    return profile


def _default_state() -> dict:
    return {"active_id": None, "profiles": []}


def load_state() -> dict:
    state = read_json(PROFILES_FILE, _default_state())
    if not state.get("profiles"):
        # İlk çalıştırma: boş bir varsayılan profil oluştur.
        default_profile = Profile(id=str(uuid.uuid4()), name="Eczanem").to_dict()
        state = {"active_id": default_profile["id"], "profiles": [default_profile]}
        write_json(PROFILES_FILE, state)
    return state


def save_state(state: dict) -> None:
    write_json(PROFILES_FILE, state)


def load_profiles() -> list:
    return load_state()["profiles"]


def save_profiles(profiles: list) -> None:
    state = load_state()
    state["profiles"] = profiles
    save_state(state)


def get_active_profile() -> dict:
    state = load_state()
    active_id = state.get("active_id")
    for profile in state["profiles"]:
        if profile["id"] == active_id:
            return profile
    return state["profiles"][0]


def set_active_profile(profile_id: str) -> None:
    state = load_state()
    if any(p["id"] == profile_id for p in state["profiles"]):
        state["active_id"] = profile_id
        save_state(state)


def add_profile(
    name: str,
    phone: str = "",
    logo_path: Optional[str] = None,
    label_template: str = DEFAULT_LABEL_TEMPLATE,
    theme: str = "light",
    default_printer: Optional[str] = None,
) -> dict:
    state = load_state()
    profile = Profile(
        id=str(uuid.uuid4()),
        name=name,
        phone=phone,
        logo_path=logo_path,
        label_template=label_template,
        theme=theme,
        default_printer=default_printer,
    ).to_dict()
    state["profiles"].append(profile)
    if not state.get("active_id"):
        state["active_id"] = profile["id"]
    save_state(state)
    return profile


def update_profile(profile_id: str, **changes) -> Optional[dict]:
    state = load_state()
    for profile in state["profiles"]:
        if profile["id"] == profile_id:
            profile.update(changes)
            save_state(state)
            return profile
    return None


def delete_profile(profile_id: str) -> None:
    state = load_state()
    state["profiles"] = [p for p in state["profiles"] if p["id"] != profile_id]
    if state.get("active_id") == profile_id:
        state["active_id"] = state["profiles"][0]["id"] if state["profiles"] else None
    save_state(state)
