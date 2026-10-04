# Eczanem Mobil — App Store Yayın Rehberi

Bu rehber, `mobil-uygulama/` klasöründeki iOS uygulamasını **TestFlight**'a ve oradan **App Store**'a göndermek için gereken her adımı sırayla anlatır.

> **Dürüst durum özeti**
> - Kod tarafı hazır: uygulama kabuğu (Capacitor + Swift Package Manager), ikon, açılış ekranı, izin metinleri, gizlilik politikası, mağaza ekran görüntüleri ve metinleri bu depoda.
> - Bu depo Linux ortamında hazırlandı. **Xcode projesi henüz bir Mac'te derlenmedi ve gerçek iPhone'da denenmedi.** İlk derlemede küçük düzeltmeler çıkabilir; bunlar ilk gün çözülür.
> - **Sizin yapmanız gerekenler** (Apple hesabı, imzalama, Mac, herkese açık demo sunucu) 1. bölümde.

---

## 1. Sizin yapmanız gerekenler (kodla çözülemez)

| # | Ne | Neden | Süre / Maliyet |
|---|---|---|---|
| 1 | **Apple Developer Program** üyeliği | Mağazaya yüklemek için şart. <https://developer.apple.com/programs/enroll/> | Yıllık 99 USD; onay 1–2 gün (şirket adına ise D-U-N-S numarası gerekir, daha uzun sürebilir) |
| 2 | Bir **Mac** + güncel **Xcode** (App Store'dan ücretsiz) | iOS uygulaması yalnızca Xcode ile derlenip imzalanır | Mac yoksa bulut Mac kiralanabilir (ör. MacinCloud) veya Codemagic/Xcode Cloud gibi bir CI |
| 3 | **Herkese açık HTTPS sunucu** (örn. `https://demo.eczaneniz.com`) | Apple'ın inceleme ekibi uygulamayı kendi ağından deneyecek. Yerel ağ adresi (192.168…) çalışmaz | Küçük bir VPS + alan adı + Let's Encrypt |
| 4 | **Demo kullanıcı** (gerçek hasta/ilaç verisi olmayan) | İncelemeciye verilecek | 5 dakika (bkz. 5. bölüm) |
| 5 | **Gizlilik politikası adresi** | App Store Connect zorunlu tutar | Sunucu hazırsa otomatik: `https://<sunucu>/gizlilik.html` |
| 6 | **Destek adresi** (e-posta ya da web sayfası) | Zorunlu alan | — |

### Önce bir karar: "Herkese açık" mı, "Yalnızca çalışanlar" mı?

Eczanem Mobil **eczane çalışanları içindir**; her eczanenin kendi sunucusu vardır. Apple'ın normal yayını bunun için en uygun yol olmayabilir. Üç seçenek:

1. **Herkese açık App Store** — Herkes indirebilir, ilk açılışta kendi eczane sunucusunun adresini girer. İnceleme daha sıkıdır (aşağıda "4.2 riski").
2. **Unlisted App Distribution (listelenmemiş)** — Arama sonuçlarında çıkmaz, yalnızca doğrudan bağlantıyla indirilir. Çalışanlara link verirsiniz. **Bu uygulama için önerilen yoldur.** Başvuru: App Store Connect → uygulama → "Distribution" bölümünden Apple'a form gönderilir.
3. **Apple Business Manager "Özel Uygulama" (Custom App)** — Yalnızca belirli kuruluşlara dağıtılır.

Hızlıca denemek için hepsinden önce **TestFlight** (3. bölüm) kullanın; incelemesi daha hafiftir.

---

## 2. Mac'te projeyi açma (ilk kurulum)

```bash
git clone <depo-adresi> && cd <depo>/mobil-uygulama
npm install                 # Capacitor paketlerini indirir
npm run senkron             # logo + yazı tiplerini kopyalar, iOS projesini günceller
npm run ios:ac              # Xcode'da açar
```

> Node.js 18+ gerekir. CocoaPods **gerekmez** (Swift Package Manager kullanılır).

Xcode'da:

1. Sol listeden **App** projesini → **App** hedefini seçin → **Signing & Capabilities**.
2. **Team**: kendi Apple Developer takımınızı seçin. "Automatically manage signing" açık kalsın.
3. **Bundle Identifier**: varsayılan `com.eczanem.mobil`. Bu adres dünyada tekildir; başkası aldıysa değiştirin (örn. `com.eczaneadiniz.eczanem`). Değiştirirseniz `capacitor.config.json` içindeki `appId` değerini de aynı yapıp `npm run senkron` çalıştırın.
4. **General → Version** `1.0`, **Build** `1`. Her yüklemede Build numarasını 1 artırın.
5. Üstten hedef olarak bir simülatör seçip ▶ ile çalıştırın. Bağlantı ekranı açılmalı; sunucu adresinizi yazınca `/mobil/` açılır.
6. **Gerçek iPhone'da** deneyin (USB ile bağlayıp hedef seçin): kamera izni sorulmalı ve barkod okutulabilmeli. Simülatörde kamera yoktur.

### İlk derlemede kontrol listesi

- [ ] Bağlantı ekranı açılıyor, yanlış adreste hata mesajı çıkıyor
- [ ] `https://` sunucuya bağlanınca giriş ekranı açılıyor
- [ ] Uygulamayı kapatıp açınca kayıtlı sunucuya doğrudan gidiyor
- [ ] Tara sekmesi: kamera izni soruluyor, barkod okununca ürün kartı açılıyor
- [ ] Profil → "Sunucuyu değiştir" bağlantı ekranına dönüyor
- [ ] Uçak modunda uygulama açılıyor, "Yine de aç" ile önbellekten çalışıyor
- [ ] iPhone'u yan çevirince bozulma yok (uygulama dikey kilitli)

---

## 3. TestFlight ile test dağıtımı

1. Xcode'da hedef olarak **Any iOS Device (arm64)** seçin.
2. **Product → Archive**. Bittiğinde Organizer açılır.
3. **Distribute App → App Store Connect → Upload**. Varsayılan seçenekleri onaylayın.
4. <https://appstoreconnect.apple.com> → **Uygulamalarım → "+" → Yeni Uygulama** (henüz yapmadıysanız):
   - Platform: iOS · Ad: **Eczanem** (alınmışsa "Eczanem Mobil" veya "Eczanem – Eczane Yönetimi") · Birincil dil: Türkçe · Bundle ID: yukarıdaki · SKU: `eczanem-mobil-1`
5. Yüklenen derleme birkaç dakika "işleniyor" görünür, sonra **TestFlight** sekmesinde belirir.
6. **İç test** (App Store Connect kullanıcıları): inceleme yok, hemen kullanılır.
7. **Dış test** (herkes, e-posta/bağlantıyla): kısa bir "Beta Uygulama İncelemesi" gerekir (genelde 1 gün).

İlk testleri **gerçek eczanede 1–2 hafta** yapın; sonra mağazaya gönderin.

---

## 4. App Store'a gönderme

### 4.1 Mağaza sayfası metinleri (kopyalayıp yapıştırın)

**Ad** (30 karakter): `Eczanem`

**Alt başlık** (30 karakter): `Eczane özeti, stok ve barkod`

**Tanıtım metni (Promotional Text, 170 karakter):**
```
Eczanenizin günlük satışlarını, kritik stoklarını ve SKT uyarılarını cebinizden izleyin. Kameranızla barkodu okutun, ürünü anında sorgulayın.
```

**Açıklama:**
```
Eczanem Mobil, Eczanem eczane yönetim sisteminin telefon uygulamasıdır. Eczane çalışanları ve sahipleri için tasarlanmıştır; eczanenizin kendi Eczanem sunucusuna bağlanır.

• ECZANE ÖZETİ — Bugün, hafta ve ay için reçeteli / reçetesiz satış tutarları, önceki dönemle karşılaştırma
• SATIŞ GRAFİĞİ — Gün gün satış çubukları ve şube karşılaştırması
• ÜRÜN SORGULAMA — Ürün adı veya barkodla arayın; stok, fiyat, raf, parti/SKT ve muadilleri görün
• KAMERAYLA TARAMA — Barkod ve karekodu (GS1 DataMatrix) kameranızla okutun; stok sayımı için "Sayım" modunu kullanın
• BİLDİRİM MERKEZİ — Kritik stok, yaklaşan son kullanma tarihi ve diğer uyarılar tek ekranda
• SOĞUK ZİNCİR — Buzdolabı sıcaklığını saniyeler içinde kaydedin
• ÇEVRİMDIŞI — İnternet kesilince son görüntülenen veriler açılır; yaptığınız kayıtlar bağlantı gelince otomatik gönderilir
• GÜVENLİK — Kullanıcı adı ve şifreyle giriş, rol bazlı yetki, bağlantı HTTPS ile şifrelenir

Uygulamayı kullanmak için eczanenizde Eczanem sunucusunun kurulu olması ve yöneticinizden bir kullanıcı hesabı almanız gerekir. Kamera yalnızca barkod okumak için kullanılır; görüntü kaydedilmez ve hiçbir yere gönderilmez.

Bu uygulama tıbbi tavsiye vermez ve tanı koymaz.
```

**Anahtar kelimeler** (100 karakter, virgülle, boşluksuz):
```
eczane,ilaç,stok,barkod,karekod,satış,SKT,envanter,reçete,pos,sayım,muadil
```

**Kategori:** Birincil **İş (Business)** — İkincil **Tıp (Medical)** *(Tıp seçerseniz inceleme daha sıkı olabilir; yalnızca "İş" da yeterlidir)*

**Yaş sınırı anketi:** Tüm sorulara "Hayır / Yok" → sonuç **4+**. *(Tıbbi bilgi sorusunda "Yok" deyin; uygulama bilgi/tavsiye vermiyor, işletme verisi gösteriyor.)*

**Fiyat:** Ücretsiz · **Telif:** `© 2026 <Eczane/Şirket adınız>`

**Destek URL'si:** e-posta adresiniz ya da bir web sayfanız · **Pazarlama URL'si:** boş bırakılabilir

**Gizlilik politikası URL'si:** `https://<sunucunuz>/gizlilik.html`
(Sunucuda `ECZANEM_GIZLILIK_EPOSTA=iletisim@eczaneniz.com` ortam değişkenini tanımlayın; politikadaki iletişim satırı buna göre dolar.)

### 4.2 Ekran görüntüleri

Hazır olanlar: [`docs/magaza/`](magaza/) — 6 adet, **1290 × 2796 px** (6.9"/6.7" iPhone), RGB, alfa kanalı yok. App Store Connect'te "iPhone 6.9″ Display" alanına bu sırayla yükleyin:

1. `1-ozet.png` 2. `2-satis.png` 3. `3-urunler.png` 4. `4-urun-karti.png` 5. `5-tara-sonuc.png` 6. `6-bildirim.png`

Diğer iPhone boyutları için Apple, bu en büyük boyuttan otomatik küçültür. Uygulama **yalnızca iPhone** olarak ayarlıdır (Xcode projesinde `TARGETED_DEVICE_FAMILY = 1`), bu yüzden iPad ekran görüntüsü gerekmez. İleride iPad desteği istenirse bu değer `1,2` yapılıp iPad (13″ için 2064 × 2752) görüntüleri eklenir.

> Ekran görüntüleri örnek verilerle üretilmiştir. Gerçek eczane adı, ilaç stoğu ya da kişi verisi içermez.

### 4.3 Uygulama Gizliliği (Privacy "Nutrition Label")

App Store Connect → Uygulama Gizliliği. Doğru yanıt **kimin sunucu işlettiğine** bağlıdır:

- **Siz sadece yazılımı dağıtıyorsanız ve verilere erişiminiz yoksa** (her eczane kendi sunucusunu işletiyor): **"Veri Toplanmıyor (Data Not Collected)"**.
- **Sunucuyu siz işletiyorsanız** (sizin eczaneniz/şirketiniz): kullanıcı adı & ad-soyad (Kimlik/Contact Info → Name, User ID), satış kayıtları (Purchases) için **"Uygulama İşlevselliği"** amacıyla, **"Takip için kullanılmaz"** olarak işaretleyin.

Kamera: görüntü saklanmaz ve gönderilmez; yalnızca cihazda anlık okunur — toplanan veri sayılmaz. Reklam, analiz ya da izleme (tracking) yoktur → **"Takip (Tracking)": Hayır**.

### 4.4 Teknik ayarlar (zaten yapıldı, kontrol için)

| Ayar | Değer | Nerede |
|---|---|---|
| Kamera izni metni | "Ürün barkodunu ve karekodunu okumak için kameranız kullanılır. Görüntü kaydedilmez ve gönderilmez." | `ios/App/App/Info.plist` |
| Şifreleme beyanı | `ITSAppUsesNonExemptEncryption = false` (yalnızca standart HTTPS) | `Info.plist` |
| Yerel ağ | `NSAllowsLocalNetworking` — yalnızca yerel adreslerde HTTP'ye izin; internet adresleri HTTPS zorunlu | `Info.plist` |
| İkon | 1024×1024, alfa yok | `ios/App/App/Assets.xcassets/AppIcon.appiconset/` |
| Minimum iOS | 14.0 | Xcode projesi |
| Cihaz | Yalnızca iPhone, yalnızca dikey | Xcode projesi + `Info.plist` |

### 4.5 İnceleme notları (App Review Information → Notes)

Aşağıyı kendi demo bilgilerinizle doldurup yapıştırın:

```
Eczanem Mobil, eczane çalışanlarının eczanenin kendi Eczanem sunucusuna bağlanarak
satış özetini görmesi, ürün/stok sorgulaması ve kamerayla barkod okutması için bir
iş uygulamasıdır. Her eczane kendi sunucusunu işletir; bu yüzden uygulama ilk açılışta
sunucu adresi ister.

NASIL DENENİR:
1. Uygulamayı açın. "Sunucu adresi" alanına şunu yazın:  demo.eczaneniz.com
2. Kullanıcı adı: apple-demo     Şifre: <demo şifresi>
3. Özet, Satış, Ürünler, Bildirim sekmelerini gezin.
4. "Tara" sekmesinde kamera izni istenir (yalnızca barkod okumak için). Kamerası olmayan
   ortamda, alttaki kutuya şu barkodu yazıp arayabilirsiniz: 8699504010029
5. Profil sekmesinden çıkış yapılabilir ve "Hesabım ve veri silme" bilgisi görülebilir.

Demo sunucuda yalnızca örnek (gerçek olmayan) veri vardır. Uygulama tıbbi tavsiye vermez,
reklam/izleme içermez, uygulama içi satın alma yoktur.

Hesap silme: Hesaplar eczane yöneticisi tarafından yönetilir (kullanıcı kendi başına hesap
oluşturmaz). Profil > "Hesabım ve veri silme" ekranı bu süreci anlatır.
```

> **Önemli:** Demo kullanıcısıyla önce siz bir kez giriş yapıp şifreyi kendiniz belirleyin. Yönetici tarafından oluşturulan şifreler ilk girişte **zorunlu değişim** ister; incelemeci bu ekranda takılmasın diye şifreyi değiştirilmiş hâliyle verin.

### 4.6 Gönderim

1. App Store Connect → uygulama sayfası → **Sürüm 1.0** → yüklediğiniz derlemeyi seçin.
2. Tüm zorunlu alanlar (ekran görüntüleri, açıklama, URL'ler, gizlilik, yaş, inceleme notu) dolu olmalı.
3. **İncelemeye Gönder**. Süre genelde 24–48 saat. Red gelirse nedeni Resolution Center'da yazar; çoğu zaman not eklenip yeniden gönderilir.

---

## 5. Demo sunucu hazırlama

```bash
cd web
npm install
PORT=3000 TRUST_PROXY=1 COOKIE_SECURE=1 ECZANEM_GIZLILIK_EPOSTA=iletisim@eczaneniz.com npm start
```

- HTTPS için sunucunun önüne **Caddy** ya da **nginx + Let's Encrypt** koyun (`TRUST_PROXY=1`, `COOKIE_SECURE=1` bunun içindir).
- Demo kullanıcı: web arayüzünden **Kullanıcılar → Yeni** ile `apple-demo` oluşturun (rol: *eczacı*). İlk girişte şifreyi değiştirin (bkz. 4.5 notu).
- Demo veride gerçek hasta bilgisi bulundurmayın.
- Sunucu, inceleme süresince (birkaç gün) **açık kalmalı**.

---

## 6. Red riskleri ve önlemler

| Risk | Açıklama | Önlem |
|---|---|---|
| **Guideline 4.2 — Asgari işlevsellik** (en olası) | "Web sitesini saran uygulama" olarak görülebilir | Uygulamada yerel bağlantı ekranı, kamera ile yerel barkod/karekod okuma, çevrimdışı kuyruk ve önbellek, ana ekrana özel arayüz var. İnceleme notunda bunları vurgulayın. Sorun çıkarsa: yerel bildirim (push) ve yerel kamera eklentisi eklemek en güçlü adımdır. |
| **2.1 — Uygulama tamlığı** | İncelemeci giremez/çalışmaz | Herkese açık HTTPS demo + çalışan demo hesap (5. bölüm). |
| **5.1.1 — Gizlilik** | Politika adresi açılmıyor / eksik | `https://<sunucu>/gizlilik.html` tarayıcıdan açılıyor mu kontrol edin. |
| **5.1.1(v) — Hesap silme** | Hesap oluşturulabiliyorsa silme de sunulmalı | Hesabı yalnızca eczane yöneticisi oluşturur; ekranda süreç anlatılıyor. Notta belirtin. |
| **1.4.1 — Tıbbi** | Tıbbi bilgi/hesaplama iddiası | Uygulama stok/satış verisi gösterir, tavsiye vermez; açıklamada belirtildi. |
| **Bağlantı hatası** | Sunucuya HTTP ile bağlanma | Uygulama internet adreslerinde HTTPS zorunlu kılar. |

---

## 7. Güncelleme yayınlama

- **Web tarafı (arayüz, ekranlar):** `web/public/mobil/` değişince **mağaza güncellemesi gerekmez**; uygulama sunucudan yüklenir ve service worker yeni sürümü alır (`sw.js` içindeki `SURUM` değerini artırın).
- **Kabuk tarafı (ikon, izinler, bağlantı ekranı, Capacitor sürümü):** `npm run senkron` → Xcode'da Build numarasını artırın → Archive → Upload → yeni sürümü incelemeye gönderin.

---

## 8. Henüz yapılmayanlar (sonraki sürüm fikirleri)

Aşağıdakiler **bu sürümde yok**; ihtiyaç olursa eklenir:

- Anlık bildirim (push; APNs anahtarı ve sunucu tarafı gerekir)
- Parmak izi / Face ID ile giriş
- Mobilde mal kabul ve onay akışları
- Sesle arama, fotoğraflı ürün ekleme
- Android (Google Play) paketi — aynı kabuk `npx cap add android` ile üretilebilir

Logo, eldeki görselden **vektörle yeniden çizilmiştir**; orijinal yüksek çözünürlüklü dosyanız varsa `web/public/img/` ve ikonlar onunla değiştirilmelidir.
