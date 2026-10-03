"""Çoklu Dil Etiket Talimatı Çeviri Motoru (Multi-language Prescription Engine).

Türkçe yazılmış kullanım talimatlarını (ör. "Günde 2x1 Aç Karnına Yutulacak")
yabancı hastalar ve turistler için 4 ana dile hatasız ve klinik standartlarda çevirir:
- 🇬🇧 İngilizce (EN)
- 🇸🇾 Arapça (AR)
- 🇩🇪 Almanca (DE)
- 🇷🇺 Rusça (RU)
"""

import re
from typing import Dict, Optional

# Sözlük tabanlı klinik talimat çevirileri
TRANSLATIONS: Dict[str, Dict[str, str]] = {
    # Açlık / Tokluk
    "tok": {
        "en": "After meals (Full stomach)",
        "ar": "بعد الأكل (على معدة ممتلئة)",
        "de": "Nach den Mahlzeiten (nach dem Essen)",
        "ru": "После еды",
    },
    "aç": {
        "en": "Before meals (Empty stomach)",
        "ar": "قبل الأكل (على معدة فارغة)",
        "de": "Vor den Mahlzeiten (nüchtern)",
        "ru": "До еды (натощак)",
    },
    "fark etmez": {
        "en": "With or without food",
        "ar": "مع أو بدون طعام",
        "de": "Mit oder ohne Nahrung",
        "ru": "Независимо от приема пищи",
    },
    # Doz Zamanları
    "sabah": {"en": "Morning", "ar": "صباحاً", "de": "Morgens", "ru": "Утром"},
    "öğle": {"en": "Noon", "ar": "ظهراً", "de": "Mittags", "ru": "В обед"},
    "akşam": {"en": "Evening", "ar": "مساءً", "de": "Abends", "ru": "Вечером"},
    "gece": {"en": "Night / Bedtime", "ar": "ليلاً / قبل النوم", "de": "Nachts / Vor dem Schlafen", "ru": "На ночь / Перед сном"},
    # Uygulama Şekilleri
    "yutulacak": {"en": "to be swallowed with water", "ar": "يُبلع بالماء", "de": "mit Wasser schlucken", "ru": "проглатывать, запивая водой"},
    "emilecek": {"en": "to be dissolved in mouth", "ar": "يُمص في الفم", "de": "im Mund zergehen lassen", "ru": "рассасывать во рту"},
    "çiğnenecek": {"en": "to be chewed", "ar": "يُمضغ جيدا", "de": "kauen", "ru": "разжевывать"},
    "içilecek": {"en": "to be taken orally", "ar": "يُشرب عن طريق الفم", "de": "einnehmen", "ru": "принимать внутрь"},
    "sürülecek": {"en": "apply externally to skin", "ar": "يُدهن موضعياً على الجلد", "de": "äußerlich auf die Haut auftragen", "ru": "наносить наружно на кожу"},
    "damlatılacak": {"en": "instill drops", "ar": "يُقطر", "de": "einträufeln", "ru": "закапывать"},
    "solunacak": {"en": "to be inhaled", "ar": "يُستنشق", "de": "inhalieren", "ru": "ингалировать"},
    "çalkalayınız": {"en": "Shake well before use", "ar": "رج العبوة جيداً قبل الاستعمال", "de": "Vor Gebrauch gut schütteln", "ru": "Хорошо встряхнуть перед употреблением"},
}

