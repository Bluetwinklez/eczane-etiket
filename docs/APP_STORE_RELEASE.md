# App Store yayın rehberi — Eczam

Mağaza metinleri: [`STORE_LISTING.md`](STORE_LISTING.md) · Gizlilik politikası: [`PRIVACY.md`](PRIVACY.md) · Ekran görüntüleri: [`magaza/`](magaza/)

> **Dürüst durum özeti**
> - Hazır: iOS kabuğu (Capacitor + Swift Package Manager), ikon, açılış ekranı, izin metinleri (tr + en), GitHub Actions iş akışları, imzalama betikleri, mağaza metinleri, ekran görüntüleri, gizlilik politikası.
> - **Doğrulandı:** GitHub'daki macOS çalıştırıcısında imzasız iOS cihaz derlemesi (`iOS derleme kontrolü`) **BUILD SUCCEEDED** verdi; yani Xcode projesi ve Swift Paketleri derleniyor.
> - **Henüz doğrulanmadı:** imzalama, arşivleme, TestFlight yüklemesi (`Eczam iPhone TestFlight` hiç çalıştırılmadı) ve uygulamanın gerçek iPhone'da çalışması (kamera izni, `capacitor://` ↔ uzak sunucu geçişi). İlk çalıştırmada küçük düzeltmeler çıkabilir.
> - Uygulama arayüzü **Türkçe ve İngilizce** (sunucudan gelen ürün/müşteri adları çevrilmez). App Store sayfası Türkçe (ana dil) + İngilizce eklenebilir (bkz. STORE_LISTING.md).
> - Yalnızca **iPhone** (iPad ve Android yok).

## 1. Önce bilinmesi gerekenler

Eczam, **eczane çalışanları içindir**; her eczanenin kendi sunucusu vardır. Uygulama ilk açılışta sunucu adresini sorar. Bu yüzden:

- Apple'ın inceleme ekibi uygulamayı deneyebilmek için **herkese açık bir HTTPS demo sunucu** ve **demo hesap** ister (bkz. 6. bölüm). Yerel ağ adresi çalışmaz.
- "Web sitesini saran uygulama" olarak görülme riski vardır (Guideline 4.2). Önlemler: yerel bağlantı ekranı, kamerayla yerel barkod/karekod okuma, çevrimdışı önbellek ve kuyruk. Red gelirse en güçlü adım yerel bildirim (push) eklemektir.
- Dağıtım yolu önerisi: önce **TestFlight**, sonra **Listelenmemiş (Unlisted) dağıtım** (arama sonuçlarında görünmez, bağlantıyla indirilir). Normal herkese açık yayın da mümkündür.

## 2. GitHub Secrets (Settings → Secrets and variables → Actions)

NFC Tag Master reposundan kopyalayın:

