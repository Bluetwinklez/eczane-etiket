# Değişiklik Günlüğü

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) benzeri bir
sürümleme kullanır (MAJOR.MINOR.PATCH). Sürüm numarası `eczane_etiket/__init__.py`
içindeki `__version__` değişkeninde tutulur ve uygulama içinde "Hakkında"
penceresinde gösterilir.

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
