# Eczanem Programı

Eczane yönetim ve otomasyon sistemi. Node.js + Express + yerleşik `node:sqlite` üzerinde çalışan, build adımı gerektirmeyen sade bir HTML/CSS/JS arayüzü olan tek prosesli bir web uygulaması.

## Özellikler

**Çekirdek**: ilaç envanteri, şube bazlı stok takibi ve otomatik düşüm, kritik stok uyarısı, son kullanma tarihi (SKT) uyarısı, satış/POS ekranı, reçeteli/reçetesiz ayrımı, müşteri kayıtları + satış geçmişi, tedarikçi yönetimi, fiyat geçmişi + kâr marjı, barkod ile arama.

**Raporlama**: gün/hafta/ay satış raporu, en çok satan ilaçlar, kritik stok + SKT raporu, kâr-zarar raporu, reçete/SGK işlem raporu. Her rapor CSV veya PDF olarak indirilebilir.

**İleri seviye**: kullanıcı girişi + rol yönetimi (admin/eczacı/kasiyer), çoklu şube desteği, e-posta/SMS hatırlatma (e-posta SMTP ile gerçek gönderim yapar; SMS ve SMTP tanımsızken e-posta simüle edilir), yedekleme/geri yükleme (JSON export/import).

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