| Secret | Not |
|---|---|
| `IOS_APPSTORE_P12_BASE64`, `IOS_APPSTORE_P12_PASSWORD` | Dağıtım sertifikası, aynı kalır |
| `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, `ASC_API_PRIVATE_KEY_BASE64` | Yükleme anahtarı |
| `ASC_ADMIN_KEY_ID`, `ASC_ADMIN_PRIVATE_KEY` | **Varsa** kopyalayın: bundle ID ve profili iş akışı kendisi oluşturur. NFC reposunun secret listesinde yoksa atlayın ve aşağıdaki profili hazırlayın |
| `IOS_TEAM_ID` | `65S88D9LF5` |
| `IOS_BUNDLE_ID` | **Değiştirin:** `com.bluetwinklez.eczam` (NFC değerini kopyalamayın!) |
| `IOS_APPSTORE_PROFILE_BASE64` | Yalnızca Admin anahtarı yoksa gerekli (aşağıda) |

İş akışı secret'ların varlığını ve `IOS_BUNDLE_ID` değerinin doğruluğunu ilk adımda denetler; eksikse hangisi olduğunu yazar.

**Admin anahtarı yoksa profil nasıl hazırlanır:**
1. <https://developer.apple.com/account> → **Certificates, IDs & Profiles** → **Identifiers** → **+** → *App IDs* → *App* → Description `Eczam`, Bundle ID (Explicit) `com.bluetwinklez.eczam` → **Register** (özel yetenek seçmeyin).
2. **Profiles** → **+** → *App Store Connect* → App ID'yi seçin → dağıtım sertifikanızı seçin → ad `Eczam App Store` → **Generate** → **Download**.
3. Bilgisayarınızda: `base64 -i Eczam_App_Store.mobileprovision | pbcopy` (Mac) → çıktıyı `IOS_APPSTORE_PROFILE_BASE64` secret'ı olarak yapıştırın.

> Anahtar, sertifika (`.p12`, `.p8`), profil ve keystore dosyaları **asla depoya eklenmez**; `.gitignore` ve bir test bunu denetler.

## 3. App Store Connect'te sizin yapacaklarınız

<https://appstoreconnect.apple.com> adresinde:

### 3.1 Uygulamayı oluşturun (TestFlight yüklemesinden ÖNCE)
**Uygulamalarım (My Apps) → sol üstte “+” → Yeni Uygulama**
- Platformlar: **iOS**
- Ad: **Eczam** (alınmışsa “Eczam Mobil” veya “Eczam: Eczane Yönetimi”)
- Ana dil: **Türkçe**
- Paket Kimliği (Bundle ID): **com.bluetwinklez.eczam** (listede yoksa önce 2. bölümdeki adımla kaydedin ya da bir kez `provision_only` çalıştırın)
- SKU: `eczam-mobil-1`
- Kullanıcı erişimi: **Tam Erişim** → **Oluştur**

### 3.2 Uygulama Bilgileri
**Uygulamanız → sol menü “Genel” altında Uygulama Bilgileri**
| Alan | Değer |
|---|---|
| Alt başlık | Eczane özeti, stok ve barkod |
| Kategori | Birincil **İş (Business)**, ikincil boş (veya Tıp) |
| İçerik Hakları | “Üçüncü taraf içeriği içermiyor” |
| Yaş Derecelendirmesi → **Düzenle** | Tüm sorulara “Yok/Hayır” → **4+** |

### 3.3 Fiyat ve Kullanılabilirlik
**Sol menü → Fiyatlandırma ve Kullanılabilirlik** → Fiyat: **Ücretsiz (0 ₺)** → ülkeler: Türkiye (ve isterseniz diğerleri).

### 3.4 Uygulama Gizliliği
**Sol menü → Uygulama Gizliliği**
- **Gizlilik Politikası URL'si:** `https://github.com/Bluetwinklez/eczane-etiket/blob/main/docs/PRIVACY.md` (değişiklikler `main`'e birleştirildikten sonra açılır)
- **Veri Türleri → Başla:**
  - Uygulama verilerini **siz** toplamıyorsanız (her eczane kendi sunucusunu işletiyor): **“Hayır, bu uygulamadan veri toplamıyoruz”** → **Kaydet**.
  - Sunucuyu **siz** işletiyorsanız: *Ad*, *Kullanıcı Kimliği*, *Satın alma geçmişi* için **Uygulama İşlevselliği**, “Kullanıcıya bağlı”, **Takip için kullanılmıyor** işaretleyin.
- Kamera görüntüsü cihazdan çıkmaz; “toplanan veri” sayılmaz. Takip (tracking): **Hayır**.
- **Yayınla** düğmesine basın.