DOSE_PATTERNS = [
    (re.compile(r"\b1x1\b", re.I), {
        "en": "1 time a day, 1 dose",
        "ar": "مرة واحدة يومياً (جرعة 1)",
        "de": "1-mal täglich 1 Dosis",
        "ru": "1 раз в день по 1 дозе",
    }),
    (re.compile(r"\b2x1\b", re.I), {
        "en": "2 times a day, 1 dose (every 12 hours)",
        "ar": "مرتين يومياً (كل 12 ساعة)",
        "de": "2-mal täglich 1 Dosis (alle 12 Stunden)",
        "ru": "2 раза в день по 1 дозе (каждые 12 часов)",
    }),
    (re.compile(r"\b3x1\b", re.I), {
        "en": "3 times a day, 1 dose (every 8 hours)",
        "ar": "3 مرات يومياً (كل 8 ساعات)",
        "de": "3-mal täglich 1 Dosis (alle 8 Stunden)",
        "ru": "3 раза в день по 1 дозе (каждые 8 часов)",
    }),
    (re.compile(r"\b4x1\b", re.I), {
        "en": "4 times a day, 1 dose (every 6 hours)",
        "ar": "4 مرات يومياً (كل 6 ساعات)",
        "de": "4-mal täglich 1 Dosis (alle 6 Stunden)",
        "ru": "4 раза в день по 1 дозе (каждые 6 часов)",
    }),
    (re.compile(r"\b1x2\b", re.I), {
        "en": "1 time a day, 2 doses together",
        "ar": "مرة واحدة يومياً (جرعتان معاً)",
        "de": "1-mal täglich 2 Dosen zusammen",
        "ru": "1 раз в день по 2 дозы",
    }),
    (re.compile(r"günde\s*1\s*(?:kez|defa)?", re.I), {
        "en": "1 time a day",
        "ar": "مرة واحدة يومياً",
        "de": "1-mal täglich",
        "ru": "1 раз в день",
    }),
    (re.compile(r"günde\s*2\s*(?:kez|defa)?", re.I), {
        "en": "2 times a day",
        "ar": "مرتين يومياً",
        "de": "2-mal täglich",
        "ru": "2 раза в день",
    }),
    (re.compile(r"günde\s*3\s*(?:kez|defa)?", re.I), {
        "en": "3 times a day",
        "ar": "3 مرات يومياً",
        "de": "3-mal täglich",
        "ru": "3 раза в день",
    }),
    (re.compile(r"günde\s*4\s*(?:kez|defa)?", re.I), {
        "en": "4 times a day",
        "ar": "4 مرات يومياً",
        "de": "4-mal täglich",
        "ru": "4 раза в день",
    }),
]


def translate_instruction(text: str, target_lang: str = "en") -> str:
    """Verilen Türkçe talimat metnini hedef dile çevirir.
    
    Desteklenen diller: 'en' (İngilizce), 'ar' (Arapça), 'de' (Almanca), 'ru' (Rusça).
    Hedef dil 'tr' ise metin aynen döner.
    """
    if not text or target_lang == "tr":
        return text

    target_lang = target_lang.lower()
    if target_lang not in ("en", "ar", "de", "ru"):
        target_lang = "en"

    lowered = text.lower()
    translated_parts = []

    # 1. Doz sıklığı kalıbı (1x1, 2x1 vb.)
    dose_found = False
    for pattern, t_dict in DOSE_PATTERNS:
        if pattern.search(lowered):
            translated_parts.append(t_dict[target_lang])
            dose_found = True
            break

    # 2. Doz zamanları
    times = []
    for t_key in ("sabah", "öğle", "akşam", "gece"):
        if t_key in lowered:
            times.append(TRANSLATIONS[t_key][target_lang])
    if times:
        translated_parts.append(" + ".join(times))

    # 3. Açlık / Tokluk
    if "tok" in lowered and "aç" not in lowered:
        translated_parts.append(TRANSLATIONS["tok"][target_lang])
    elif "aç" in lowered and "tok" not in lowered:
        translated_parts.append(TRANSLATIONS["aç"][target_lang])

    # 4. Uygulama Şekli
    for method_key in ("yutulacak", "emilecek", "çiğnenecek", "içilecek", "sürülecek", "damlatılacak", "solunacak"):
        if method_key in lowered:
            translated_parts.append(TRANSLATIONS[method_key][target_lang])
            break

    # 5. Özel ikazlar
    if "çalkala" in lowered:
        translated_parts.append(TRANSLATIONS["çalkalayınız"][target_lang])

    if not translated_parts:
        # Eşleşme yoksa İngilizce genel format ekle
        prefix = {
            "en": "Take as directed by doctor/pharmacist: ",
            "ar": "حسب تعليمات الطبيب أو الصيدلي: ",
            "de": "Gemäß ärztlicher Anweisung einnehmen: ",
            "ru": "Принимать по назначению врача: ",
        }
        return prefix.get(target_lang, "") + text

    return " - ".join(translated_parts)


def get_supported_languages() -> dict:
    return {
        "tr": "🇹🇷 Türkçe",
        "en": "🇬🇧 English",
        "ar": "🇸🇾 العربية",
        "de": "🇩🇪 Deutsch",
        "ru": "🇷🇺 Русский",
    }
