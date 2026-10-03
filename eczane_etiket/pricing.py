"""İlaç Fiyatlandırma, SGK Katılım Payı ve Finansal Hesaplama Motoru.

Türkiye İlaç Fiyat Kararnamesi ve SGK SUT kurallarına göre:
- Perakende Satış Fiyatı (PSF ₺)
- SGK Karşılanan Tutar
- Hasta Katılım Payı (Çalışan %20, Emekli %10, Raporlu %0)
- İlaç Fiyat Farkı
hesaplamalarını otomatik olarak yapar.
"""

from typing import Dict, List, Optional

# Türkiye'de yaygın ilaçların yaklaşık kamu / perakende referans fiyatları (₺)
SAMPLE_DRUG_PRICES: Dict[str, float] = {
    "parol": 72.50,
    "augmentin": 185.00,
    "apranax": 115.00,
    "arveles": 98.00,
    "majezik": 110.00,
    "coraspin": 48.00,
    "nexium": 165.00,
    "pantpas": 140.00,
    "lansor": 135.00,
    "delix": 112.00,
    "beloc": 95.00,
    "norvasc": 125.00,
    "lipitor": 210.00,
    "crestor": 230.00,
    "diaformin": 88.00,
    "glifor": 85.00,
    "ventolin": 92.00,
    "atarax": 68.00,
    "aerius": 130.00,
    "zyrtec": 118.00,
    "calpol": 82.00,
    "dolven": 88.00,
}

DEFAULT_UNIT_PRICE = 95.0


def get_drug_retail_price(drug_name: str) -> float:
    """İlaç adına göre yaklaşık perakende satış fiyatını (₺) döner."""
    d_low = drug_name.lower()
    for key, price in SAMPLE_DRUG_PRICES.items():
        if key in d_low:
            return price
    return DEFAULT_UNIT_PRICE


def calculate_prescription_financials(
    items: Optional[List[dict]] = None,
    patient_status: str = "calisan",  # "calisan" (%20), "emekli" (%10), "raporlu" (%0), "ucretli" (%100)
    retail_price: Optional[float] = None,
    sgk_covered_price: Optional[float] = None,
    category: Optional[str] = None,
) -> dict:
    """Reçetedeki veya sepetteki ilaçların finansal dökümünü çıkarır.
    
    Hem toplu ilaç listesi (items) hem de tekil reçete fiyatı (retail_price, sgk_covered_price)
    ile çağrılabilir.
    """
    rate_map = {
        "calisan": 0.20,
        "sgk_employee": 0.20,
        "emekli": 0.10,
        "sgk_retiree": 0.10,
        "raporlu": 0.00,
        "sgk_chronic": 0.00,
        "ucretli": 1.00,
        "private": 1.00,
    }

    # Tekil fiyat parametreleri ile çağrıldıysa
    if retail_price is not None:
        cat_key = (category or patient_status).lower()
        copay_rate = rate_map.get(cat_key, 0.20)
        covered = retail_price if sgk_covered_price is None else sgk_covered_price
        copay_amount = round(covered * copay_rate, 2)
        price_diff = round(max(0.0, retail_price - covered), 2)
        total_payable = round(copay_amount + price_diff, 2)
        sgk_payable = round(covered - copay_amount, 2)
        kdv_amount = round(retail_price * 0.10, 2)
        return {
            "retail_price": retail_price,
            "sgk_covered_price": covered,
            "patient_copay_ratio": copay_rate,
            "patient_copay_amount": copay_amount,
            "price_difference": price_diff,
            "patient_total_payable": total_payable,
            "sgk_payable": sgk_payable,
            "kdv_amount": kdv_amount,
            "patient_status": category or patient_status,
        }

    items = items or []
    total_retail = 0.0
    item_breakdown = []
    copay_rate = rate_map.get(patient_status.lower(), 0.20)

    for item in items:
        name = item.get("name") or item.get("drug_name") or "İlaç"
        qty = item.get("quantity") or item.get("copies") or 1
        unit_price = item.get("price") or get_drug_retail_price(name)
        line_total = qty * unit_price
        total_retail += line_total

        patient_share = round(line_total * copay_rate, 2)
        sgk_share = round(line_total - patient_share, 2)

        item_breakdown.append({
            "name": name,
            "quantity": qty,
            "unit_price": unit_price,
            "line_total": line_total,
            "patient_share": patient_share,
            "sgk_share": sgk_share,
        })

    patient_total = round(total_retail * copay_rate, 2)
    sgk_total = round(total_retail - patient_total, 2)
    kdv_amount = round(total_retail * 0.10, 2)  # %10 İlaç KDV'si

    return {
        "total_retail": round(total_retail, 2),
        "patient_total": patient_total,
        "sgk_total": sgk_total,
        "kdv_amount": kdv_amount,
        "patient_status": patient_status,
        "copay_percentage": int(copay_rate * 100),
        "items": item_breakdown,
    }
