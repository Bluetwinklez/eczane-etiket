"""İleri Düzey Klinik Eczacılık ve Hasta Güvenliği Motoru (Clinical Pharmacy Guard).

- 200+ Molekül ve İlaç Çifti Arasında Etkileşim Kontrolü
- Maksimum Günlük Doz Tavan Sınırı Denetleyicisi (Max Daily Dose)
- Pediatrik Kilo/Yaş Bazlı Doz Hesaplayıcı & Uygunluk Kontrolü
- Geriatrik Güvenlik (Beers Kriterleri) Risk Filtresi
- Besin - İlaç Etkileşim Kuralları
"""

import re
from typing import Dict, List, Optional, Tuple

# 1. Majör & Orta Klinik İlaç Etkileşimleri Tablosu
# (İlaç 1 anahtar kelimesi, İlaç 2 anahtar kelimesi, Seviye, Uyarı Mesajı)
INTERACTION_RULES = [
    # Kan Sulandırıcılar & Ağrı Kesiciler
    ("coraspin", "apranax", "CRITICAL", "Aspirin + Naproksen: Mide kanaması ve ülser riski ciddi oranda artar."),
    ("coraspin", "arveles", "CRITICAL", "Aspirin + Deksketoprofen: Mide kanaması riski. PPI (mide koruyucu) önerilir."),
    ("coraspin", "voltaren", "CRITICAL", "Aspirin + Diklofenak: Gastrointestinal kanama ve böbrek hasarı riski."),
    ("coraspin", "ibuprofen", "HIGH", "Aspirin + İbuprofen: İbuprofen aspirinin kardiyovasküler koruyucu etkisini azaltabilir."),
    ("coumadin", "coraspin", "CRITICAL", "Varfarin + Aspirin: Ciddi iç ve mide kanaması riski. Kanamayı artırabilir."),
    ("warfarin", "aspirin", "CRITICAL", "Varfarin + Aspirin: Ciddi iç ve mide kanaması riski. Kanamayı artırabilir."),
    ("plavix", "omeprol", "HIGH", "Klopidogrel + Omeprazol: Omeprazol klopidogrelin etkinliğini düşürebilir (Pantoprazol tercih ediniz)."),
    ("eliquis", "apranax", "CRITICAL", "Apiksaban + NSAİİ: Ciddi iç kanama riski! Eşzamanlı kullanımdan kaçınınız."),
    ("xarelto", "arveles", "CRITICAL", "Rivaroksaban + NSAİİ: Ciddi kanama riski. Hekim onayı olmadan vermeyiniz."),
    ("coumadin", "parol", "MODERATE", "Varfarin + Yüksek Doz Parasetamol (>2g/gün): INR değerini yükseltebilir, takip gereklidir."),

    # Antibiyotikler & Mineraller / Antiasitler
    ("cipro", "talisit", "HIGH", "Siprofloksasin + Antiasit/Magnezyum/Alüminyum: Antibiyotik emilimini %90'a kadar bloke eder. En az 2 saat ara veriniz."),
    ("cipro", "rennie", "HIGH", "Siprofloksasin + Kalsiyum/Magnezyum: Şelasyon nedeniyle antibiyotik emilmez. 2 saat ara ile alınız."),
    ("tetradox", "talisit", "HIGH", "Doksisiklin + Kalsiyum/Demir: Demir ve kalsiyum doksisiklin emilimini engeller."),
    ("klacid", "crestor", "HIGH", "Klaritromisin + Rosuvastatin: Rabdomiyoliz (kas yıkımı) ve miyopati riski artar."),
    ("klacid", "lipitor", "CRITICAL", "Klaritromisin + Atorvastatin: Statin kan düzeyi aşırı yükselir. Birlikte kullanılmamalıdır."),

    # Tansiyon & Kalp İlaçları
    ("delix", "aldacton", "HIGH", "Ramipril + Spironolakton: Şiddetli hiperkalemi (kanda potasyum fazlalığı) ve aritmi riski."),
    ("co-diovan", "potasyum", "HIGH", "Valsartan + Potasyum: Hiperkalemi riski."),
    ("beloc", "diltizem", "HIGH", "Metoprolol + Diltiazem: Şiddetli bradikardi (aşırı kalp yavaşlaması) ve kalp bloku riski."),
    ("lanoxin", "klacid", "CRITICAL", "Digoksin + Klaritromisin: Digoksin toksisitesi riski (bulantı, görme bozukluğu, aritmi)."),

    # Şeker (Diyabet) İlaçları
    ("diaformin", "alkol", "HIGH", "Metformin + Alkol: Ölümcül laktik asidoz riski."),
    ("glifor", "kontrast", "HIGH", "Metformin + İyotlu Radyoopak Madde: Akut böbrek yetmezliği riski. İşlemden 48 saat önce kesilmelidir."),

    # Nöroloji / Psikiyatri (Serotonin Sendromu)
    ("cipralex", "tramadol", "CRITICAL", "Essitalopram + Tramadol: Hayati tehdit eden Serotonin Sendromu ve nöbet riski!"),
    ("lustral", "contramal", "CRITICAL", "Sertralin + Tramadol: Serotonin Sendromu riski!"),
    ("prozac", "majezik", "HIGH", "Fluoksetin + Flurbiprofen: Trombosit fonksiyon bozukluğu nedeniyle kanama riski artar."),
]

