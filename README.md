# Eczane Etiket Programı

Eczanelerde ilaç kutusuna/poşetine yapıştırılan **kullanım talimatı etiketlerini**
(ilaç adı, eczane bilgisi, "günde 2×1 aç karnına" gibi talimatlar) birkaç tıkla
oluşturup yazdıran, tek bir eczanede yerel olarak çalışan bağımsız bir masaüstü
GUI programı. Hesap, bulut ya da abonelik gerektirmez — tüm veriler kullanıcının
kendi bilgisayarında saklanır.

## Özellikler

- Forma (tablet, kapsül, şurup, damla, merhem/krem, süpozituvar, sprey) göre
  otomatik değişen hızlı kullanım talimatı butonları
- Hasta adı, tanı, hasta notu/bilinen alerji, tedavi bitiş tarihi gibi opsiyonel alanlar
- Etikette sıra: önce neden kullanıldığı, sonra nasıl kullanılacağı, sonra saklama koşulu
- Tekli ve toplu (bir reçetedeki birden fazla ilaç) etiket modu
- Büyütülebilir canlı önizleme, yazdırma (`Ctrl+P`) ve PDF olarak kaydetme
- Etiket geçmişi (hasta adına göre arama/gruplama, CSV dışa aktarım)
- Stok / son kullanma tarihi (SKT) takibi
- Admin Paneli: eczane profilleri, ilaç listesi yönetimi, talimat şablonları,
  personel listesi, yedekleme/geri yükleme (opsiyonel PIN korumalı)
- İlaç listesi: küçük bir örnek liste + CSV/Excel içe aktarma + yapılandırılabilir
  (opsiyonel) API kaynağı — Medula'ya canlı bağlanmaz (kapalı bir sistemdir)
- Barkod okuyucu desteği: USB barkod okuyucuyla ürün okutulunca ilaç otomatik seçilir

## Kurulum

```bash
pip install -r requirements.txt
```

Gereksinimler: Python 3.9+ ve Tkinter (Windows'taki standart Python
kurulumuna dahildir; Linux'ta `python3-tk` paketi gerekebilir).

## Çalıştırma

```bash
python -m eczane_etiket.main
```

## İlaç Veri Kaynağı Hakkında

Admin Panelindeki "İlaç Veri Kaynağı" sekmesinden önerilen açık kaynak
[`turkish-medicine-api`](https://github.com/tugcantopaloglu/turkish-medicine-api)
adresini girebilirsiniz — ancak bu, herkese açık barındırılan bir servis
**değildir**; Node.js 18+ ile kendi bilgisayarınızda/sunucunuzda çalıştırmanız
gerekir (`npm install && npm run download && npm start`, varsayılan adres
`http://localhost:3000`). API alanı boş bırakılırsa (varsayılan durum) program
yine de örnek liste + CSV/Excel içe aktarma ile tam çalışır.

## Testler

```bash
pip install pytest
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
(`eczane_etiket.spec` içindeki `datas` ayarı). Bu adım Linux ortamında da
denenip (aynı spec ile Linux çalıştırılabilir dosyası üreterek) doğrulandı;
gerçek `.exe` için Windows üzerinde çalıştırılması gerekir.

## Veri Saklama

Tüm veriler `~/.eczane_etiket/` klasöründe yerel JSON dosyaları olarak
saklanır: `profiles.json`, `drugs.json`, `templates.json`, `history.json`,
`stock.json`, `api_config.json`, `staff.json`. Admin Panelindeki "Yedekleme"
sekmesinden tamamı tek bir `.zip` dosyasına yedeklenip geri yüklenebilir.
