# Eczam Mobil — iOS kabuğu (Capacitor)

Bu klasör, `/mobil` adresindeki Eczam Mobil uygulamasını (PWA) **App Store'a gönderilebilir iOS uygulamasına** saran ince kabuktur. Uygulamanın kendisi sunucudan yüklenir; kabuk yalnızca sunucu adresini sorar, doğrular (`/api/health`) ve WebView'ı `<sunucu>/mobil/` adresine yönlendirir.

```
www/            Yerel bağlantı ekranı (baglan.html/js/css, logo, yazı tipleri)
scripts/        hazirla.js — logo ve yazı tiplerini web/public'ten kopyalar
ios/            Xcode projesi (Swift Package Manager; CocoaPods gerekmez)
capacitor.config.json
```

```bash
npm ci
npm test         # kabuk testleri
npm run senkron   # www'yi hazırlar ve iOS projesine kopyalar
npm run ios:ac    # Xcode'u açar (Mac gerekir)
```

Yayın adımlarının tamamı: **[docs/APP_STORE_RELEASE.md](../docs/APP_STORE_RELEASE.md)**

Notlar:
- Kullanıcı agent'ı `EczanemApp/1.0` içerir; mobil arayüz bunu görünce Profil'de "Sunucuyu değiştir" düğmesini gösterir.
- Internet adresleri HTTPS gerektirir; yalnızca yerel ağ adresleri (localhost, 10.x, 192.168.x, 172.16–31.x, *.local) HTTP ile açılabilir.
- Bu proje Linux'ta üretildi; imzasız derleme GitHub Actions macOS çalıştırıcısında başarılı (BUILD SUCCEEDED). İmzalama, TestFlight ve gerçek cihaz denemesi henüz yapılmadı.

## GitHub Actions

| İş akışı | Ne yapar |
|---|---|
| `mobil-ci.yml` | Linux: kabuk testleri, Capacitor eşitleme, Python araç testleri |
| `ios-compile.yml` | macOS: imzasız iOS derleme kontrolü |
| `testflight.yml` | macOS: imzala + TestFlight'a yükle (modlar: yükle / yalnızca imzala / yalnızca kimlik kurulumu) |
| `app-store-durumu.yml` | App Store Connect durumunu özetler (salt okunur) |

Secret listesi ve adımlar: [APP_STORE_RELEASE.md](../docs/APP_STORE_RELEASE.md).