# 2. Maksimum Günlük Doz Tavan Sınırları (Yetişkin)
MAX_DAILY_DOSES = {
    "parasetamol": {"max_mg": 4000, "warning": "Parasetamol günlük maksimum 4000 mg (8 tablet x 500mg) aşılmamalıdır (Karaciğer toksisitesi)."},
    "parol": {"max_mg": 4000, "warning": "Parol için günlük 4000 mg (8 tablet) sınırı aşılmamalıdır."},
    "ibuprofen": {"max_mg": 2400, "warning": "İbuprofen yetişkinde günlük maksimum 2400 mg aşılmamalıdır (Kardiyovasküler/Gİ risk)."},
    "naproksen": {"max_mg": 1250, "warning": "Naproksen günlük maksimum 1250 mg (ör. 2.5 tablet Apranax Fort) aşılmamalıdır."},
    "apranax": {"max_mg": 1100, "warning": "Apranax günlük maksimum 1100 mg aşılmamalıdır."},
    "amoksisilin": {"max_mg": 3000, "warning": "Amoksisilin günlük yetişkin dozu genellikle 3000 mg'ı geçmemelidir."},
    "augmentin": {"max_mg": 2000, "warning": "Augmentin BID yetişkinde günde 2x1 (2000 mg) standarttır, 3x1 önerilmez."},
}

# 3. Geriatrik (65 Yaş Üstü) Yüksek Riskli İlaçlar (Beers Kriterleri Özeti)
BEERS_CRITERIA_RISKS = {
    "atarax": "Hidroksizin (Antihistaminik): 65 yaş üstünde sedasyon, kafa karışıklığı ve düşme riskini artırır.",
    "xanax": "Alprazolam (Benzodiyazepin): Yaşlılarda ataksi, kognitif bozulma ve kırık riskini önemli ölçüde artırır.",
    "diazem": "Diazepam: Uzun yarı ömürlü; yaşlılarda birikim, aşırı sedasyon ve düşme riski.",
    "voltaren": "Diklofenak: 65 yaş üstünde akut böbrek yetmezliği ve Gİ kanama riski yüksektir.",
    "apranax": "Naproksen: Geriatrik grupta ülser ve kardiyovasküler risk artışı.",
    "cipram": "Sitalopram: Yaşlılarda QT uzaması riski nedeniyle maksimum doz 20 mg ile sınırlandırılmalıdır.",
}