### 3.5 TestFlight yüklemesi (iş akışı) — önce sizden onay istenir
1. GitHub → **Actions → Eczam iPhone TestFlight → Run workflow**
2. Önce **provision_only = true** ile deneyin (yalnızca imzalama kurulumu). Yeşilse:
3. **upload = false** ile çalıştırın (derle ve imzala, yükleme yok).
4. Son olarak **upload = true** ile çalıştırın. (Ya da etiket itin: `git tag ios-v1.0.0 && git push origin ios-v1.0.0`.)
5. 5–30 dakika sonra **App Store Connect → Uygulamanız → TestFlight** sekmesinde derleme görünür. “Dışa aktarma uyumluluğu” sorusu çıkarsa: uygulamada `ITSAppUsesNonExemptEncryption = NO` zaten var; çıkarsa “Hayır / yalnızca standart HTTPS” yanıtlayın.
6. Durumu görmek için: **Actions → App Store durumu → Run workflow** (derleme işlendi mi, sürüm hangi aşamada).

### 3.6 İç test
**TestFlight → İç Test → “+” (Grup oluştur)** → kendinizi ekleyin → iPhone'da **TestFlight** uygulamasından Eczam'ı kurun ve kontrol listesini (7. bölüm) uygulayın.

### 3.7 Sürüm sayfası
**Sol menü → iOS Uygulaması → 1.0 Sürümü Hazırlanıyor**
- **Ekran görüntüleri:** *iPhone 6,9″ Ekran* alanına Türkçe sayfa için `docs/magaza/`, İngilizce sayfa için `docs/magaza/en/` içindeki 6 dosyayı sırayla yükleyin (1320×2868). Diğer iPhone boyutları otomatik türetilir. Uygulama yalnızca iPhone olduğu için iPad görüntüsü gerekmez.
- **Tanıtım Metni, Açıklama, Anahtar Kelimeler, Destek URL'si, Bu Sürümdeki Yenilikler:** [STORE_LISTING.md](STORE_LISTING.md)'den kopyalayın. Telif Hakkı: `2026 Bluetwinklez`.
- **Derleme (Build):** “Derleme Ekle” → TestFlight'a yüklediğiniz derlemeyi seçin.
- **Uygulama İnceleme Bilgileri:** ad, soyad, telefon, e-posta `doflerim@gmail.com`; **Oturum açma gerekli** kutusunu işaretleyin ve demo kullanıcı adı/şifresini girin; **Notlar** alanına 5. bölümdeki metni yapıştırın.
- **Sürüm Yayın Seçeneği:** isterseniz “Elle yayınla” seçin.

### 3.8 Gönder
Sayfanın sağ üstünde **İncelemeye Ekle → İncelemeye Gönder**. Genelde 24–48 saat. Red gelirse neden **Çözüm Merkezi (Resolution Center)**'nde yazar.

## 4. Teknik ayarlar (zaten yapıldı — kontrol için)

| Ayar | Değer | Nerede |
|---|---|---|
| Bundle ID | `com.bluetwinklez.eczam` | `capacitor.config.json`, Xcode projesi, iş akışı (test denetler) |
| Diller | tr (ana) + en (izin metinleri) | `ios/App/App/{tr,en}.lproj/InfoPlist.strings`, `CFBundleLocalizations` |
| Kamera / yerel ağ izni | tr + en metin | `InfoPlist.strings` |
| Şifreleme beyanı | `ITSAppUsesNonExemptEncryption = false` | `Info.plist` |
| Yerel ağ HTTP | yalnızca yerel adresler; internet adresleri HTTPS zorunlu | `Info.plist` (ATS), `www/baglan.js` |
| İkon | 1024×1024, RGB, alfa yok | `AppIcon.appiconset` (test denetler) |
| Cihaz | yalnızca iPhone, yalnızca dikey | `TARGETED_DEVICE_FAMILY = 1` |
| Minimum iOS | 14.0 | Xcode projesi |
| Sürüm / build | sürüm `mobil-uygulama/package.json`, build = GitHub çalıştırma numarası | `tool/ios_signing.rb` |

## 5. İnceleme notu (App Review Information → Notes)

İnceleme ekibi İngilizce okuduğu için not İngilizce. Demo bilgilerinizi doldurun:

