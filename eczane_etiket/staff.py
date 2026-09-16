"""Personel listesi — sadece 'etiketi kim bastı' notu için, giriş/şifre değildir."""

from .jsonutil import read_json, write_json
from .paths import STAFF_FILE


def load_staff() -> list:
    return read_json(STAFF_FILE, [])


def save_staff(names: list) -> None:
    write_json(STAFF_FILE, names)


def add_staff(name: str) -> None:
    names = load_staff()
    name = name.strip()
    if name and name not in names:
        names.append(name)
        save_staff(names)


def remove_staff(name: str) -> None:
    names = [n for n in load_staff() if n != name]
    save_staff(names)