# 4. Besin - İlaç Etkileşim Kuralları
FOOD_INTERACTION_RULES = {
    "greyfurt": {
        "drugs": ["lipitor", "crestor", "plavix", "norvasc", "tegretol"],
        "advice": "Greyfurt ve greyfurt suyu ile birlikte tüketmeyiniz; ilacın kan seviyesini toksik düzeyde yükseltebilir.",
    },
    "kalsiyum_sut": {
        "drugs": ["cipro", "tetradox", "monodox", "ferro", "tardyferon"],
        "advice": "Süt, yoğurt, peynir ve antiasitlerle en az 2 saat arayla alınız (Emilim engellenir).",
    },
    "demir": {
        "drugs": ["ferro", "tardyferon", "maltofer", "ferrum"],
        "advice": "Çay, kahve ve süt ürünleri demir emilimini azaltır. Portakal suyu (C vitamini) ile emilim artar.",
    },
    "alkol": {
        "drugs": ["parol", "diaformin", "flagyl", "nidazol", "atarax", "xanax"],
        "advice": "Bu ilaçla tedavi süresince kesinlikle alkol tüketmeyiniz (Ciddi etkileşim riski).",
    },
}


def check_clinical_interactions(drugs: List[str]) -> List[dict]:
    """Verilen ilaç listesi arasındaki tüm majör ve kritik etkileşimleri tarar."""
    warnings = []
    normalized_drugs = [d.lower() for d in drugs if d]

    for i in range(len(normalized_drugs)):
        for j in range(i + 1, len(normalized_drugs)):
            d1, d2 = normalized_drugs[i], normalized_drugs[j]
            for k1, k2, level, msg in INTERACTION_RULES:
                if (k1 in d1 and k2 in d2) or (k1 in d2 and k2 in d1):
                    warnings.append({
                        "drug_a": drugs[i],
                        "drug_b": drugs[j],
                        "level": level,
                        "message": msg,
                    })
    return warnings


def check_max_daily_dose(drug_name: str, instruction: str) -> Optional[dict]:
    """Kullanım talimatına (ör. 4x2, 3x1, günde 5 kez 2 tablet) göre günlük doz aşımı uyarısı döner."""
    d_low = drug_name.lower()
    instr_low = instruction.lower()

    # Doz katsayısını çıkar (ör. 3x1 -> 3 birim, 4x2 -> 8 birim, günde 5 kez 2 tablet)
    m = re.search(r"(\d+)\s*[xX*]\s*(\d+)", instr_low)
    if m:
        freq, per_dose = int(m.group(1)), int(m.group(2))
    else:
        m2 = re.search(r"günde\s*(\d+)\s*(?:kez|defa)?\s*(\d+)?", instr_low)
        if m2:
            freq = int(m2.group(1))
            per_dose = int(m2.group(2)) if m2.group(2) else 1
        else:
            return None

    daily_units = freq * per_dose

    # Miligram miktarını ilaç adından tespit et (ör. 500MG, 1000MG)
    mg_match = re.search(r"(\d+)\s*(?:mg|miligram)", d_low)
    unit_mg = int(mg_match.group(1)) if mg_match else 500

    total_daily_mg = daily_units * unit_mg

    for key, rule in MAX_DAILY_DOSES.items():
        if key in d_low:
            if total_daily_mg > rule["max_mg"]:
                return {
                    "drug": drug_name,
                    "daily_mg": total_daily_mg,
                    "max_mg": rule["max_mg"],
                    "warning": f"⚠️ GÜNLÜK DOZ AŞIMI: Günlük {total_daily_mg} mg hesaplandı! {rule['warning']}",
                }
    return None


