# Eczanem Mobil — Uygulama Planı

> Ekstra özellikler için ayrı bir telefon uygulaması. Görsel dil: kullanıcının paylaştığı **neobrutalism** eczane tasarımı (kalın siyah çizgiler, pastel renk blokları, büyük yuvarlak kartlar, alttan hap şeklinde sekme çubuğu, karakter illüstrasyonları).

## 1. Amaç

Eczanem masaüstü/web uygulaması kasada ve tezgâhta kullanılıyor. **Eczanem Mobil** ise eczacının ve eczane sahibinin **cebinde** olacak:

- Eczaneden uzaktayken satışları, stoku ve uyarıları görmek
- Telefon kamerasıyla barkod/karekod okutup anında stok, fiyat ve muadil sorgulamak
- Önemli olaylarda (kritik stok, soğuk zincir alarmı, geciken fatura) **anlık bildirim** almak
- Masaüstünde olmayan, telefona özgü ekstra özellikleri kullanmak (aşağıda)

Mobil uygulama **yeni bir veritabanı açmaz**: mevcut Eczanem sunucusunun API'sine bağlanır. Veriler tek yerde kalır.

## 2. Teknoloji Kararı

| Seçenek | Artısı | Eksisi |
|---|---|---|
| **A. PWA** (telefona kurulabilen web uygulaması) — **önerilen** | Mağaza onayı yok, aynı sunucudan yayınlanır (`/mobil`), mevcut oturum/cookie sistemiyle çalışır, çevrimdışı önbellek (service worker), güncelleme anında gelir | iOS'ta push bildirimi için iOS 16.4+ ve "Ana ekrana ekle" gerekir |
| B. Capacitor ile paketlenmiş PWA | A'nın tüm kodu + App Store / Play Store'da yayın, yerel kamera ve bildirim eklentileri | Mağaza hesabı ve yayın süreci gerekir |
| C. React Native / Expo | Tam yerel his | Ayrı kod tabanı, ekip için öğrenme maliyeti, API'ye token tabanlı giriş eklemek gerekir |

**Öneri:** Önce **A (PWA)** ile başla. Mağazada görünmek gerekirse aynı kodu **B (Capacitor)** ile sar; yeniden yazmak gerekmez.

- Dil: Vanilla JS + küçük bir derleme aracı (Vite) veya şimdiki gibi derlemesiz modüller
- Kamera ile okuma: tarayıcının `BarcodeDetector` API'si (Android/Chrome); yoksa `zxing-js` (yerel dosya olarak, çevrimdışı ilkesine uygun)
- Grafikler: SVG (web uygulamasındaki trend ve radar kodu yeniden kullanılır)
- Fontlar: yerelde barındırılan yazı tipleri (internet gerekmez). Başlık için kalın grotesk (ör. *Archivo* veya *Space Grotesk*, OFL), gövde için *Manrope*

## 3. Tasarım Sistemi (neobrutalism)

| Öğe | Değer |
|---|---|
| Çizgi | Her kart/buton: `2.5px solid #111` |
| Gölge | Sert, bulanıksız: `4px 4px 0 #111`; basılıyken `1px 1px 0` (buton "içeri gömülür") |
| Köşe | Kart 28px, buton ve çip tam hap (999px) |
| Arka plan renkleri | Mor `#9D8DF1`, turuncu `#F9B572`, yeşil `#B8E986`, pembe `#F4A6E8`, mercan `#F07560`, sarı `#F6E27F`, açık mavi `#8FD3E8` |
| Metin | Her zaman `#111` (pastel zemin üzerinde yüksek kontrast) |
| Başlık | 28–34px, kalın, sıkı satır aralığı |
| Alt gezinme | Siyah hap çubuk; pasif sekmeler gri daire içinde ikon, **aktif sekme beyaz hap + ikon + yazı** |
| Üst bar | Solda yuvarlak geri butonu (renkli), ortada başlık, sağda yuvarlak menü butonu |
| İllüstrasyon | "Eczacı" maskotu (gözlüklü, önlüklü), ilaç kutuları, blister, şişe; boş ekranlarda ve başarı ekranlarında |
| Hareket | Basınca 3px kayma + gölge küçülmesi; sayfa geçişinde kart yukarı kayarak gelir (hareket azaltma tercihine uyulur) |

