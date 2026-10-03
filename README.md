# Eczanem Programı

Eczane yönetim ve otomasyon sistemi. Node.js + Express + yerleşik `node:sqlite` üzerinde çalışan, build adımı gerektirmeyen sade bir HTML/CSS/JS arayüzü olan tek prosesli bir web uygulaması.

## Özellikler

**Çekirdek**: ilaç envanteri, şube bazlı stok takibi ve otomatik düşüm, kritik stok uyarısı, son kullanma tarihi (SKT) uyarısı, satış/POS ekranı, reçeteli/reçetesiz ayrımı, müşteri kayıtları + satış geçmişi, tedarikçi yönetimi, fiyat geçmişi + kâr marjı, barkod ile arama.

**Raporlama**: gün/hafta/ay satış raporu, en çok satan ilaçlar, kritik stok + SKT raporu, kâr-zarar raporu, reçete/SGK işlem raporu. Her rapor CSV veya PDF olarak indirilebilir.

**İleri seviye**: kullanıcı girişi + rol yönetimi (admin/eczacı/kasiyer), çoklu şube desteği, e-posta/SMS hatırlatma (e-posta SMTP ile gerçek gönderim yapar; SMS ve SMTP tanımsızken e-posta simüle edilir), yedekleme/geri yükleme (JSON export/import).

**Ek özellikler**: POS'ta yüzdelik indirim desteği, yazdırılabilir satış fişi, ilaç bazlı stok hareketleri geçmişi, ana sayfada son 7 günün satış trend grafiği, karanlık/aydınlık tema (kalıcı tercih), POS klavye kısayolları (F2 arama, Enter ile sepete ekle, Ctrl+Enter ile satışı tamamla), her sayfadan `Ctrl+K` ile açılan hızlı komut paleti (sayfa + ilaç/müşteri arama).

**Eczacının günlük işini kolaylaştıran modüller** (ilaç reçetesiyle sınırlı değil):
- **Gün sonu kasa kapanışı (Z-Raporu)**: nakit/kredi kartı/SGK bazında sistem toplamı önizlemesi, sayılan nakit girişiyle fark hesaplama, kapanış geçmişi.
- **Gider takibi**: kira/fatura/maaş/vergi/tedarik/diğer giderler; kâr-zarar raporuna otomatik yansıyıp net kâr hesaplanıyor.
- **Tedarikçi sipariş yönetimi**: kritik stok altındaki ilaçlar için otomatik sipariş önerisi, sipariş oluşturma, durum takibi (beklemede → gönderildi → teslim alındı — teslim alınınca stok otomatik güncellenir).
- **Müşteri sağlık notu**: alerji/kronik hastalık notu; POS'ta müşteri seçilince uyarı olarak gösterilir.
- **Görev/hatırlatma panosu**: ekip içi operasyonel görevler (öncelik, atama, tamamlama).
- **Nöbetçi eczane takvimi**: aylık takvim görünümünde nöbet günlerini işaretleme/görüntüleme, CSV (Excel) dışa aktarma.
- **Stok değeri ve personel performans raporları**: envanter değerlemesi (muhasebe için) ve personel bazlı satış performansı.
- **Ana sayfa özet widget'ları**: bekleyen görevler, bu ayki nöbetler, bekleyen siparişler tek bakışta.

**Stok, satış ve eczacılık modülleri**:
- **Ürün tipi ayrımı**: ilaç, dermokozmetik, gıda takviyesi, medikal ürün, diğer. Listede filtre ve rozet, ürün tipi bazında satış raporu.
- **Parti/lot bazlı SKT takibi (FEFO)**: her stok girişi parti no + SKT ile kaydedilir. Satışlar SKT'si en yakın partiden düşer. Belirli bir partiden çıkış/imha yapılabilir. SKT uyarıları parti bazındadır; parti bazlı SKT raporu vardır. Sipariş teslim alınırken kalem bazında parti/SKT girilebilir.
- **Karekod (GS1 DataMatrix) okuma**: karekoddaki GTIN, seri no, SKT ve parti no çözülür. Okuyucu GS ayıracını göndermese de alanlar ayrıştırılır. POS'ta karekod okutulunca ürün sepete eklenir ve SKT'si geçmiş kutunun satışı engellenir. Stok girişinde ürün, parti ve SKT otomatik dolar.
- **Kampanyalar**: yüzde indirim veya "X al Y öde"; hedef ürün, kategori, ürün tipi ya da tüm reçetesiz ürünler olabilir. Tarih aralığı tanımlanabilir. POS'ta canlı uygulanır (aynı üründe en yüksek indirim seçilir) ve kampanya performans raporu vardır. Reçeteli ilaçlara uygulanmaz.
- **Satış iadesi**: fiş numarasıyla kısmi veya tam iade. Tutar indirimler düşülerek hesaplanır. Sağlam ürün satıldığı partiye geri döner; hasarlı ürün stoğa alınmayabilir. Nakit/kart iadesi kasa kapanışından, veresiye iadesi müşteri borcundan düşer. Kâr-zarar raporu iadeleri hesaba katar; iade raporu vardır.
- **Veresiye (cari hesap) defteri**: POS'ta "Veresiye" ödeme tipi ve müşteri bazlı limit. Yürüyen bakiyeli hesap ekstresi, nakit veya kart tahsilat, 30 günü geçen alacak takibi. Tahsilatlar kasa kapanışına dahil edilir.
- **İlaç etkileşim uyarısı**: sepetteki ürünlerin etken maddeleri arasındaki bilinen etkileşimler, mükerrer etken madde, müşterinin son 90 günlük alımlarıyla etkileşim ve sağlık notundaki alerji (örn. penisilin → amoksisilin) kontrol edilir. Ciddi uyarıda satıştan önce onay istenir. Etkileşim listesi **sınırlı bir örnek veri setidir**, klinik karar desteği yerine geçmez; eczacılar kendi kurallarını ekleyebilir.

