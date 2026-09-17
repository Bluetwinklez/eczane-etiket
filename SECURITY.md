# 🛡️ Güvenlik ve Veri Gizliliği Politikası

**Eczane İlaç Etiketi Programı**, sağlık kuruluşları ve serbest eczaneler için hasta mahremiyetini ve veri güvenliğini en üst düzeyde tutmayı taahhüt eder.

---

## 🔒 Temel Güvenlik Prensipleri

1. **Sıfır Bulut / Sıfır Telemetri:**
   - Bu uygulama hiçbir analitik, telemetri, kullanım istatistiği veya kullanıcı verisi toplamaz.
   - İnternet bağlantısı gerektirmez; tamamen yerel ağ ve yerel disk üzerinde çalışır.
2. **Yerel Veri Depolama:**
   - Tüm hasta isimleri, reçete detayları, ilaç veritabanı ve geçmiş kayıtları bilgisayarınızın yerel kullanıcı dizininde (`%LOCALAPPDATA%\EczaneEtiket` veya proje kökündeki `data/` klasöründe) düz JSON olarak tutulur.
   - Bilgisayarınızın kontrolü dışındaki hiçbir sunucuya veri aktarılmaz.
3. **Admin PIN Koruması:**
   - Eczane personeli dışındaki kişilerin ilaç listesini, geçmişi veya eczane profilini değiştirmesini önlemek amacıyla Admin Paneline SHA-256 tabanlı yerel PIN kilidi konulabilir.

---

## 🚨 Güvenlik Açığı Bildirimi

Kod tabanında bir güvenlik açığı tespit ederseniz, lütfen bunu herkese açık bir Issue açarak bildirmek yerine, doğrudan depo yöneticisine [GitHub Security Advisory](https://github.com/Bluetwinklez/eczane-etiket/security/advisories) veya e-posta yoluyla iletiniz. Bildiriminiz en kısa sürede incelenecek ve gerekli düzeltme yayınlanacaktır.
