"""Hasta Bilgilendirme ve Kutu Bitiş Hatırlatma Mesajı Üreticisi (SMS / WhatsApp).

Eczanenin hastasına tek tıkla gönderebileceği:
- İlaç Kullanım Özeti Mesajı
- Kutu Bitiş & SGK Yeniden Yazdırma Hatırlatma Mesajı
- Nöbetçi Eczane Bilgilendirme Mesajı
şablonlarını otomatik üretir.
"""

from typing import List


def generate_patient_whatsapp_summary(
    patient_name: str,
    pharmacy_name: str,
    pharmacy_phone: str,
    items: List[dict],
) -> str:
    """Hastaya gönderilmek üzere WhatsApp formatında ilaç kullanım özeti üretir."""
    p_title = patient_name.strip() if patient_name else "Değerli Hastamız"

    lines = [
        f"🏥 *{pharmacy_name.upper()}*",
        f"Sayın *{p_title}*, reçetenizdeki ilaçların doğru ve güvenli kullanım bilgileri aşağıda yer almaktadır:\n",
    ]

    for i, it in enumerate(items, 1):
        name = it.get("name") or it.get("drug_name") or "İlaç"
        instr = it.get("instructions") or "Hekiminizin önerdiği şekilde"
        refill = it.get("refill_date") or ""

        line = f"*{i}. {name}*\n↳ 💊 *Doz:* {instr}"
        if refill:
            line += f"\n↳ 📅 *Tahmini Kutu Bitiş:* {refill}"
        lines.append(line)

    lines.append("\n⚠️ *Önemli Hatırlatma:* İlaçlarınızı düzenli kullanınız. Beklenmeyen bir yan etkide lütfen eczacınıza veya doktorunuza danışınız.")
    if pharmacy_phone:
        lines.append(f"📞 *Danışma Hattı:* {pharmacy_phone}")
    lines.append("Sağlıklı günler dileriz! 🌿")

    return "\n".join(lines)


def generate_refill_sms_reminder(
    patient_name: str,
    pharmacy_name: str,
    drug_name: str,
    refill_date: str,
) -> str:
    """Kutu bitiş tarihi yaklaşan hastaya gönderilecek kısa SMS metni."""
    p_title = patient_name.strip() if patient_name else "Sayin Hastamiz"
    return (
        f"{pharmacy_name}: {p_title}, {drug_name} ilacinizin SGK tekrar alim tarihi "
        f"{refill_date} olarak gorunmektedir. Tedavinizin aksamamasi icin recetenizi "
        f"yeniletmeyi unutmayiniz. Saglikli gunler dileriz."
    )


# Uyumluluk takma adı
generate_sms_refill_reminder = generate_refill_sms_reminder
