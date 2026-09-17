# Değişiklik Günlüğü

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) benzeri bir
sürümleme kullanır (MAJOR.MINOR.PATCH). Sürüm numarası `eczane_etiket/__init__.py`
içindeki `__version__` değişkeninde tutulur ve uygulama içinde "Hakkında"
penceresinde gösterilir.

## [1.6.0]

- **Kalıcı Tema ve Yazıcı Tercihleri:** Arayüz teması (Gündüz, Gece Nöbeti, Eczane Yeşili) ve seçilen yazıcı eczane profiline kaydedilir; uygulama yeniden açıldığında otomatik yüklenir.
- **Akıllı İlaç Ambalajı Çıkarma:** İlaç adı seçildiğinde (`AUGMENTIN 14 TABLET`, `PAROL 20 TABLET` vb.) ambalaj miktarı derişimlerden (`/5ml`) bağımsız olarak doğru ayıklanır ve forma doldurulur.
- **Anında Otomatik SGK Bitiş Hesabı:** İlaç veya dozaj seçildiği anda SGK tekrar reçete yazdırabilme tarihi hesaplanır; tanımsız `_auto_calc_refill_date` hatası giderildi.
- **Genişletilmiş Tıbbi Uyarı Çipleri (8 Seçenek, 2 Satır):** `🧊 Buzdolabında Saklayınız (2-8°C)` (Soğuk Zincir) ve `⏱️ Açıldıktan Sonra 15 Gün` (Kullanım Ömrü) çipleri eklendi.
- **Toplu Reçete Ayrıştırmasında Tam Destek:** Hızlı yapıştır ile Medula'dan aktarılan reçetelerde ambalaj adedi, dozaj çizelgesi ve SGK kutu bitiş tarihi otomatik üretilir.
- **Geçmiş & CSV Raporlama:** Geçmiş tablosuna ve CSV dışa aktarıma "SGK Bitiş" sütunu eklendi; geçmişten tekrar yazdırmada hedef yazıcı seçimi entegre edildi.
- **Admin Paneli Profil Ayarları:** Eczane profili düzenleme formuna tema ve sistem yazıcısı seçicileri eklendi.
- **GitHub Topluluk & CI/CD Dağıtımı:** Çoklu platform CI testleri (`.github/workflows/test.yml`), Windows bağımsız `.exe` derleme ve release iş akışı (`.github/workflows/release.yml`), `pyproject.toml`, `baslat.bat`, `CONTRIBUTING.md` ve `SECURITY.md` eklendi.
- **Arayüz ve Dokümantasyon:** v1.6.0 yüksek çözünürlüklü ekran görüntüsü ve kapsamlı README mimari kılavuzu yenilendi.

## [1.5.0]

- **3 Temalı Dinamik Tasarım Motoru:** ☀️ Gündüz (Ferah Medikal), 🌙 Gece Nöbeti (Dark Mode), 🌿 Eczane Yeşili (Geleneksel Medikal) ve üst barda anlık tema değiştirici
- **Pediatrik Mod (Çocuk Şurup & Damla Asistanı):** Çocuk tedavileri için tek tıkla 5ml / 2.5ml ölçek ve damla doz kalıpları
- **Etiket Üzerinde Görsel Doz Çizelgesi:** Yaşlı ve yabancı hastalar için etiket üzerine 4 sütunlu `SABAH | ÖĞLE | AKŞAM | GECE` görsel matrisi basımı
- **SGK Kutu Bitiş & Tekrar Alım Asistanı:** Ambalaj miktarı ve günlük doza göre kutu bitiş tarihini otomatik hesaplama ve etikete yazdırma
- **Besin & İlaç Etkileşim Asistanı:** Süt ürünleri, greyfurt, çay/kahve ve alkol uyarılarını tek tıkla prospektüs notuna ekleme
- **Doğrudan Sistem Yazıcısı Seçimi:** Varsayılan OS yazıcısını değiştirmeden doğrudan termal etiket yazıcısına çıktı gönderme

## [1.4.0]

- **Modern Slate & Medical Blue Tasarım:** Segoe UI tipografisi, şık koyu lacivert başlık ve canlı önizleme etiketi kartı
- **Doz Zamanı & Açlık/Tokluk Asistanı Matrisi:** ☀️ Sabah, 🌤️ Öğle, 🌙 Akşam, 🛌 Gece ve 🍽️ Tok, 🥣 Aç, 🥪 Ara çipleri + 1x1, 2x1, 3x1, 4x1 doz çarpanları
- **Özel Eczane Uyarı Çipleri:** Çalkalayınız, Uyku Yapabilir, Sütle Almayınız, Bol Su İle, Kutuyu Bitiriniz, Işıktan Koruyunuz etiketleri ve PDF güvenlik bandı
- **Majistral (Yapma İlaç) Modu:** Eczane yapımı ilaçlar için tek tıkla 30 gün SKT, saklama koşulları ve haricen kullanım talimatları
- **1D Barkod (Code128) Basımı:** Termal ve A4 etiketlerin altına taranabilir barkod basma desteği
- **Hızlı Şablon Değiştirici:** Üst başlıktan 50x30, 60x40, 80x50 mm etiket boyutlarını doğrudan seçebilme
- **Test Baskısı & Tekrar Yazdır:** Tek tıkla yazıcı kalibrasyon testi ve geçmişten tek tuşla tekrar yazdırma

## [1.3.0]

- Admin Panelinde silme onayı: ilaç, stok kaydı, personel ve talimat şablonu
  silmeden önce artık onay isteniyor (önceden yalnızca profil silmede vardı)
- Geçmiş & Raporlar sekmesine tarih aralığı filtresi (Başlangıç/Bitiş) ve
  filtreli CSV dışa aktarım eklendi
- Tedavi bitiş tarihi "GG.AA.YYYY" formatında değilse yazdırma/kaydetmeden
  önce uyarı gösteriliyor
- Forma "Ambalaj Bilgisi (opsiyonel)" alanı eklendi (etiket başlığında ilaç
  adının yanına eklenir; `LabelEntry.package_info` daha önce vardı ama
  formda kullanılmıyordu)
- İlaç örnek listesine 7 yeni, iyi bilinen ürün eklendi (28 → 35)

## [1.2.0]

- İlk çalıştırmada kısa bir kurulum penceresiyle eczane adı/telefonu sorma
- Uygulama ikonu (pencere başlığı + Windows .exe ikonu)
- "Hakkında" penceresi (sürüm numarası, lisans, kaynak kod bağlantısı)

## [1.1.0]

- **Hızlı Yapıştır**: Reçete metnini yapıştırıp ilaçları otomatik ayrıştırarak
  toplu etiket listesine aktarma (Medula bağlantısı değildir, tamamen yerel
  metin ayrıştırmadır)
- İstatistik/özet panosu (Admin Paneli → İstatistikler): en çok basılan
  ilaçlar, en aktif personel, son 7 günün etiket sayısı
- Stokta düşük miktar uyarısı: ürün başına opsiyonel minimum stok eşiği
- İsteğe bağlı QR kod (yalnızca A4 sayfa şablonunda): ilaç bilgilerini
  içeren, tamamen çevrimdışı okunan küçük bir kod

## [1.0.0]

- İlk MVP: Hızlı Etiket ekranı, forma göre değişen talimat butonları, tekli/
  toplu etiket modu, Admin Paneli (profiller, ilaç listesi, talimat
  şablonları, personel, geçmiş/raporlar, stok/SKT takibi, yedekleme),
  barkod okuyucu desteği, Türkçe karakter desteği (gömülü DejaVu Sans),
  Windows .exe paketleme (PyInstaller)
