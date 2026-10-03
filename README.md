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

## Ortam Değişkenleri (opsiyonel)

| Değişken         | Açıklama                                         |
|------------------|---------------------------------------------------|
| `PORT`           | Sunucu portu (varsayılan 3000)                    |
| `SESSION_SECRET` | Oturum imzalama anahtarı                          |
| `SMTP_HOST`      | E-posta bildirimleri için SMTP sunucusu           |
| `SMTP_PORT`      | SMTP portu (varsayılan 587)                       |
| `SMTP_SECURE`    | `true` ise SSL/TLS kullanılır                     |
| `SMTP_USER`      | SMTP kullanıcı adı                                |
| `SMTP_PASS`      | SMTP şifresi                                      |
| `SMTP_FROM`      | Gönderen adresi (belirtilmezse `SMTP_USER` kullanılır) |

SMTP ayarları tanımlanmazsa e-posta bildirimleri ve tüm SMS bildirimleri "simüle" durumuyla kayda geçer, gerçek gönderim yapılmaz.

## Rol Yetkileri

- **Admin**: tüm modüller + kullanıcı/şube yönetimi + yedekleme.
- **Eczacı**: ilaç/stok yönetimi, satış, raporlar, müşteri/tedarikçi, bildirim.
- **Kasiyer**: satış (POS), ilaç/stok görüntüleme, müşteri/tedarikçi, bildirim. Raporlar ve yönetim sayfalarına erişemez.

## Geliştirme

```bash
npm run dev   # node --watch ile otomatik yeniden başlatma
```
