# App Store metinleri — Eczam

Sınırlar: ad ≤ 30, alt başlık ≤ 30, anahtar kelimeler ≤ 100, tanıtım metni ≤ 170, açıklama ≤ 4000 karakter.
`mobil-uygulama/tests/kabuk.test.js` bu sınırları otomatik denetler; metni değiştirince `cd mobil-uygulama && npm test` çalıştırın.

> **Dil durumu:** Uygulama arayüzü **Türkçe ve İngilizce** (cihaz diline göre açılır; Profil'den değiştirilir). Sunucudan gelen içerik (ürün/müşteri adları) çevrilmez. App Store sayfası Türkçe (ana dil) + İngilizce yayınlanabilir; Türkçe ekran görüntüleri `docs/magaza/`, İngilizce olanlar `docs/magaza/en/` içinde.

## Türkçe (tr) — ana dil

- **Ad:** Eczam
- **Alt başlık:** Eczane özeti, stok ve barkod
- **Anahtar kelimeler:** `eczane,ilaç,stok,barkod,karekod,satış,SKT,envanter,reçete,pos,sayım,muadil,kasa`
- **Tanıtım metni:** Eczanenizin satışlarını, kritik stoklarını ve SKT uyarılarını cebinizden izleyin. Kameranızla barkodu okutun, ürünü anında sorgulayın.
- **Bu sürümde yenilikler (1.0.0):** İlk sürüm.

**Açıklama:**

```
Eczam, eczane çalışanları ve sahipleri için telefon uygulamasıdır. Eczanenizin kendi Eczam sunucusuna bağlanır; verileriniz sizin sunucunuzda kalır.

• ECZANE ÖZETİ — Bugün, hafta ve ay için reçeteli / reçetesiz satış tutarları, önceki dönemle karşılaştırma
• SATIŞ GRAFİĞİ — Gün gün satış çubukları ve şube karşılaştırması
• ÜRÜN SORGULAMA — Ürün adı veya barkodla arayın; stok, fiyat, raf, parti/SKT ve muadilleri görün
• KAMERAYLA TARAMA — Barkod ve karekodu (GS1 DataMatrix) kameranızla okutun; stok sayımı için "Sayım" modunu kullanın
• BİLDİRİM MERKEZİ — Kritik stok, yaklaşan son kullanma tarihi ve diğer uyarılar tek ekranda
• SOĞUK ZİNCİR — Buzdolabı sıcaklığını saniyeler içinde kaydedin
• ÇEVRİMDIŞI — İnternet kesilince son görüntülenen veriler açılır; yaptığınız kayıtlar bağlantı gelince otomatik gönderilir
• GÜVENLİK — Kullanıcı adı ve şifreyle giriş, rol bazlı yetki, HTTPS ile şifreli bağlantı

Kullanmak için eczanenizde Eczam sunucusunun kurulu olması ve yöneticinizden bir kullanıcı hesabı almanız gerekir. Kamera yalnızca barkod okumak için kullanılır; görüntü kaydedilmez ve hiçbir yere gönderilmez.

Gizlilik: reklam, takip veya analiz yoktur.
Bu uygulama tıbbi tavsiye vermez ve tanı koymaz.
```

## English (en)

- **Name:** Eczam
- **Subtitle:** Pharmacy stats, stock & scan
- **Keywords:** `pharmacy,drug,stock,barcode,qr,sales,expiry,inventory,prescription,pos,count,generic`
- **Promotional text:** Track your pharmacy's sales, low stock and expiry alerts from your pocket. Scan a barcode with the camera and look up a product instantly.

**Description:**

```
Eczam is the mobile app for pharmacy staff and owners. It connects to your own pharmacy's Eczam server; your data stays on your server.

• PHARMACY SUMMARY — Prescription and over-the-counter sales for today, this week and this month, compared with the previous period
• SALES CHART — Daily sales bars and branch comparison
• PRODUCT LOOKUP — Search by name or barcode; see stock, price, shelf, batch/expiry and alternatives
• CAMERA SCANNING — Scan barcodes and GS1 DataMatrix codes; use "Count" mode for stock counts
• NOTIFICATION CENTER — Low stock, approaching expiry dates and other alerts in one place
• COLD CHAIN — Log the fridge temperature in seconds
• OFFLINE — Last viewed data opens without internet; entries you make are sent automatically when you are back online
• SECURITY — Username and password sign-in, role-based permissions, encrypted HTTPS connection

To use it, your pharmacy needs an Eczam server and you need an account from your administrator. The camera is used only to scan barcodes; images are never saved or sent anywhere.

Privacy: no ads, tracking or analytics.
This app does not give medical advice or diagnose.
```

## Ortak alanlar

- **Telif hakkı:** 2026 Bluetwinklez
- **Destek URL'si:** https://github.com/Bluetwinklez/eczane-etiket
- **Gizlilik politikası URL'si:** https://github.com/Bluetwinklez/eczane-etiket/blob/main/docs/PRIVACY.md
- **Pazarlama URL'si:** boş
- **İletişim e-postası:** doflerim@gmail.com