Logo: Eczanem logosu (E + havan + artı) mobil uygulama ikonunda pastel zemin üzerinde, kalın siyah dış çizgiyle kullanılır.

## 4. Ekranlar

Referans görseldeki üç ekran temel alınır, eczane iş akışına uyarlanır.

1. **Giriş**: Logo, kullanıcı adı/şifre. İsteğe bağlı 4 haneli PIN ve parmak izi/yüz tanıma (WebAuthn) ile hızlı giriş.
2. **Ana Sayfa — "Eczane Özeti"** (turuncu zemin)
   - Üstte selam + maskot, filtre çipleri: *Bugün / Hafta / Ay*
   - Renkli kartlar: **Reçeteli satış** (yeşil), **Reçetesiz satış** (mercan), **Kritik stok**, **SKT uyarısı**. Her kartta tutar, geçen döneme göre fark ve küçük illüstrasyon
3. **Stok & Satış** (yeşil zemin)
   - Mor büyük kart: toplam satış + **dikey hap çubuk grafik** (aylar/günler, seçili çubuk mercan, üstte siyah balon etiket)
   - Altta şube kartları (pastel): şube adı + bu ayki fark (çoklu şube karşılaştırma)
4. **Tara** (orta sekme): Tam ekran kamera. Barkod/karekod okununca alttan kart açılır: ürün, stok, fiyat, raf konumu, SKT, muadiller, "istek defterine ekle" / "sayım adedi gir"
5. **Ürünler**: Arama, kategori çipleri, ürün kartları; ürün detayında fiyat geçmişi grafiği, partiler ve SKT
6. **Bildirimler**: Bildirim merkezinin mobil hali. Kaydırınca "tamamlandı" işaretlenir
7. **Başarı / Boş ekranlar** (pembe zemin): Maskot illüstrasyonu ve "Yeni ürün ekle" gibi tek büyük siyah hap buton
8. **Profil & Ayarlar**: Şube seçimi, bildirim tercihleri, PIN, tema

## 5. Ekstra Özellikler (mobile özgü)

| # | Özellik | Açıklama |
|---|---|---|
| 1 | Kamerayla barkod/karekod okuma | Ürün sorgu, sayım ve mal kabulde telefon el terminali gibi çalışır |
| 2 | Anlık (push) bildirimler | Kritik stok, soğuk zincir aralık dışı, geciken fatura, bugün nöbet, gelen transfer |
| 3 | Mobil stok sayımı | Rafta dolaşırken okut, adet gir; sayım masaüstündeki açık sayıma işlenir |
| 4 | Mobil mal kabul | Koliyi açarken karekodları okut; parti/SKT otomatik dolar |
| 5 | Çoklu şube karşılaştırma | Şubeler yan yana: ciro, kritik stok, hedef yüzdesi |
| 6 | Sesli not / sesli arama | "Parol stok" deyince ürün açılır; vardiya devir notu sesle |
| 7 | Fotoğrafla reçete arşivi | Reçetenin fotoğrafı satış kaydına eklenir (KVKK uyarısı ve şifreli saklama ile) |
| 8 | Raf fotoğrafı ile eksik tespiti | Raf fotoğrafı çekilip raf konumu bilgisiyle eşleştirilir (ileri faz) |
| 9 | Soğuk zincir hızlı giriş | Sabah bildirimiyle tek dokunuşta sıcaklık girişi |
| 10 | Günlük özet bildirimi | Akşam: ciro, satış adedi, hedefe kalan, yarın nöbet var mı |
| 11 | Müşteriyi arama/WhatsApp | Hatırlatma listesinden tek dokunuşla arama veya mesaj (onaylı müşteriler) |
| 12 | Çevrimdışı mod | Son ürün listesi ve fiyatlar önbellekte; bağlantı gelince sayım/istek kayıtları senkronlanır |
| 13 | Hızlı onaylar | Yüksek indirim, iade, sipariş onayı için eczacıya bildirim; telefondan onayla/reddet |
| 14 | Hedef oyunlaştırma | Personel hedef rozetleri, haftalık lider tablosu (isteğe bağlı) |
| 15 | Ana ekran widget'ı (Capacitor fazında) | Bugünkü ciro ve kritik stok sayısı |