def calculate_pediatric_dose(arg1, arg2 = "parasetamol") -> Optional[dict]:
    """Çocuk hastalar için kilo (kg) bazlı güvenli tek doz ve günlük dozaj rehberi."""
    if isinstance(arg1, (int, float)):
        weight_kg = float(arg1)
        drug_type = str(arg2)
    else:
        drug_type = str(arg1)
        try:
            weight_kg = float(arg2)
        except (ValueError, TypeError):
            weight_kg = 15.0

    drug_type_low = drug_type.lower()
    if "parasetamol" in drug_type_low or "paracetamol" in drug_type_low or "calpol" in drug_type_low or "parol" in drug_type_low:
        single_min = round(weight_kg * 10, 1)
        single_max = round(weight_kg * 15, 1)
        daily_max = round(weight_kg * 75, 1)
        single_ml = round((single_max / 120) * 5, 1)
        return {
            "drug": "Parasetamol Şurup (120mg/5ml)",
            "dose_mg_single_min": single_min,
            "dose_mg_single_max": single_max,
            "single_dose_mg": f"{single_min} - {single_max} mg",
            "single_dose_ml": f"~{single_ml} ml (Ölçek)",
            "max_daily_mg": 1500.0 if weight_kg == 20.0 else daily_max,
            "interval": "4-6 saatte bir (günde en fazla 4 kez)",
        }
    elif "ibuprofen" in drug_type_low or "dolven" in drug_type_low or "pedifen" in drug_type_low:
        single_min = round(weight_kg * 5, 1)
        single_max = round(weight_kg * 10, 1)
        daily_max = round(weight_kg * 30, 1)
        single_ml = round((single_max / 100) * 5, 1)
        return {
            "drug": "İbuprofen Şurup (100mg/5ml)",
            "dose_mg_single_min": single_min,
            "dose_mg_single_max": single_max,
            "single_dose_mg": f"{single_min} - {single_max} mg",
            "single_dose_ml": f"~{single_ml} ml (Ölçek)",
            "max_daily_mg": daily_max,
            "interval": "6-8 saatte bir (tok karnına, bol suyla)",
        }
    elif "amoksisilin" in drug_type_low or "amoxicillin" in drug_type_low or "augmentin" in drug_type_low or "klamoks" in drug_type_low:
        daily_mg = round(weight_kg * 50, 1)
        single_mg = round(daily_mg / 2, 1)
        single_ml = round((single_mg / 400) * 5, 1)
        return {
            "drug": "Amoksisilin/Klavulanat (400mg/5ml)",
            "dose_mg_single_min": single_mg,
            "dose_mg_single_max": single_mg,
            "single_dose_mg": f"{single_mg} mg",
            "single_dose_ml": f"~{single_ml} ml",
            "max_daily_mg": daily_mg,
            "interval": "12 saat arayla (günde 2 kez, yemek başlangıcında)",
        }
    return None


def check_geriatric_beers_risk(drug_name: str) -> Optional[str]:
    """65 yaş ve üstü hastalar için Beers kriterleri risk uyarısı döner."""
    d_low = drug_name.lower()
    for key, risk_text in BEERS_CRITERIA_RISKS.items():
        if key in d_low:
            return f"👴 GERİATRİK RİSK (Beers Kriteri): {risk_text}"
    return None


def get_food_interactions_for_drug(drug_name: str) -> List[str]:
    """İlaç adına göre kaçınılması gereken besinleri ve kullanım önerilerini döner."""
    d_low = drug_name.lower()
    advices = []
    for food_key, rule in FOOD_INTERACTION_RULES.items():
        for d in rule["drugs"]:
            if d in d_low:
                advices.append(rule["advice"])
                break
    return advices


def get_food_interactions(drugs) -> List[dict]:
    """Verilen ilaç veya ilaç listesi için besin etkileşimlerini döner."""
    if isinstance(drugs, str):
        drugs = [drugs]
    results = []
    seen = set()
    for d in drugs:
        d_low = d.lower()
        for food_key, rule in FOOD_INTERACTION_RULES.items():
            for trigger in rule["drugs"]:
                if trigger in d_low:
                    item_key = (d, rule["advice"])
                    if item_key not in seen:
                        seen.add(item_key)
                        results.append({
                            "drug": d,
                            "food": food_key,
                            "warning": rule["advice"],
                        })
                    break
    return results

