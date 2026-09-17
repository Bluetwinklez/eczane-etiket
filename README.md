# 🏥 Eczane İlaç Etiketi Programı

<div align="center">

[![CI Test Suite](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/test.yml/badge.svg)](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/test.yml)
[![Build & Release](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/release.yml/badge.svg)](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/release.yml)
[![Sürüm](https://img.shields.io/badge/Sürüm-v1.6.0-blueviolet.svg)](CHANGELOG.md)
[![Python Version](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![Testler](https://img.shields.io/badge/Testler-77%20Geçti-brightgreen.svg)]()
[![Lisans: MIT](https://img.shields.io/badge/Lisans-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
[![Veri Gizliliği](https://img.shields.io/badge/Veri%20Gizliliği-%25100%20Yerel%20%2F%20Çevrimdışı-emerald.svg)](SECURITY.md)

**Türkiye'deki serbest eczaneler, hastane eczaneleri ve klinikler için modern, hızlı, hatasız ve %100 çevrimdışı termal ilaç etiketi basım ve yönetim sistemi.**

[🚀 Özellikler](#-öne-çıkan-özellikler) • [⚡ Hızlı Kurulum](#-hızlı-başlangıç-kurulum) • [🖨️ Uyumlu Yazıcılar](#️-desteklenen-yazıcılar-ve-etiketler) • [⌨️ Kısayollar](#️-klavye-kısayolları) • [⚙️ Admin Paneli](#️-admin-paneli) • [🚀 Dağıtım](#-dağıtım-deployment--paketleme) • [❓ SSS](#-sık-sorulan-sorular-sss) • [🤝 Katkı](#-katkıda-bulunma)

</div>

---

> [!TIP]
> **%100 Çevrimdışı ve Sıfır Veri Sızıntısı:** İnternet bağlantısı, üyelik ya da bulut aboneliği gerekmez. Hasta bilgileri, reçete kayıtları ve eczane verileri yalnızca kendi bilgisayarınızın yerel diskinde saklanır; üçüncü taraf sunuculara asla iletilmez (KVKK tam uyumlu).

---

<div align="center">
  <img src="docs/screenshot-hizli-etiket.png" alt="Eczane İlaç Etiketi v1.6.0 Arayüz Önizlemesi" width="850" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);"/>
</div>

---

## ⚡ Hızlı Başlangıç (Kurulum)

Uygulamayı çalıştırmak için 3 pratik yöntemden dilediğinizi seçebilirsiniz:

### Seçenek 1: Tek Tıkla Başlatma (Önerilen — Windows)

1. Bu depoyu indirin: Sağ üstteki yeşil **"Code"** butonuna tıklayıp **"Download ZIP"** seçeneğini seçin veya [Releases](https://github.com/Bluetwinklez/eczane-etiket/releases) sayfasından son sürümü indirin.
2. Arşivi masaüstünüze çıkartın.
3. Klasör içindeki **`baslat.bat`** dosyasına çift tıklayın.
   - *Python sanal ortamı ve gerekli kütüphaneler ilk çalıştırmada otomatik kurulur ve program saniyeler içinde açılır.*

---

### Seçenek 2: Kurulumsuz Bağımsız `.exe` (Taşınabilir USB Sürüm)

Python kurulu olmayan eczane banko terminallerinde çalıştırmak için tek bir `.exe` dosyası kullanabilirsiniz:

1. [GitHub Releases](https://github.com/Bluetwinklez/eczane-etiket/releases) sayfasından en güncel **`EczaneEtiket.exe`** dosyasını indirin.
2. Dosyayı USB belleğe veya masaüstünüze kopyalayıp çift tıklayarak doğrudan çalıştırın.
3. Kendiniz derlemek isterseniz:
   ```bat
   pip install -r requirements.txt -r requirements-dev.txt
   pyinstaller eczane_etiket.spec
   ```
   Derleme sonrası `dist\EczaneEtiket.exe` hazır olacaktır.

---

### Seçenek 3: Komut Satırı ile Kurulum (Geliştiriciler & İleri Düzey)

```bash
# 1. Projeyi klonlayın ve klasöre girin
git clone https://github.com/Bluetwinklez/eczane-etiket.git
cd eczane-etiket

# 2. Sanal ortamı oluşturun ve aktif edin (Windows)
python -m venv .venv
.venv\Scripts\activate

# Linux / macOS:
# python3 -m venv .venv && source .venv/bin/activate

# 3. Kütüphaneleri yükleyin
pip install -r requirements.txt

# 4. Programı başlatın
python run_app.py
```

---

## 🌟 Öne Çıkan Özellikler

### 🎨 1. 3 Farklı Modern Tema Motoru (Kalıcı Tercih)
- **☀️ Gündüz (Ferah Medikal):** Gün ışığında gözü yormayan modern slate ve açık mavi tonlar (`#f1f5f9`).
- **🌙 Gece Nöbeti (Dark Mode):** Nöbetçi eczanelerde loş ışıkta ekran parlamasını önleyen yüksek kontrastlı koyu tema (`#0b1329`, `#152238`).
- **🌿 Eczane Yeşili (Geleneksel Sağlık):** Eczacılık kültürünün klasik medikal yeşil tonları (`#065f46`, `#10b981`).
- Başlıktaki `🎨` menüsünden anında değiştirilir; seçilen tema eczane profilinize kaydedilir ve program yeniden açıldığında otomatik yüklenir.

### 📅 2. Akıllı Ambalaj Ayrıştırma & SGK Kutu Bitiş Asistanı
- İlaç seçildiğinde (`AUGMENTIN BID 1000MG 14 TABLET`, `PAROL 500MG 20 TABLET` vb.) ambalaj adedi (`14 Tablet`, `20 Tablet`) regex motoruyla otomatik ayıklanır.
- Dozaj (`2x1`, `3x1` vb.) girildiği anda ilacın biteceği ve SGK'dan tekrar temin edilebileceği tarih anında hesaplanır.
- İsteğe bağlı olarak etiketin üst satırına `Tekrar: GG.AA.YYYY` notu basılır; Admin Paneli geçmişinde ve CSV raporlarında ayrı sütun olarak listelenir.

### 📊 3. Etiket Üzerinde Görsel Doz Çizelgesi Tablosu
- Yaşlı, okuma güçlüğü çeken ya da yabancı uyruklu hastalar için etiket üzerine 4 sütunlu dozaj tablosu basılır:
  ```
  ┌───────┬───────┬───────┬───────┐
  │ SABAH │ ÖĞLE  │ AKŞAM │ GECE  │
  ├───────┼───────┼───────┼───────┤
  │   1   │   -   │   1   │   -   │
  └───────┴───────┴───────┴───────┘
  ```
- Canlı önizleme çubuğundaki **"📊 Doz Çizelgesi"** seçeneğiyle tek tıkla açılıp kapatılabilir.

### 👶 4. Pediatrik / Çocuk Şurup ve Damla Modu
- **`👶 Pediatrik Mod`** butonuna basıldığında arayüz sıvı ve süspansiyon ilaç kalıplarına geçer:
  - `1 Ölçek (5 ml)`, `Yarım Ölçek (2.5 ml)`, `2 Ölçek (10 ml)`, `10 Damla`, `15 Damla` ve pediatrik ateş/ağrı kalıpları tek tıkla yüklenir.

### ⚠️ 5. Genişletilmiş Tıbbi Uyarı Çipleri (8 Seçenek, 2 Satır)
- Eczane etiketlerinde en çok kullanılan tıbbi güvenlik uyarıları 2 satırlı düzenli butonlarla tek tıkla etikete eklenir:
  - `⚠️ Çalkalayınız`, `🚗 Uyku Yapabilir`, `🥛 Sütle Almayınız`, `💧 Bol Su İle`
  - `⏳ Kutuyu Bitiriniz`, `☀️ Işıktan Koruyunuz`, `🧊 Buzdolabında (2-8°C)` (Soğuk Zincir), `⏱️ Açıldıktan Sonra 15 Gün` (Kullanım Ömrü)
- Termal ve A4 baskıda özel kırmızı vurgulu uyarı bandı olarak basılır.

### 🍎 6. Besin & İlaç Etkileşim Asistanı
- Sık karşılaşılan klinik besin etkileşimlerini (`Süt Ürünleri`, `Greyfurt`, `Çay / Kahve / Demir`, `Alkol Yasağı`, `Aç Karnına`) tek tıkla prospektüs ve kullanım notuna ekler.

### 🖨️ 7. Doğrudan Sistem Yazıcısı Seçimi & Hatırlama
- Windows ve Linux/macOS sisteminde kurulu yazıcıları otomatik keşfeder (`Xprinter`, `Argox`, `Zebra`, `Bixolon`, vb.).
- Varsayılan Windows yazıcısını değiştirmeden doğrudan etiket yazıcısına baskı gönderebilirsiniz.
- Seçilen yazıcı profilinize kaydedilir, program her açıldığında otomatik seçili gelir.

### 🏷️ 8. İTS 2D Karekod & Barkod Desteği
- Türkiye'deki tüm optik barkod okuyuculardan gelen **GS1 2D DataMatrix Karekod** (`0108699...`) ve standart 13 haneli **EAN-13** barkodlarını tanır.
- Barkodu okuttuğunuz anda ilacın adı, farmasötik formu, saklama koşulu ve kullanım amacı otomatik dolar.
- **Bilinmeyen Barkod Tanımlama:** Kayıtlı olmayan bir kutu okutulduğunda ekrandan ayrılmadan hızlıca yeni ilaç kaydı oluşturulabilir.

### 📋 9. Medula / e-Reçete Hızlı Yapıştır & Toplu Mod
- Medula ekranından kopyalanan reçete metni **"Hızlı Yapıştır"** penceresine yapıştırıldığında:
  - Hasta adı ve tanı üstverileri otomatik ayıklanıp forma aktarılır.
  - Reçetedeki tüm ilaçlar satır satır ayrıştırılır; ambalaj adedi, doz çizelgesi ve SGK kutu bitiş tarihi otomatik üretilerek toplu listeye eklenir.
- `Ctrl+P` ile reçetedeki tüm etiketler tek seferde art arda yazıcıya basılır.

### 👁️ 10. Canlı Önizleme & Türkçe Karakter Garantisi
- Girdiğiniz her harf sağ paneldeki simülasyonda anlık güncellenir.
- **DejaVu Sans** fontu doğrudan gömülü geldiği için Türkçe karakterler (`ı`, `İ`, `ş`, `Ş`, `ğ`, `Ğ`, `ç`, `Ç`, `ö`, `Ö`, `ü`, `Ü`) her yazıcıda ve işletim sisteminde pürüzsüz basılır.

### 🧪 11. Majistral (Yapma İlaç) Modu
- Laboratuvarda hazırlanan yapma ilaçlar için tek tıkla `🧪 Majistral` butonu:
  - 30 günlük SKT tarihini otomatik atar.
  - "Haricen Kullanılır - Doktor Önerisiyle" ibaresini ve saklama koşullarını doldurur.

---

## 🖨️ Desteklenen Yazıcılar ve Etiketler

### Etiket Şablonları

| Şablon Kodu | Boyut | Kullanım Alanı |
|---|---|---|
| `thermal_50x30` | **50 x 30 mm** | En yaygın standart eczane rulo etiketi (Zebra, Argox, Xprinter) |
| `thermal_60x40` | **60 x 40 mm** | Geniş açıklama ve dozaj tablosu içeren termal etiket |
| `thermal_80x50` | **80 x 50 mm** | Büyük boy detaylı prospektüslü termal etiket |
| `a4_grid_6` | **A4 Sayfa** | Standart lazer/mürekkep yazıcılar için 6'lı ızgara baskı (isteğe bağlı QR kodlu) |

### Test Edilen ve Onaylanan Yazıcı Modelleri
- **Xprinter:** XP-365B, XP-370B, XP-420B, XP-235B
- **Argox:** OS-214 Plus, CP-2140, iX4-250
- **Zebra:** ZD220, ZD230, GK420t, GX430t
- **Bixolon:** SLP-TX400, SLP-DX220
- **Brother:** QL-700, QL-800, QL-1110NWB
- **TSC:** TE200, DA210, TDP-225
- **Standart Yazıcılar:** HP LaserJet, Canon, Epson vb. tüm A4 lazer/mürekkep yazıcılar

> [!TIP]
> **Yazıcı Hizalama İpucu:** Etiket baskısında kayma yaşamamak için Windows Denetim Masası / Yazıcı Özellikleri altından etiket boyutunuzu (örneğin 50x30 mm) tanımlayın ve arayüzdeki **"🧪 Test Baskısı"** butonuyla test edin.

---

## ⌨️ Klavye Kısayolları

Eczanede fare kullanmadan hızlı çalışabilmeniz için optimize edilmiş klavye kısayolları:

| Kısayol | İşlev |
|---|---|
| `Ctrl + P` | Etiketi doğrudan yazıcıya gönder |
| `Ctrl + S` | Etiketi PDF dosyası olarak kaydet |
| `Ctrl + Enter` | Toplu etiket listesine ekle (Toplu Modda) |
| `Esc` veya `Ctrl + N` | Formdaki tüm alanları temizle ve yeni etikete hazırla |
| `F2` | İmleci doğrudan Barkod Oku kutusuna odakla |
| `F3` | İmleci doğrudan İlaç Adı arama kutusuna odakla |
| `Tab` / `Shift + Tab` | Metin kutuları arasında doğal geçiş yap |

---

## ⚙️ Admin Paneli

Üst barda yer alan **⚙️ Admin** butonu ile açılan yönetim panelinde eczanenin tüm yönetimsel işleri toplanmıştır (isteğe bağlı SHA-256 PIN kilidi eklenebilir):

- **🏥 Eczane Profilleri:** Eczane adı, telefon, şube, varsayılan etiket boyutu, tercih edilen tema ve varsayılan yazıcı yönetimi.
- **💊 İlaç Listesi:** İlaç arama, yeni ilaç tanımlama, çift tıklamayla düzenleme, CSV/Excel'den toplu içe aktarma.
- **📦 Stok & SKT Takibi:** Son kullanma tarihi yaklaşanlar, süresi geçenler ve kritik stok eşiği uyarıları.
- **🕒 Geçmiş & Raporlar:** Yazdırılan tüm etiketler, hasta adına veya tarih aralığına göre arama, SGK Bitiş sütunu ve Excel/CSV dışa aktarım.
- **📊 İstatistikler:** En çok basılan ilaçlar, personel aktivitesi ve son 7 günlük basım grafiği.
- **⚡ Talimat Şablonları:** Forma göre hızlı dozaj butonlarını kendi eczanenizin alışkanlıklarına göre düzenleme.
- **💾 Yedekleme:** Tüm eczane kayıtlarını tek tıkla `.zip` arşivine yedekleme ve geri yükleme.

---

## 📁 Proje Dizin Yapısı

```
eczane-etiket/
├── .github/
│   ├── workflows/
│   │   ├── test.yml            # Çoklu platform (Windows/Ubuntu) CI test motoru
│   │   └── release.yml         # Otomatik Windows .exe derleme ve GitHub Releases iş akışı
│   ├── ISSUE_TEMPLATE/         # Hata bildirimi ve özellik önerisi şablonları
│   └── PULL_REQUEST_TEMPLATE.md# Katkı ve PR şablonu
├── docs/
│   └── screenshot-hizli-etiket.png # v1.6.0 arayüz ekran görüntüsü
├── baslat.bat                  # Windows tek tıkla ortam kurma ve başlatma betiği
├── run_app.py                  # Uygulama giriş noktası
├── pyproject.toml              # Standart Python paketleme ve araç yapılandırması
├── eczane_etiket.spec          # PyInstaller tek dosya .exe derleme yapılandırması
├── requirements.txt            # Temel kütüphane bağımlılıkları
├── requirements-dev.txt        # Test ve derleme araçları bağımlılıkları
├── CONTRIBUTING.md             # Katkıda bulunma rehberi
├── SECURITY.md                 # Güvenlik ve yerel veri gizliliği politikası
├── CHANGELOG.md                # Sürüm değişiklik günlüğü
├── LICENSE                     # MIT Açık Kaynak Lisansı
├── eczane_etiket/
│   ├── __init__.py             # Sürüm ve paket tanımı (v1.6.0)
│   ├── main.py                 # Modern Tkinter Hızlı Etiket ana ekranı
│   ├── theme.py                # 3 temalı (Gündüz, Gece, Yeşil) görsel motor
│   ├── admin_panel.py          # Eczane yönetim paneli (Profiller, İlaçlar, Stok, vb.)
│   ├── data.py                 # İlaç veritabanı, akıllı ambalaj ayrıştırma, karekod okuyucu
│   ├── label_pdf.py            # Termal ve A4 etiket PDF motoru ve yazdırma
│   ├── prescription_parser.py  # Reçete metni ve hasta bilgisi ayrıştırıcı
│   ├── history.py              # Etiket geçmişi ve CSV raporlama
│   ├── stock.py                # Stok ve SKT takip sistemi
│   ├── profiles.py             # Eczane profilleri ve PIN güvenliği
│   ├── staff.py                # Eczane personel listesi
│   ├── stats.py                # Etiket istatistikleri
│   ├── backup.py               # .zip arşivleme ve geri yükleme
│   ├── paths.py                # Yerel veri yolu yapılandırması
│   ├── fonts/                  # Gömülü Türkçe DejaVu Sans fontları
│   └── icons/                  # Uygulama simgeleri (.ico, .png)
└── tests/                      # 77 adet otomatik birim ve entegrasyon testi
    ├── conftest.py             # Test ortamı ve Tcl/Tk konfigürasyonu
    ├── test_data.py            # Veritabanı ve ambalaj ayrıştırma testleri
    ├── test_drug_import.py     # İlaç içe aktarma testleri
    ├── test_history.py         # Geçmiş ve CSV testleri
    ├── test_label_pdf.py       # PDF üretimi ve şablon testleri
    ├── test_main_workflow.py   # Ana arayüz, toplu mod ve kısayol testleri
    ├── test_prescription_parser.py # Medula reçete ayrıştırma testleri
    ├── test_profiles.py        # Profil ve tema/yazıcı kalıcılığı testleri
    ├── test_stats.py           # İstatistik hesaplama testleri
    ├── test_stock.py           # Stok ve SKT testleri
    ├── test_theme.py           # Renk paleti ve tema testleri
    └── test_version.py         # Sürüm tutarlılığı testi
```

---

## 🚀 Dağıtım (Deployment) & Paketleme

Programın farklı ortamlarda sorunsuz çalışması için tüm dağıtım senaryoları hazırlanmıştır:

### 1. GitHub Releases ile Otomatik Dağıtım
- Projeye bir sürüm etiketi (`git tag v1.6.0 && git push origin v1.6.0`) atıldığında GitHub Actions `.github/workflows/release.yml` iş akışı otomatik devreye girer.
- Sanal bir Windows ortamında PyInstaller ile `EczaneEtiket.exe` derlenir ve doğrudan ilgili GitHub Release sayfasına eklenir.

### 2. Eczane İçi USB ile Taşınabilir (Portable) Dağıtım
- `dist\EczaneEtiket.exe` dosyasını doğrudan bir USB belleğe kopyalayabilirsiniz.
- USB belleği eczanedeki herhangi bir Windows 10/11 bilgisayarına taktığınızda hiçbir kurulum yapmadan doğrudan çalışır.
- Veriler kullanıcının `%APPDATA%\.eczane_etiket` klasöründe saklandığı için bilgisayar değişse de işletim sistemi izinleri güvende kalır.

---

## 🧪 Testleri Çalıştırma

Tüm iş akışları, PDF üretimleri, veri tabanı işlemleri ve arayüz olayları otomatik test kapsamındadır:

```bash
pip install -r requirements-dev.txt
pytest -v
```

```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.1.1, pluggy-1.6.0
collected 77 items

tests\test_data.py .................                                     [ 22%]
tests\test_drug_import.py .......                                        [ 31%]
tests\test_history.py ...                                                [ 35%]
tests\test_label_pdf.py .........                                        [ 46%]
tests\test_main_workflow.py .................                            [ 68%]
tests\test_prescription_parser.py .......                                [ 77%]
tests\test_profiles.py ..                                                [ 80%]
tests\test_stats.py ......                                               [ 88%]
tests\test_stock.py ......                                               [ 96%]
tests\test_theme.py ..                                                   [ 98%]
tests\test_version.py .                                                  [100%]

============================= 77 passed in 31.23s =============================
```

---

## ❓ Sık Sorulan Sorular (SSS)

<details>
<summary><b>1. Programı kullanmak için internet bağlantısı gerekiyor mu?</b></summary>
<p>Hayır. Program %100 çevrimdışı çalışacak şekilde tasarlanmıştır. İnternetiniz kesilse bile reçete etiketleme, stok takibi ve yazdırma işlemleri aksamadan devam eder.</p>
</details>

<details>
<summary><b>2. Barkod okuyucumu programa nasıl tanıtabilirim?</b></summary>
<p>Herhangi bir sürücüye veya özel ayara gerek yoktur. USB veya Bluetooth ile bilgisayarınıza bağlı olan tüm 1D çizgi barkod ve 2D karekod (DataMatrix) okuyucular klavye öykünmesiyle otomatik olarak çalışır.</p>
</details>

<details>
<summary><b>3. Hasta ve reçete verilerim nerede saklanıyor? KVKK'ya uygun mu?</b></summary>
<p>Tüm veriler yalnızca bilgisayarınızın yerel sabit diskinde düz JSON dosyalarında saklanır. Hiçbir veri buluta veya harici sunuculara iletilmez; bu nedenle kişisel sağlık verileri tamamen sizin denetiminizdedir.</p>
</details>

<details>
<summary><b>4. Termal yazıcımdan etiket kayması veya Türkçe karakter hatası alıyorum, ne yapmalıyım?</b></summary>
<p>Program içinde doğrudan Türkçe karakter desteğine sahip DejaVu Sans fontları gömülüdür. Yazıcınızın sürücü ayarlarından doğru etiket boyutunu (örneğin 50x30 mm) seçtiğinizden emin olun ve ana ekrandan "🧪 Test Baskısı" butonuna basarak hizalamayı kontrol edin.</p>
</details>

<details>
<summary><b>5. Birden fazla eczane şubesi veya kasa bankosu için kullanılabilir mi?</b></summary>
<p>Evet. Admin Paneli altındaki Eczane Profilleri sekmesinden dilediğiniz kadar profil oluşturabilir, her profil için farklı varsayılan yazıcı ve tema atayabilirsiniz.</p>
</details>

---

## 🤝 Katkıda Bulunma

Eczane İlaç Etiketi açık kaynaklı bir topluluk projesidir. Hata bildirimleri, yeni özellik önerileri veya kod katkıları için lütfen [CONTRIBUTING.md](CONTRIBUTING.md) rehberini inceleyin.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır. Tamamen ücretsizdir; dilediğiniz gibi kullanabilir, değiştirebilir ve eczanenizde çalıştırabilirsiniz.
