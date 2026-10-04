# Eczam Mobil — iOS kabuğu (Capacitor)

Bu klasör, `/mobil` adresindeki Eczam Mobil uygulamasını (PWA) **App Store'a gönderilebilir iOS uygulamasına** saran ince kabuktur. Uygulamanın kendisi sunucudan yüklenir; kabuk yalnızca sunucu adresini sorar, doğrular (`/api/health`) ve WebView'ı `<sunucu>/mobil/` adresine yönlendirir.

```
www/            Yerel bağlantı ekranı (baglan.html/js/css, logo, yazı tipleri)
scripts/        hazirla.js — logo ve yazı tiplerini web/public'ten kopyalar
ios/            Xcode projesi (Swift Package Manager; CocoaPods gerekmez)
capacitor.config.json
```

```bash
npm install
npm run senkron   # www'yi hazırlar ve iOS projesine kopyalar
npm run ios:ac    # Xcode'u açar (Mac gerekir)
```

Yayın adımlarının tamamı: **[docs/app-store-yayin-rehberi.md](../docs/app-store-yayin-rehberi.md)**

Notlar:
- Kullanıcı agent'ı `EczanemApp/1.0` içerir; mobil arayüz bunu görünce Profil'de "Sunucuyu değiştir" düğmesini gösterir.
- Internet adresleri HTTPS gerektirir; yalnızca yerel ağ adresleri (localhost, 10.x, 192.168.x, 172.16–31.x, *.local) HTTP ile açılabilir.
- Bu proje Linux'ta üretildi; Xcode'da henüz derlenmedi (rehberdeki "ilk derleme kontrol listesi"ne bakın).
