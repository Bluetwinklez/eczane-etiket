# Eczane Etiket Programı

Eczanelerde ilaç kutusuna/poşetine yapıştırılan **kullanım talimatı
etiketlerini** (ilaç adı, eczane bilgisi, "günde 2×1 aç karnına" gibi
talimatlar) birkaç tıkla oluşturup yazdıran, bağımsız ve ücretsiz bir masaüstü
GUI programı.

Hesap, bulut, abonelik ya da internet bağlantısı **gerektirmez** — tüm veriler
kullanıcının kendi bilgisayarında yerel olarak saklanır. Açık kaynaktır,
herkes indirip kullanabilir, değiştirebilir ve dağıtabilir (MIT lisansı).

## İçindekiler

- [Özellikler](#özellikler)
- [Kurulum](#kurulum)
- [Çalıştırma](#çalıştırma)
- [Proje Yapısı](#proje-yapısı)
- [İlaç Veri Kaynağı ve API Anahtarı Hakkında](#ilaç-veri-kaynağı-ve-api-anahtarı-hakkında)
- [Medula ile İlgili Not](#medula-ile-i̇lgili-not)
- [Testler](#testler)
- [Windows İçin Tek Dosya .exe Oluşturma](#windows-i̇çin-tek-dosya-exe-oluşturma)
- [Veri Saklama](#veri-saklama)
- [Sınırlamalar / Kapsam Dışı](#sınırlamalar--kapsam-dışı)
- [Katkıda Bulunma](#katkıda-bulunma)
- [Lisans](#lisans)

## Özellikler

- Forma (tablet, kapsül, şurup, damla, merhem/krem, süpozituvar, sprey) göre
  otomatik değişen hızlı kullanım talimatı butonları
- Hasta adı, tanı, hasta notu/bilinen alerji, tedavi bitiş tarihi gibi
  opsiyonel alanlar
- Etikette sabit sıra: önce neden kullanıldığı, sonra nasıl kullanılacağı,
  sonra saklama koşulu
- Tekli ve toplu (bir reçetedeki birden fazla ilaç) etiket modu
- Büyütülebilir canlı önizleme, yazdırma (`Ctrl+P`) ve PDF olarak kaydetme
- Etiket geçmişi (hasta adına göre arama/gruplama, CSV dışa aktarım)
- Stok / son kullanma tarihi (SKT) takibi
- Admin Paneli: eczane profilleri, ilaç listesi yönetimi, talimat şablonları,
  personel listesi, istatistikler, yedekleme/geri yükleme (opsiyonel PIN korumalı)
- İlaç listesi: küçük bir örnek liste + CSV/Excel içe aktarma + yapılandırılabilir
  (opsiyonel) API kaynağı — Medula'ya canlı bağlanmaz (kapalı bir sistemdir,
  bkz. [Medula ile İlgili Not](#medula-ile-i̇lgili-not))
- **Hızlı Yapıştır**: Medula (ya da başka bir kaynak) ekranından kopyalanan
  reçete metnini yapıştırıp ilaçları otomatik ayrıştırarak toplu etiket
  listesine aktarma — canlı bir Medula bağlantısı değildir, elle
  kopyala/yapıştıra dayanır (bkz. aşağıdaki not)
- Barkod okuyucu desteği: USB barkod okuyucuyla ürün okutulunca ilaç otomatik seçilir
- İstatistik/özet panosu: en çok basılan ilaçlar, en aktif personel, son 7
  günün etiket sayısı (Admin Paneli → İstatistikler)
- Stokta düşük miktar uyarısı: her stok kalemi için isteğe bağlı minimum
  miktar eşiği tanımlanabilir, eşik altına düşenler listede vurgulanır
- İsteğe bağlı QR kod: A4 sayfa şablonunda her etikete, ilaç adı + kullanım
  bilgilerini içeren, tamamen çevrimdışı okunan küçük bir QR kod eklenebilir
  (küçük termal etikette yer olmadığı için yalnızca A4 şablonunda desteklenir)
- Türkçe karakterler (ı, İ, ş, Ş, ğ, Ğ) gömülü font sayesinde her bilgisayarda
  doğru basılır
- Adres ve emoji **yok** — etiket sade ve düzenli kalır
- İlk çalıştırmada kısa bir kurulum penceresiyle eczane adı/telefonu sorulur;
  uygulama ikonu ve "Hakkında" penceresi (sürüm bilgisi) mevcuttur

## Kurulum

Gereksinimler: Python 3.9+ ve Tkinter (Windows'taki standart Python kurulumuna
dahildir; Linux'ta `python3-tk` paketi gerekebilir, örn. `sudo apt install
python3-tk`).

```bash
git clone https://github.com/Bluetwinklez/cll.git
cd cll
pip install -r requirements.txt
```

## Çalıştırma

```bash
python run_app.py
```

(Eski `python -m eczane_etiket.main` komutu da çalışır.)

## Proje Yapısı

```
cll/
├── run_app.py                 # Giriş noktası
├── eczane_etiket/
│   ├── main.py                 # Hızlı Etiket ana ekranı (Tkinter)
│   ├── admin_panel.py          # Yönetim paneli (profiller, ilaç listesi, yedekleme...)
│   ├── profiles.py             # Eczane profil(ler)i, PIN doğrulama
│   ├── data.py                 # İlaç seed listesi + forma göre talimat şablonları
│   ├── drug_api.py             # Yapılandırılabilir, opsiyonel ilaç veri API istemcisi
│   ├── drug_import.py          # CSV/Excel içe aktarma
│   ├── label_pdf.py            # reportlab ile etiket PDF üretimi + yazdırma
│   ├── history.py              # Etiket geçmişi + hasta arama + CSV export
│   ├── stats.py                 # İstatistik/özet panosu (en çok basılan ilaç, vb.)
│   ├── prescription_parser.py  # "Hızlı Yapıştır" reçete metni ayrıştırma (Medula değildir)
│   ├── stock.py                # Stok/SKT takibi + düşük stok eşiği
│   ├── backup.py               # Yedekleme/geri yükleme (.zip)
│   ├── staff.py                # Personel listesi
│   ├── paths.py / jsonutil.py  # Ortak veri yolu ve JSON okuma/yazma yardımcıları
│   └── fonts/                  # Gömülü DejaVu Sans (Türkçe karakter desteği)
├── tests/                      # pytest test paketi
├── eczane_etiket.spec          # PyInstaller derleme yapılandırması
└── requirements*.txt
```

## İlaç Veri Kaynağı ve API Anahtarı Hakkında

Program **varsayılan olarak hiçbir dış servise bağlanmaz** ve kutudan çıktığı
haliyle API anahtarı gerektirmez; kendi içindeki örnek liste + CSV/Excel içe
aktarma ile tam çalışır.

İsteyen kullanıcı, Admin Panelindeki "İlaç Veri Kaynağı" sekmesinden
isteğe bağlı olarak açık kaynak
[`turkish-medicine-api`](https://github.com/tugcantopaloglu/turkish-medicine-api)
gibi bir servisin adresini ve (varsa) API anahtarını girebilir. Bu servis
herkese açık barındırılan bir servis **değildir**; Node.js 18+ ile kendi
bilgisayarınızda/sunucunuzda çalıştırmanız gerekir.

**Güvenlik notu:** Girilen API anahtarı hiçbir zaman koda ya da git deposuna
yazılmaz — sadece kullanıcının kendi bilgisayarında `~/.eczane_etiket/api_config.json`
dosyasında yerel olarak saklanır ve arayüzde `*` ile gizlenir. Bu depo
içinde (kod veya git geçmişinde) hiçbir gerçek API anahtarı, token ya da
sır bulunmaz — `api_config.json` gibi kişisel yapılandırma dosyaları
`~/.eczane_etiket/` altında tutulur ve repoya dahil edilmez.

## Medula ile İlgili Not

Bu program **Medula'ya canlı/otomatik olarak bağlanmaz.** Bunun nedeni
isteksizlik değil, teknik ve güvenlik kısıtı: Medula'nın eczane/provizyon
tarafı için (doktorun e-reçete yazma servisinin aksine) genel, resmi ve
dokümante edilmiş bir API bulunmuyor — yalnızca eczanenin kendi SGK kimlik
bilgileriyle giriş yaptığı kapalı bir web portalı var. Doğrulanmamış bir
kimlik bilgisiyle veya tersine mühendislikle bu tür bir entegrasyon
yazmak, hem hatalı/eksik veri riski hem de eczanenizin SGK erişimini
tehlikeye atma riski taşır.

Bunun yerine program **"Hızlı Yapıştır"** özelliğini sunar: Medula (ya da
başka bir kaynak) ekranındaki reçete metnini kopyalayıp uygulamaya
yapıştırırsınız; program metni satır satır ayrıştırıp bilinen ilaç
listesiyle eşleştirmeye çalışır ve toplu etiket listesine aktarır.
Eşleştirme kesin değildir — yazdırmadan önce her zaman gözden geçirip
gerekirse düzeltmeniz gerekir. Bu, gerçek bir API entegrasyonu değildir;
hiçbir sunucuya bağlanmaz, tamamen yerel çalışır.

Eğer eczanenizin/kurumunuzun resmi, dokümante edilmiş bir Medula
provizyon API'sine erişiminiz varsa, bunu bir Issue/PR olarak paylaşarak
gerçek bir entegrasyonun (yine de yazdırmadan önce insan onayı adımıyla)
eklenmesine katkıda bulunabilirsiniz.

## Testler

```bash
pip install -r requirements-dev.txt
python -m pytest tests/
```

## Windows İçin Tek Dosya .exe Oluşturma

Eczacının Python kurmadan çift tıkla açabileceği bağımsız bir `.exe` üretmek
için, **Windows bilgisayarda** (PyInstaller çapraz derleme yapmaz — hangi
işletim sisteminde çalıştırılırsa o sistemin çalıştırılabilir dosyasını üretir):

```bat
pip install -r requirements-dev.txt
pyinstaller eczane_etiket.spec
```

Çıktı `dist\EczaneEtiket.exe` olarak oluşur; Türkçe karakter desteği için
gömülü DejaVu Sans fontları otomatik olarak pakete dahil edilir
(`eczane_etiket.spec` içindeki `datas` ayarı).

## Veri Saklama

Tüm veriler `~/.eczane_etiket/` klasöründe yerel JSON dosyaları olarak
saklanır: `profiles.json`, `drugs.json`, `templates.json`, `history.json`,
`stock.json`, `api_config.json`, `staff.json`. Hiçbiri bu git deposuna dahil
değildir. Admin Panelindeki "Yedekleme" sekmesinden tamamı tek bir `.zip`
dosyasına yedeklenip geri yüklenebilir.

## Sınırlamalar / Kapsam Dışı

- **Medula'ya canlı bağlantı yoktur** (bkz. [Medula ile İlgili Not](#medula-ile-i̇lgili-not)
  — nedeni ve alternatifi orada açıklanıyor).
- **Hızlı Yapıştır** kesin bir ayrıştırma garantisi vermez; eşleşmeyen ya da
  yanlış eşleşen satırlar olabilir, yazdırmadan önce mutlaka kontrol edilmelidir.
- İlaç veritabanındaki "ne işe yaradığı" açıklamaları elle doğrulanabildiği
  kadar doldurulmuştur; uydurma veri yoktur — bilinmeyen alanlar boş bırakılır.
- Hasta notu/alerji alanı sadece eczacının kendi yazdığı bir hatırlatmadır;
  otomatik ilaç etkileşim/alerji kontrolü yapılmaz.
- İstatistik panosu basit bir özet aracıdır, resmi bir raporlama/BI sistemi değildir.

## Katkıda Bulunma

Katkılar memnuniyetle karşılanır:

1. Depoyu fork'layın ve bir özellik/düzeltme dalı açın.
2. Değişikliğinizi yapın, `python -m pytest tests/` ile testlerin geçtiğini
   doğrulayın.
3. Bir Pull Request açın.

Hata bildirimi veya özellik önerisi için GitHub Issues kullanabilirsiniz.

## Lisans

[MIT](LICENSE) — bu yazılımı ücretsiz olarak kullanabilir, değiştirebilir ve
dağıtabilirsiniz.

Sürüm geçmişi için [CHANGELOG.md](CHANGELOG.md) dosyasına bakabilirsiniz.