## 6. Sunucu (API) Tarafında Gerekenler

Mevcut API'nin büyük kısmı doğrudan kullanılabilir (`/api/satislar/panel-ozet`, `/api/ilaclar`, `/api/bildirim-merkezi`, `/api/kalite/...`). Ek olarak:

- `GET /api/mobil/ozet?donem=gun|hafta|ay`: tek istekte ana sayfa kartları
- `GET /api/mobil/subeler-karsilastirma`: şube kartları için
- **Push abonelikleri**: `POST /api/mobil/push-abonelik` (Web Push, VAPID anahtarları sunucuda); bildirim merkezi olayları için tetikleyiciler
- **Onay akışı**: `onaylar` tablosu (tip, istek, durum) ve `POST /api/onaylar/:id/karar`
- **Senkron kuyruğu**: çevrimdışı yapılan sayım/istek kayıtları için idempotent uç (istemci tarafından üretilen `istek_id`)
- PIN/biyometrik giriş: WebAuthn kayıtları için `webauthn_anahtarlari` tablosu
- Mobil uygulama aynı sunucudan `/mobil` altında yayınlanır, böylece mevcut oturum çerezi ve güvenlik kuralları (giriş sınırı, rol yetkileri, işlem kaydı) aynen geçerli olur

## 7. Yol Haritası

| Faz | Süre (tahmini) | Kapsam |
|---|---|---|
| **0 — Altyapı** | 1 hafta | `/mobil` PWA iskeleti, manifest, service worker, tasarım sistemi bileşenleri (kart, hap buton, çip, alt gezinme), giriş |
| **1 — MVP** | 2–3 hafta | Ana sayfa özeti, Stok & Satış grafiği, ürün arama/detay, kamerayla barkod sorgu, bildirim listesi |
| **2 — Saha işleri** | 2–3 hafta | Mobil sayım, mobil mal kabul, soğuk zincir hızlı giriş, çevrimdışı mod + senkron |
| **3 — Bildirim ve onay** | 2 hafta | Web Push, günlük özet, hızlı onay akışı, PIN/biyometrik giriş |
| **4 — Mağaza (isteğe bağlı)** | 1–2 hafta | Capacitor paketleme, ikonlar, mağaza görselleri, Android/iOS yayın |
| **5 — İleri özellikler** | sürekli | Sesli komut, reçete fotoğraf arşivi, şube karşılaştırma, oyunlaştırma, widget |

Her fazın sonunda: otomatik testler (API için node:test, ekranlar için Playwright mobil görünüm), telefonda gerçek cihaz denemesi, sürüm notu.

## 8. Kabul Kriterleri (MVP)

- Android Chrome ve iOS Safari'de ana ekrana kurulabilir; açılış 2 saniyenin altında
- Kamera ile EAN-13 ve GS1 karekod okunur, ürün kartı 1 saniye içinde açılır
- Tüm ekranlar 360px genişlikte taşmadan çalışır, dokunma hedefleri en az 44px
- Renk kontrastı WCAG AA (pastel zemin + siyah metin)
- İnternet yokken son görülen ürün listesi açılır, yapılan sayım kaydı bağlantı gelince gönderilir
- Rol yetkileri web uygulamasıyla aynıdır (kasiyer yönetim ekranlarını görmez)

## 9. Karar Bekleyen Konular

1. Uygulama yalnızca **personel** için mi, yoksa ileride **müşteri** tarafı da olacak mı? (Müşteri tarafı: reçete hatırlatma, sipariş/ayırtma, nöbetçi eczane: ayrı kimlik doğrulama ve KVKK onayı gerektirir.)
2. Mağazada yayın gerekli mi (Faz 4), yoksa PWA yeterli mi?
3. Push bildirimleri için sunucunun internete açık bir adresi (HTTPS) olacak mı? Yoksa yalnızca eczane içi ağda mı çalışacak?
4. Uygulama adı ve ikon: "Eczanem Mobil" + mevcut logo uygun mu?