```
Eczam is a business app for pharmacy staff. Each pharmacy runs its own Eczam server,
so the app asks for a server address on first launch. A public demo server with sample
(non-real) data is provided for review.

HOW TO TEST:
1. Open the app. In "Server address" enter:  demo.example.com   (replace with the real demo host)
2. Sign in with username: apple-demo   password: <demo password>
3. Browse the Summary, Sales, Products and Notifications tabs.
4. On the Scan tab the app asks for camera permission (used only to scan barcodes; images are
   never saved or sent). Without a camera, type this barcode in the box and tap search: 8699504010029
5. Profile tab: sign out, "Change server", and the account/data deletion information.

Notes: No in-app purchases, ads or tracking. The app gives no medical advice. Accounts are
created and deleted by the pharmacy administrator (users cannot self-register); the Profile
screen explains how data deletion works.
```

## 6. Demo sunucu (inceleme için zorunlu)

```bash
cd web && npm ci
PORT=3000 TRUST_PROXY=1 COOKIE_SECURE=1 ECZANEM_GIZLILIK_EPOSTA=doflerim@gmail.com npm start
```

- Önüne **Caddy** veya **nginx + Let's Encrypt** koyun (HTTPS zorunlu).
- Web arayüzünde **Kullanıcılar → Yeni** ile `apple-demo` (rol: eczacı) oluşturun, **bir kez kendiniz giriş yapıp şifreyi değiştirin** (yönetici tarafından verilen şifreler ilk girişte değişmek zorunda; incelemeci bu ekranda takılmasın).
- Demo veride gerçek hasta/ürün verisi olmasın. Sunucu inceleme süresince (birkaç gün) açık kalmalı.
- Gizlilik sayfası sunucudan da yayınlanır: `https://<sunucu>/gizlilik.html`.

## 7. Telefonda deneme kontrol listesi (TestFlight)

- [ ] Bağlantı ekranı açılıyor; yanlış adreste hata mesajı çıkıyor
- [ ] `https://` adresiyle bağlanınca giriş ekranı açılıyor; uygulamayı kapatıp açınca kayıtlı sunucuya gidiyor
- [ ] Tara: kamera izni soruluyor (Türkçe metin), barkod okununca ürün kartı açılıyor
- [ ] Profil → “Sunucuyu değiştir” bağlantı ekranına dönüyor
- [ ] Uçak modunda açılıyor (“Yine de aç”), tekrar bağlanınca bekleyen kayıtlar gidiyor
- [ ] Açılış ekranı ve ikon doğru görünüyor
- [ ] Telefon dili İngilizceyken izin penceresi İngilizce metinle geliyor

## 8. Red riskleri

| Risk | Önlem |
|---|---|
| **4.2 Asgari işlevsellik** (en olası) | İnceleme notunda yerel kamera tarama, çevrimdışı kuyruk ve bağlantı ekranını vurgulayın; gerekirse yerel bildirim ekleyin |
| **2.1 Uygulama tamlığı** | Çalışan HTTPS demo + demo hesap (6. bölüm) |
| **5.1.1 Gizlilik** | Gizlilik URL'si açılıyor mu kontrol edin; veri silme bilgisi Profil'de |
| **1.4.1 Tıbbi** | Uygulama tavsiye vermez/tanı koymaz; açıklamada belirtildi |

## 9. Güncelleme yayınlama

- **Arayüz/ekranlar** (`web/public/mobil/`): sunucudan gelir, mağaza güncellemesi gerekmez (`sw.js` içindeki `SURUM` değerini artırın).
- **Kabuk** (ikon, izinler, bağlantı ekranı): `mobil-uygulama/package.json` sürümünü artırın → iş akışını çalıştırın (build numarası otomatik artar) → yeni sürümü incelemeye gönderin.

## 10. Henüz yok

Anlık bildirim (push), Face ID girişi, iPad ve Android. İstenirse sonraki sürümlerde eklenir; Android için aynı kabuk `npx cap add android` ile üretilebilir.