**Güvenlik ve denetim**:
- Giriş denemesi sınırı: aynı IP + kullanıcı için 15 dakikada 5 hatalı deneme, ardından geçici kilit.
- Oturumlar SQLite'ta saklanır, sunucu yeniden başlasa da korunur. Girişte oturum kimliği yenilenir.
- Şifre kuralı: en az 8 karakter, en az bir harf ve bir rakam. Demo hesaplar ve yöneticinin oluşturduğu/sıfırladığı şifreler ilk girişte değiştirilmek zorundadır. Şifre değişince kullanıcının diğer oturumları kapatılır.
- İşlem kaydı (audit log): tüm veri değiştiren istekler kullanıcı, yöntem, kaynak ve sonuç koduyla kaydedilir; şifreler maskelenir. Admin, filtreleyip CSV olarak indirebilir.

## Kurulum

```bash
npm install
npm start
```

Sunucu varsayılan olarak `http://localhost:3000` adresinde çalışır. Veritabanı ilk çalıştırmada `data/eczane.db` dosyasında otomatik oluşturulur ve örnek verilerle doldurulur.

## Demo Hesaplar

| Kullanıcı adı | Şifre      | Rol      |
|----------------|------------|----------|
| admin          | admin123   | Admin    |
| eczaci         | eczaci123  | Eczacı   |
| kasiyer        | kasiyer123 | Kasiyer  |

İlk girişte her demo hesabın şifresini değiştirmeniz istenir.

## Ortam Değişkenleri (opsiyonel)

| Değişken         | Açıklama                                         |
|------------------|---------------------------------------------------|
| `PORT`           | Sunucu portu (varsayılan 3000)                    |
| `SESSION_SECRET` | Oturum imzalama anahtarı (verilmezse üretilip veritabanında saklanır) |
| `ECZANEM_DB_PATH` | Veritabanı dosyası yolu (varsayılan `data/eczane.db`) |
| `COOKIE_SECURE`  | `1` ise oturum çerezi yalnızca HTTPS üzerinden gönderilir |
| `TRUST_PROXY`    | `1` ise ters vekil (reverse proxy) arkasında istemci IP'si `X-Forwarded-For`'dan alınır |
| `SMTP_HOST`      | E-posta bildirimleri için SMTP sunucusu           |
| `SMTP_PORT`      | SMTP portu (varsayılan 587)                       |
| `SMTP_SECURE`    | `true` ise SSL/TLS kullanılır                     |
| `SMTP_USER`      | SMTP kullanıcı adı                                |
| `SMTP_PASS`      | SMTP şifresi                                      |
| `SMTP_FROM`      | Gönderen adresi (belirtilmezse `SMTP_USER` kullanılır) |

SMTP ayarları tanımlanmazsa e-posta bildirimleri ve tüm SMS bildirimleri "simüle" durumuyla kayda geçer, gerçek gönderim yapılmaz.

## Rol Yetkileri

- **Admin**: tüm modüller + kullanıcı/şube yönetimi + yedekleme + işlem kaydı.
- **Eczacı**: ilaç/stok/parti yönetimi, satış, iade, kampanya ve etkileşim kuralları, raporlar, müşteri/tedarikçi, bildirim.
- **Kasiyer**: satış (POS), veresiye tahsilatı, ilaç/stok görüntüleme, müşteri/tedarikçi, bildirim. Raporlara, iadelere ve yönetim sayfalarına erişemez.

## Geliştirme

```bash
npm run dev   # node --watch ile otomatik yeniden başlatma
npm test      # node:test ile API testleri (her dosya kendi bellek içi veritabanını kullanır)
```
