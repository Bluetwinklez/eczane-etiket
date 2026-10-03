# 🤝 Katkıda Bulunma Rehberi (Contributing)

**Eczane İlaç Etiketi Programı**'na katkıda bulunmak istediğiniz için teşekkür ederiz! Bu proje açık kaynaklı (MIT) olup tüm eczacıların, teknisyenlerin ve Python geliştiricilerinin katkılarına açıktır.

---

## 🚀 Geliştirme Ortamını Kurma

### 1. Depoyu Çatallayın (Fork) ve Klonlayın

```bash
git clone https://github.com/Bluetwinklez/eczane-etiket.git
cd eczane-etiket
```

### 2. Sanal Ortam (Virtualenv) Oluşturun

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Geliştirme Paketlerini Yükleyin

```bash
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### 4. Uygulamayı Başlatın

```bash
python run_app.py
```

---

## 🧪 Testleri Çalıştırma

Kod tabanımız yüksek test kapsamına sahiptir. Bir değişiklik yapmadan önce ve sonra tüm testlerin geçtiğinden emin olun:

```bash
pytest -v
```

Yeni bir fonksiyon, form alanı veya hesaplama eklediğinizde `tests/` klasörüne ilgili test senaryolarını eklemeyi unutmayın.

---

## 📐 Kod Standartları ve İlkelerimiz

1. **%100 Çevrimdışı (Offline-First) İlkesi:**
   - Eczanelerde internet kesintilerinde bile sistem kesintisiz çalışmalıdır.
   - Harici zorunlu bulut API'leri veya internete bağımlı servisler eklenemez.
2. **Kişisel Verilerin Gizliliği (KVKK Uyumu):**
   - Hasta isimleri ve etiket kayıtları asla üçüncü taraf sunuculara iletilmez, yalnızca yerel JSON dosyalarında tutulur.
3. **Türkçe Karakter Desteği:**
   - Etiket PDF çıktılarında DejaVu Sans font ailesi kullanılır. Türkçe karakterlerin (`ı`, `İ`, `ş`, `Ş`, `ğ`, `Ğ`, `ç`, `Ç`, `ö`, `Ö`, `ü`, `Ü`) tüm termal yazıcılarda net çıkması şarttır.
4. **Ergonomi ve Hız:**
   - Eczane tezgahında saniyeler önemlidir. Klavye kısayolları (`Ctrl+P`, `Ctrl+S`, `F2`, `F3`, `Esc`, `Tab`) bozulmamalıdır.

---

## 💡 Yeni İlaç veya Dozaj Şablonu Ekleme

- Sistemde hazır gelen ilaç tohum listesini genişletmek için `eczane_etiket/data.py` içindeki `DRUGS_SEED` listesine yeni ilaçlar ekleyebilirsiniz.
- Yeni form şablonları için `INSTRUCTION_TEMPLATES_BY_FORM` sözlüğünü güncelleyebilirsiniz.

---

## 📬 İletişim & Sorun Bildirimi

Bir hata bulduysanız veya yeni bir özellik önermek istiyorsanız lütfen GitHub [Issues](https://github.com/Bluetwinklez/eczane-etiket/issues) sekmesinden şablonları kullanarak bildirim oluşturun.
