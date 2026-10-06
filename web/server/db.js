const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const fs = require('node:fs');

const dbPath = process.env.ECZANEM_DB_PATH || path.join(__dirname, '..', 'data', 'eczane.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS subeler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    adres TEXT,
    telefon TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_adi TEXT NOT NULL UNIQUE,
    sifre_hash TEXT NOT NULL,
    sifre_salt TEXT NOT NULL,
    ad_soyad TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'eczaci', 'kasiyer')),
    sube_id INTEGER REFERENCES subeler(id) ON DELETE SET NULL,
    aktif INTEGER NOT NULL DEFAULT 1,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ilaclar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    barkod TEXT UNIQUE,
    kategori TEXT,
    uretici TEXT,
    receteli INTEGER NOT NULL DEFAULT 0,
    kritik_stok INTEGER NOT NULL DEFAULT 10,
    alis_fiyati REAL NOT NULL DEFAULT 0,
    satis_fiyati REAL NOT NULL DEFAULT 0,
    skt TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ilac_stok (
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id) ON DELETE CASCADE,
    stok INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ilac_id, sube_id)
  );

  CREATE TABLE IF NOT EXISTS fiyat_gecmisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    eski_fiyat REAL NOT NULL,
    yeni_fiyat REAL NOT NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stok_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id) ON DELETE CASCADE,
    tip TEXT NOT NULL CHECK (tip IN ('giris', 'cikis')),
    adet INTEGER NOT NULL,
    aciklama TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS musteriler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_soyad TEXT NOT NULL,
    telefon TEXT,
    email TEXT,
    tc_no TEXT,
    adres TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tedarikciler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firma_adi TEXT NOT NULL,
    yetkili TEXT,
    telefon TEXT,
    email TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS satislar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    ara_toplam REAL NOT NULL DEFAULT 0,
    indirim_tutari REAL NOT NULL DEFAULT 0,
    toplam_tutar REAL NOT NULL DEFAULT 0,
    odeme_tipi TEXT NOT NULL DEFAULT 'nakit',
    sgk_recete INTEGER NOT NULL DEFAULT 0,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS satis_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_id INTEGER NOT NULL REFERENCES satislar(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    ilac_adi TEXT NOT NULL,
    adet INTEGER NOT NULL,
    birim_fiyat REAL NOT NULL,
    alis_fiyati REAL NOT NULL DEFAULT 0,
    ara_toplam REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bildirimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER REFERENCES musteriler(id) ON DELETE CASCADE,
    kanal TEXT NOT NULL CHECK (kanal IN ('email', 'sms')),
    mesaj TEXT NOT NULL,
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'gonderildi', 'simule', 'hata')),
    hata_mesaji TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kasa_kapanislari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL,
    nakit_sistem REAL NOT NULL DEFAULT 0,
    kart_sistem REAL NOT NULL DEFAULT 0,
    sgk_sistem REAL NOT NULL DEFAULT 0,
    toplam_sistem REAL NOT NULL DEFAULT 0,
    nakit_sayilan REAL NOT NULL DEFAULT 0,
    fark REAL NOT NULL DEFAULT 0,
    not_metni TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (sube_id, tarih)
  );

  CREATE TABLE IF NOT EXISTS giderler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kategori TEXT NOT NULL CHECK (kategori IN ('kira', 'fatura', 'maas', 'vergi', 'tedarik', 'diger')),
    aciklama TEXT,
    tutar REAL NOT NULL,
    tarih TEXT NOT NULL DEFAULT (date('now')),
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS siparisler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tedarikci_id INTEGER NOT NULL REFERENCES tedarikciler(id),
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    durum TEXT NOT NULL DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'gonderildi', 'teslim_alindi', 'iptal')),
    notlar TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
    teslim_tarihi TEXT
  );

  CREATE TABLE IF NOT EXISTS siparis_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siparis_id INTEGER NOT NULL REFERENCES siparisler(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    ilac_adi TEXT NOT NULL,
    istenen_adet INTEGER NOT NULL,
    tahmini_birim_fiyat REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gorevler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    baslik TEXT NOT NULL,
    aciklama TEXT,
    atanan_kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    olusturan_kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    oncelik TEXT NOT NULL DEFAULT 'orta' CHECK (oncelik IN ('dusuk', 'orta', 'yuksek')),
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'tamamlandi')),
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
    tamamlanma_tarihi TEXT
  );

  CREATE TABLE IF NOT EXISTS nobetler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tarih TEXT NOT NULL,
    notlar TEXT,
    UNIQUE (sube_id, tarih)
  );
`);

function sutunEkleGerekirse(tablo, sutun, tanim) {
  const kolonlar = db.prepare(`PRAGMA table_info(${tablo})`).all();
  if (!kolonlar.some((k) => k.name === sutun)) {
    db.exec(`ALTER TABLE ${tablo} ADD COLUMN ${sutun} ${tanim}`);
  }
}

sutunEkleGerekirse('satislar', 'ara_toplam', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('satislar', 'indirim_tutari', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('musteriler', 'saglik_notu', 'TEXT');
sutunEkleGerekirse('kullanicilar', 'sifre_degistirilmeli', 'INTEGER NOT NULL DEFAULT 0');
sutunEkleGerekirse('ilaclar', 'urun_tipi', "TEXT NOT NULL DEFAULT 'ilac'");

db.exec(`
  CREATE TABLE IF NOT EXISTS ayarlar (
    anahtar TEXT PRIMARY KEY,
    deger TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oturumlar (
    sid TEXT PRIMARY KEY,
    veri TEXT NOT NULL,
    bitis INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS islem_kayitlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT NOT NULL DEFAULT (datetime('now')),
    kullanici_id INTEGER,
    kullanici_adi TEXT,
    sube_id INTEGER,
    yontem TEXT NOT NULL,
    yol TEXT NOT NULL,
    kaynak TEXT,
    kayit_id TEXT,
    durum_kodu INTEGER NOT NULL,
    detay TEXT,
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_islem_kayitlari_tarih ON islem_kayitlari (tarih);

  -- Parti/lot bazli stok: ilac_stok.stok toplam miktari tutar, partiler bu
  -- miktarin hangi SKT'li lotlardan olustugunu gosterir (toplamlar esit tutulur).
  CREATE TABLE IF NOT EXISTS ilac_partileri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id) ON DELETE CASCADE,
    parti_no TEXT,
    skt TEXT,
    giris_miktari INTEGER NOT NULL,
    miktar INTEGER NOT NULL,
    kaynak TEXT,
    giris_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ilac_partileri_ilac_sube ON ilac_partileri (ilac_id, sube_id);

  CREATE TABLE IF NOT EXISTS satis_kalemi_partileri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_kalem_id INTEGER NOT NULL REFERENCES satis_kalemleri(id) ON DELETE CASCADE,
    parti_id INTEGER REFERENCES ilac_partileri(id) ON DELETE SET NULL,
    adet INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_satis_kalemi_partileri_kalem ON satis_kalemi_partileri (satis_kalem_id);

  -- Kampanyalar: yuzde indirim veya "X al Y ode"; urun, kategori, urun tipi
  -- ya da tum (recetesiz) urunler icin tanimlanabilir.
  CREATE TABLE IF NOT EXISTS kampanyalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    tip TEXT NOT NULL CHECK (tip IN ('yuzde', 'x_al_y_ode')),
    hedef_tip TEXT NOT NULL CHECK (hedef_tip IN ('tumu', 'urun', 'kategori', 'urun_tipi')),
    hedef_deger TEXT,
    indirim_yuzdesi REAL,
    al_adet INTEGER,
    ode_adet INTEGER,
    baslangic TEXT,
    bitis TEXT,
    aktif INTEGER NOT NULL DEFAULT 1,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

sutunEkleGerekirse('satis_kalemleri', 'kalem_indirimi', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('satis_kalemleri', 'kampanya_id', 'INTEGER');
sutunEkleGerekirse('satis_kalemleri', 'kampanya_adi', 'TEXT');
sutunEkleGerekirse('satislar', 'kampanya_indirimi', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('musteriler', 'veresiye_limiti', 'REAL');
sutunEkleGerekirse('kasa_kapanislari', 'veresiye_sistem', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('kasa_kapanislari', 'tahsilat_sistem', 'REAL NOT NULL DEFAULT 0');

// Veresiye (cari hesap) defteri: borc = veresiye satis, tahsilat = musteriden
// alinan odeme, iade = veresiye satisin iadesi. Bakiye = borc - tahsilat - iade.
db.exec(`
  CREATE TABLE IF NOT EXISTS cari_hareketler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
    sube_id INTEGER REFERENCES subeler(id),
    tip TEXT NOT NULL CHECK (tip IN ('borc', 'tahsilat', 'iade')),
    tutar REAL NOT NULL CHECK (tutar > 0),
    satis_id INTEGER REFERENCES satislar(id) ON DELETE SET NULL,
    odeme_tipi TEXT,
    aciklama TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_cari_hareketler_musteri ON cari_hareketler (musteri_id);

  -- Satis iadeleri: iade tutari kalemin net tutarindan (kampanya ve satis
  -- geneli indirim dusulmus) adet oraninda hesaplanir.
  CREATE TABLE IF NOT EXISTS iadeler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_id INTEGER NOT NULL REFERENCES satislar(id),
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    toplam_tutar REAL NOT NULL,
    odeme_tipi TEXT NOT NULL,
    stoga_alindi INTEGER NOT NULL DEFAULT 1,
    neden TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_iadeler_satis ON iadeler (satis_id);

  CREATE TABLE IF NOT EXISTS iade_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iade_id INTEGER NOT NULL REFERENCES iadeler(id) ON DELETE CASCADE,
    satis_kalem_id INTEGER NOT NULL REFERENCES satis_kalemleri(id),
    ilac_id INTEGER NOT NULL,
    ilac_adi TEXT NOT NULL,
    adet INTEGER NOT NULL,
    tutar REAL NOT NULL,
    alis_fiyati REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_iade_kalemleri_kalem ON iade_kalemleri (satis_kalem_id);
`);

sutunEkleGerekirse('satis_kalemi_partileri', 'iade_edilen', 'INTEGER NOT NULL DEFAULT 0');
sutunEkleGerekirse('kasa_kapanislari', 'iade_sistem', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('ilaclar', 'etken_madde', 'TEXT');
// Bir kutunun kac gun yettigi (kronik ilaclar icin bitis hatirlatmasi); bos = takip edilmez
sutunEkleGerekirse('ilaclar', 'kutu_gun', 'INTEGER');
sutunEkleGerekirse('satislar', 'puan_indirimi', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('satislar', 'kullanilan_puan', 'INTEGER NOT NULL DEFAULT 0');
sutunEkleGerekirse('satislar', 'kazanilan_puan', 'INTEGER NOT NULL DEFAULT 0');
// Recete bilgisi (satisa bagli) ve ilacin gerektirdigi recete turu
sutunEkleGerekirse('satislar', 'recete_no', 'TEXT');
sutunEkleGerekirse('satislar', 'recete_turu', 'TEXT');
sutunEkleGerekirse('satislar', 'recete_tarihi', 'TEXT');
sutunEkleGerekirse('satislar', 'doktor_adi', 'TEXT');
sutunEkleGerekirse('satislar', 'hasta_tc', 'TEXT');
// null: normal; 'kirmizi' / 'yesil': kontrollu (defter tutulur); 'mor' / 'turuncu': ozel receteli
sutunEkleGerekirse('ilaclar', 'recete_turu', 'TEXT');
// Satista girilen kullanim talimati (orn. 'Gunde 2x1 tok') - hasta kullanim karti icin
sutunEkleGerekirse('satis_kalemleri', 'kullanim', 'TEXT');
// Ticari elektronik ileti onayi (IYS): toplu kampanya mesajlari yalnizca onayli musterilere
sutunEkleGerekirse('musteriler', 'ileti_izni', 'INTEGER NOT NULL DEFAULT 0');
// Ekip duyuru panosu
db.exec(`
  CREATE TABLE IF NOT EXISTS duyurular (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER REFERENCES subeler(id),
    baslik TEXT NOT NULL,
    metin TEXT,
    onemli INTEGER NOT NULL DEFAULT 0,
    bitis TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Kasa ve finans: gun ici kasa giris/cikislari, tedarikci cari hesabi
db.exec(`
  CREATE TABLE IF NOT EXISTS kasa_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tip TEXT NOT NULL CHECK (tip IN ('giris', 'cikis')),
    tutar REAL NOT NULL,
    aciklama TEXT NOT NULL,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tedarikci_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tedarikci_id INTEGER NOT NULL REFERENCES tedarikciler(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tip TEXT NOT NULL CHECK (tip IN ('fatura', 'odeme')),
    tutar REAL NOT NULL,
    belge_no TEXT,
    belge_tarihi TEXT,
    vade_tarihi TEXT,
    odeme_sekli TEXT,
    aciklama TEXT,
    mal_kabul_id INTEGER REFERENCES mal_kabulleri(id) ON DELETE SET NULL,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tedarikci_hareketleri ON tedarikci_hareketleri (tedarikci_id, sube_id);
`);
sutunEkleGerekirse('tedarikciler', 'vade_gun', 'INTEGER NOT NULL DEFAULT 30');
sutunEkleGerekirse('tedarikciler', 'vergi_no', 'TEXT');
sutunEkleGerekirse('kasa_kapanislari', 'kasa_giris_sistem', 'REAL NOT NULL DEFAULT 0');
sutunEkleGerekirse('kasa_kapanislari', 'kasa_cikis_sistem', 'REAL NOT NULL DEFAULT 0');

// Kalite: geri cagirma, imha tutanagi, soguk zincir sicaklik defteri
db.exec(`
  CREATE TABLE IF NOT EXISTS geri_cagirmalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    parti_no TEXT NOT NULL,
    aciklama TEXT,
    stoktan_cekilen INTEGER NOT NULL DEFAULT 0,
    etkilenen_satis INTEGER NOT NULL DEFAULT 0,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS imhalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    yontem TEXT NOT NULL,
    tanik TEXT,
    aciklama TEXT,
    toplam_adet INTEGER NOT NULL DEFAULT 0,
    toplam_maliyet REAL NOT NULL DEFAULT 0,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS imha_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imha_id INTEGER NOT NULL REFERENCES imhalar(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    ilac_adi TEXT NOT NULL,
    parti_id INTEGER REFERENCES ilac_partileri(id) ON DELETE SET NULL,
    parti_no TEXT,
    skt TEXT,
    adet INTEGER NOT NULL,
    birim_maliyet REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sicaklik_kayitlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    dolap TEXT NOT NULL DEFAULT 'Buzdolabı',
    sicaklik REAL NOT NULL,
    aralik_disi INTEGER NOT NULL DEFAULT 0,
    notlar TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id),
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sicaklik_sube_tarih ON sicaklik_kayitlari (sube_id, tarih);
`);

// Hasta guvenligi: gebelik/emzirme ve yas uyarilari, raf konumu
sutunEkleGerekirse('musteriler', 'dogum_tarihi', 'TEXT');
sutunEkleGerekirse('musteriler', 'gebelik_durumu', 'TEXT');
sutunEkleGerekirse('ilaclar', 'gebelik_uyari', 'TEXT');
sutunEkleGerekirse('ilaclar', 'min_yas', 'INTEGER');
sutunEkleGerekirse('ilaclar', 'yasli_uyari', 'INTEGER NOT NULL DEFAULT 0');
sutunEkleGerekirse('ilaclar', 'raf_konumu', 'TEXT');
sutunEkleGerekirse('ilaclar', 'hizli_tus', 'INTEGER NOT NULL DEFAULT 0');

// Ayni ilac bitis donemi icin musteriye tekrar tekrar hatirlatma gitmesin
db.exec(`
  CREATE TABLE IF NOT EXISTS ilac_hatirlatmalari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    bitis_tarihi TEXT NOT NULL,
    bildirim_id INTEGER REFERENCES bildirimler(id) ON DELETE SET NULL,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (musteri_id, ilac_id, bitis_tarihi)
  );

  -- Stok sayimi: sayilan adetler girilir, tamamlaninca farklar stoga islenir
  CREATE TABLE IF NOT EXISTS sayimlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    durum TEXT NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'tamamlandi', 'iptal')),
    kapsam TEXT,
    aciklama TEXT,
    baslangic TEXT NOT NULL DEFAULT (datetime('now')),
    bitis TEXT
  );

  CREATE TABLE IF NOT EXISTS sayim_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sayim_id INTEGER NOT NULL REFERENCES sayimlar(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sayilan INTEGER NOT NULL,
    sistem_stok INTEGER,
    fark INTEGER,
    UNIQUE (sayim_id, ilac_id)
  );

  -- Subeler arasi transfer: gonderimde kaynaktan duser, teslimde hedefe ayni
  -- parti/SKT ile girer
  CREATE TABLE IF NOT EXISTS transferler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kaynak_sube_id INTEGER NOT NULL REFERENCES subeler(id),
    hedef_sube_id INTEGER NOT NULL REFERENCES subeler(id),
    gonderen_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    teslim_alan_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    durum TEXT NOT NULL DEFAULT 'yolda' CHECK (durum IN ('yolda', 'teslim_alindi', 'iptal')),
    aciklama TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now')),
    teslim_tarihi TEXT
  );

  CREATE TABLE IF NOT EXISTS transfer_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_id INTEGER NOT NULL REFERENCES transferler(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    adet INTEGER NOT NULL,
    parti_no TEXT,
    skt TEXT
  );

  -- Mal kabul (irsaliye/fatura girisi). mf: mal fazlasi (bedelsiz gelen adet);
  -- gercek birim maliyet = alis_fiyati * adet / (adet + mf)
  CREATE TABLE IF NOT EXISTS mal_kabulleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tedarikci_id INTEGER REFERENCES tedarikciler(id) ON DELETE SET NULL,
    siparis_id INTEGER REFERENCES siparisler(id) ON DELETE SET NULL,
    fatura_no TEXT,
    fatura_tarihi TEXT,
    toplam_tutar REAL NOT NULL DEFAULT 0,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mal_kabul_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mal_kabul_id INTEGER NOT NULL REFERENCES mal_kabulleri(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    adet INTEGER NOT NULL,
    mf INTEGER NOT NULL DEFAULT 0,
    alis_fiyati REAL NOT NULL,
    birim_maliyet REAL NOT NULL,
    parti_no TEXT,
    skt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mal_kabul_kalemleri_ilac ON mal_kabul_kalemleri (ilac_id);

  -- Bolunmus (karma) odemeli satislarin odeme kirilimi
  CREATE TABLE IF NOT EXISTS satis_odemeleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_id INTEGER NOT NULL REFERENCES satislar(id) ON DELETE CASCADE,
    odeme_tipi TEXT NOT NULL CHECK (odeme_tipi IN ('nakit', 'kredi_karti')),
    tutar REAL NOT NULL CHECK (tutar > 0)
  );
  CREATE INDEX IF NOT EXISTS idx_satis_odemeleri_satis ON satis_odemeleri (satis_id);

  -- Sadakat puani hareketleri (+ kazanim / - kullanim, iadede ters kayit)
  CREATE TABLE IF NOT EXISTS puan_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
    satis_id INTEGER REFERENCES satislar(id) ON DELETE SET NULL,
    iade_id INTEGER REFERENCES iadeler(id) ON DELETE SET NULL,
    puan INTEGER NOT NULL,
    aciklama TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_puan_hareketleri_musteri ON puan_hareketleri (musteri_id);

  -- Eksik / istek defteri: stokta olmayan ama musterinin istedigi urunler
  CREATE TABLE IF NOT EXISTS istekler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
    musteri_adi TEXT,
    telefon TEXT,
    ilac_id INTEGER REFERENCES ilaclar(id) ON DELETE SET NULL,
    urun_adi TEXT NOT NULL,
    adet INTEGER NOT NULL DEFAULT 1,
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'haber_verildi', 'teslim_edildi', 'iptal')),
    notlar TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now')),
    guncelleme TEXT
  );

  -- Emanet ilac defteri: baska eczaneden alinan / baska eczaneye verilen ilaclar
  CREATE TABLE IF NOT EXISTS emanetler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    yon TEXT NOT NULL CHECK (yon IN ('alinan', 'verilen')),
    karsi_eczane TEXT NOT NULL,
    telefon TEXT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    adet INTEGER NOT NULL CHECK (adet > 0),
    durum TEXT NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'kapandi')),
    kapanis_sekli TEXT,
    notlar TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now')),
    kapanis_tarihi TEXT
  );

  -- Personel vardiya cizelgesi: kisi basina gunde bir kayit
  CREATE TABLE IF NOT EXISTS vardiyalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
    tarih TEXT NOT NULL,
    tip TEXT NOT NULL DEFAULT 'calisma' CHECK (tip IN ('calisma', 'izin', 'rapor')),
    baslangic TEXT,
    bitis TEXT,
    notlar TEXT,
    UNIQUE (kullanici_id, tarih)
  );

  -- Vardiya devir notlari (bir sonraki vardiyaya aktarilacaklar)
  CREATE TABLE IF NOT EXISTS vardiya_notlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    metin TEXT NOT NULL,
    tamamlandi INTEGER NOT NULL DEFAULT 0,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Aylik satis hedefleri (sube bazinda)
  CREATE TABLE IF NOT EXISTS satis_hedefleri (
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    ay TEXT NOT NULL,
    hedef_tutar REAL NOT NULL CHECK (hedef_tutar > 0),
    PRIMARY KEY (sube_id, ay)
  );

  -- POS'ta bekletilen (park edilen) sepetler
  CREATE TABLE IF NOT EXISTS bekleyen_sepetler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    etiket TEXT,
    veri TEXT NOT NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Etken madde ciftleri arasindaki bilinen etkilesimler (madde_a < madde_b sirali saklanir)
db.exec(`
  CREATE TABLE IF NOT EXISTS etkilesimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    madde_a TEXT NOT NULL,
    madde_b TEXT NOT NULL,
    seviye TEXT NOT NULL CHECK (seviye IN ('ciddi', 'orta', 'hafif')),
    aciklama TEXT NOT NULL,
    UNIQUE (madde_a, madde_b)
  );
`);

// Ornek katalogdaki ilaclarin etken maddeleri (eski veritabanlari icin de doldurulur)
const ORNEK_ETKEN_MADDELER = {
  '8699504010012': 'parasetamol',
  '8699504010029': 'asetilsalisilik asit',
  '8699504010036': 'amoksisilin, klavulanik asit',
  '8699504010043': 'ibuprofen',
  '8699504010050': 'essitalopram',
  '8699504010067': 'diklofenak',
  '8699504010074': 'asetilsalisilik asit',
  '8699504010081': 'alprazolam',
  '8699504010098': 'hidrotalsit',
  '8699504010104': 'metoprolol'
};
// Ornek katalogdaki kronik kullanim ilaclari: bir kutu kac gun yeter
const ORNEK_KUTU_GUNLERI = {
  '8699504010029': 30,
  '8699504010050': 28,
  '8699504010074': 30,
  '8699504010104': 28,
  '8699546352071': 30,
  '8681234560017': 60
};

// Ornek katalog: Xanax (alprazolam) Turkiye'de yesil receteyle satilir
function ornekReceteTurleriniDoldur() {
  db.prepare("UPDATE ilaclar SET recete_turu = 'yesil' WHERE barkod = '8699504010081' AND recete_turu IS NULL").run();
}

function ornekKutuGunleriniDoldur() {
  const guncelle = db.prepare('UPDATE ilaclar SET kutu_gun = ? WHERE barkod = ? AND kutu_gun IS NULL');
  for (const [barkod, gun] of Object.entries(ORNEK_KUTU_GUNLERI)) guncelle.run(gun, barkod);
}

function ornekEtkenMaddeleriDoldur() {
  const guncelle = db.prepare('UPDATE ilaclar SET etken_madde = ? WHERE barkod = ? AND etken_madde IS NULL');
  for (const [barkod, madde] of Object.entries(ORNEK_ETKEN_MADDELER)) guncelle.run(madde, barkod);
}

// Sinirli ornek veri seti: klinik karar destek sisteminin yerini tutmaz.
if (db.prepare('SELECT COUNT(*) AS c FROM etkilesimler').get().c === 0) {
  const ekle = db.prepare('INSERT OR IGNORE INTO etkilesimler (madde_a, madde_b, seviye, aciklama) VALUES (?, ?, ?, ?)');
  const ornekler = [
    ['asetilsalisilik asit', 'ibuprofen', 'orta', 'İbuprofen, düşük doz aspirinin antiplatelet (kalbi koruyucu) etkisini azaltabilir; birlikte kullanımda mide-bağırsak kanama riski artar.'],
    ['asetilsalisilik asit', 'essitalopram', 'orta', "SSRI'lar ile aspirinin birlikte kullanımında kanama riski artar."],
    ['essitalopram', 'ibuprofen', 'orta', "SSRI'lar ile NSAİİ'lerin birlikte kullanımında özellikle mide-bağırsak kanama riski artar."],
    ['diklofenak', 'essitalopram', 'orta', "SSRI'lar ile NSAİİ'lerin birlikte kullanımında kanama riski artar."],
    ['diklofenak', 'ibuprofen', 'orta', "İki NSAİİ'nin birlikte kullanımı ek fayda sağlamadan mide ve böbrek yan etki riskini artırır."],
    ['ibuprofen', 'metoprolol', 'hafif', "NSAİİ'ler beta blokerlerin tansiyon düşürücü etkisini azaltabilir; tansiyon takibi önerilir."],
    ['essitalopram', 'tramadol', 'ciddi', 'Serotonin sendromu ve nöbet riski artar.'],
    ['asetilsalisilik asit', 'varfarin', 'ciddi', 'Kanama riski belirgin şekilde artar.'],
    ['ibuprofen', 'varfarin', 'ciddi', 'Kanama riski belirgin şekilde artar.'],
    ['hidrotalsit', 'siprofloksasin', 'orta', 'Antasitler siprofloksasinin emilimini azaltır; en az 2 saat arayla alınmalıdır.']
  ];
  for (const [a, b, seviye, aciklama] of ornekler) ekle.run(a, b, seviye, aciklama);
}

function ayarOku(anahtar) {
  const row = db.prepare('SELECT deger FROM ayarlar WHERE anahtar = ?').get(anahtar);
  return row ? row.deger : null;
}

function ayarYaz(anahtar, deger) {
  db.prepare(
    'INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger'
  ).run(anahtar, deger);
}

function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(plain, salt, hash) {
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

// Eski kurulumlardaki ASCII demo metinlerini Turkce karakterli hallerine cevirir.
// Yalnizca demo verisiyle birebir ayni kalmis alanlar degisir; kullanicinin
// duzenledigi kayitlara dokunulmaz.
const DEMO_METIN_DUZELTMELERI = [
  ['subeler', 'ad'], ['subeler', 'adres'], ['kullanicilar', 'ad_soyad'], ['ilaclar', 'ad'], ['ilaclar', 'kategori'],
  ['musteriler', 'ad_soyad'], ['musteriler', 'adres'], ['tedarikciler', 'firma_adi'], ['tedarikciler', 'yetkili'],
  ['kampanyalar', 'hedef_deger']
];
const DEMO_METINLER = [
  ['Ataturk Mah. Cumhuriyet Cad. No:1, Istanbul', 'Atatürk Mah. Cumhuriyet Cad. No:1, İstanbul'],
  ['Kadikoy Subesi', 'Kadıköy Şubesi'],
  ['Bagdat Cad. No:45, Istanbul', 'Bağdat Cad. No:45, İstanbul'],
  ['Sistem Yoneticisi', 'Sistem Yöneticisi'],
  ['Eczaci Kullanici', 'Eczacı Kullanıcı'],
  ['Kasiyer Kullanici', 'Kasiyer Kullanıcı'],
  ['Agri Kesici', 'Ağrı Kesici'],
  ['Mide Bagirsak', 'Mide Bağırsak'],
  ['Cilt Bakim', 'Cilt Bakım'],
  ['Olcum Cihazi', 'Ölçüm Cihazı'],
  ['Omega-3 Balik Yagi 60 Kapsul', 'Omega-3 Balık Yağı 60 Kapsül'],
  ['Cerrahi Maske 50li', "Cerrahi Maske 50'li"],
  ['Ahmet Yilmaz', 'Ahmet Yılmaz'],
  ['Ataturk Mah. No:5, Istanbul', 'Atatürk Mah. No:5, İstanbul'],
  ['Ayse Kaya', 'Ayşe Kaya'],
  ['Hedef Ilac Dagitim', 'Hedef İlaç Dağıtım'],
  ['Selcuk Ecza Deposu', 'Selçuk Ecza Deposu'],
  ['Fatma Sahin', 'Fatma Şahin']
];
function demoMetinleriniDuzelt() {
  for (const [tablo, alan] of DEMO_METIN_DUZELTMELERI) {
    const guncelle = db.prepare(`UPDATE ${tablo} SET ${alan} = ? WHERE ${alan} = ?`);
    for (const [eski, yeni] of DEMO_METINLER) guncelle.run(yeni, eski);
  }
}

// Demo ilaclarina ornek gebelik/yas uyarisi ve raf konumu (yalnizca bos alanlar)
const ORNEK_GUVENLIK = {
  'Voltaren Emulgel 50g': ['dikkat', 14, 1, 'B2'],
  'Nurofen 400mg 24 Tablet': ['dikkat', 12, 1, 'A2'],
  'Aspirin 100mg 30 Tablet': ['dikkat', 16, 0, 'A1'],
  'Xanax 0.5mg 30 Tablet': ['kontrendike', 18, 1, 'Kasa (kilitli)'],
  'Cipralex 10mg 28 Tablet': ['dikkat', 18, 0, 'C1'],
  'Augmentin BID 1000mg 14 Tablet': [null, 12, 0, 'C3'],
  'Parol 500mg 20 Tablet': [null, 12, 0, 'A1'],
  'Coraspin 100mg 30 Tablet': ['dikkat', 16, 0, 'A3'],
  'Beloc Zok 50mg 28 Tablet': ['dikkat', 18, 0, 'D1'],
  'Talcid 500mg 20 Tablet': [null, 12, 0, 'B1']
};
function ornekGuvenlikBilgileriniDoldur() {
  const guncelle = db.prepare(
    `UPDATE ilaclar SET gebelik_uyari = COALESCE(gebelik_uyari, ?), min_yas = COALESCE(min_yas, ?),
       yasli_uyari = CASE WHEN yasli_uyari = 0 THEN ? ELSE yasli_uyari END, raf_konumu = COALESCE(raf_konumu, ?)
     WHERE ad = ?`
  );
  if (ayarOku('ornek_guvenlik_dolduruldu')) return;
  // Kasada hizli tus olarak en cok satilan demo urunleri
  const hizliTus = db.prepare('UPDATE ilaclar SET hizli_tus = 1 WHERE ad = ?');
  for (const ad of ['Parol 500mg 20 Tablet', 'Aspirin 100mg 30 Tablet', 'Nurofen 400mg 24 Tablet', "Cerrahi Maske 50'li", 'Talcid 500mg 20 Tablet', 'Supradyn Energy 30 Tablet']) {
    hizliTus.run(ad);
  }
  for (const [ad, [gebelik, minYas, yasli, raf]] of Object.entries(ORNEK_GUVENLIK)) guncelle.run(gebelik, minYas, yasli, raf, ad);
  ayarYaz('ornek_guvenlik_dolduruldu', '1');
}

function seedIfEmpty() {
  const subeCount = db.prepare('SELECT COUNT(*) AS c FROM subeler').get().c;
  if (subeCount === 0) {
    db.prepare('INSERT INTO subeler (ad, adres, telefon) VALUES (?, ?, ?)').run(
      'Merkez Eczane',
      'Atatürk Mah. Cumhuriyet Cad. No:1, İstanbul',
      '02121234567'
    );
    db.prepare('INSERT INTO subeler (ad, adres, telefon) VALUES (?, ?, ?)').run(
      'Kadıköy Şubesi',
      'Bağdat Cad. No:45, İstanbul',
      '02167654321'
    );
  }

  const kullaniciCount = db.prepare('SELECT COUNT(*) AS c FROM kullanicilar').get().c;
  if (kullaniciCount === 0) {
    const merkezId = db.prepare('SELECT id FROM subeler ORDER BY id LIMIT 1').get().id;
    const admin = hashPassword('admin123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id, sifre_degistirilmeli)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run('admin', admin.hash, admin.salt, 'Sistem Yöneticisi', 'admin', merkezId);

    const eczaci = hashPassword('eczaci123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id, sifre_degistirilmeli)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run('eczaci', eczaci.hash, eczaci.salt, 'Eczacı Kullanıcı', 'eczaci', merkezId);

    const kasiyer = hashPassword('kasiyer123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id, sifre_degistirilmeli)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run('kasiyer', kasiyer.hash, kasiyer.salt, 'Kasiyer Kullanıcı', 'kasiyer', merkezId);
  }

  const ilacCount = db.prepare('SELECT COUNT(*) AS c FROM ilaclar').get().c;
  if (ilacCount === 0) {
    const subeler = db.prepare('SELECT id FROM subeler ORDER BY id').all();
    const insertIlac = db.prepare(`
      INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertStok = db.prepare('INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)');

    const ornekIlaclar = [
      ['Parol 500mg 20 Tablet', '8699504010012', 'Ağrı Kesici', 'Atabay', 0, 20, 15.5, 24.9, '2027-03-01', [120, 60]],
      ['Aspirin 100mg 30 Tablet', '8699504010029', 'Ağrı Kesici', 'Bayer', 0, 15, 22.0, 35.5, '2026-11-15', [80, 40]],
      ['Augmentin BID 1000mg 14 Tablet', '8699504010036', 'Antibiyotik', 'GSK', 1, 10, 65.0, 98.75, '2026-05-20', [40, 15]],
      ['Nurofen 400mg 24 Tablet', '8699504010043', 'Ağrı Kesici', 'Reckitt', 0, 15, 28.0, 42.0, '2027-01-10', [60, 25]],
      ['Cipralex 10mg 28 Tablet', '8699504010050', 'Psikiyatrik', 'Lundbeck', 1, 8, 110.0, 165.0, '2026-09-30', [25, 10]],
      ['Voltaren Emulgel 50g', '8699504010067', 'Ağrı Kesici', 'Novartis', 0, 10, 48.0, 72.5, '2027-06-01', [45, 20]],
      ['Coraspin 100mg 30 Tablet', '8699504010074', 'Kalp Damar', 'Bayer', 0, 20, 18.0, 27.9, '2026-12-25', [90, 30]],
      ['Xanax 0.5mg 30 Tablet', '8699504010081', 'Psikiyatrik', 'Pfizer', 1, 5, 32.0, 49.0, '2026-08-05', [15, 5]],
      ['Talcid 500mg 20 Tablet', '8699504010098', 'Mide Bağırsak', 'Bayer', 0, 12, 20.0, 31.0, '2027-02-14', [55, 20]],
      ['Beloc Zok 50mg 28 Tablet', '8699504010104', 'Kalp Damar', 'AstraZeneca', 1, 10, 25.0, 38.5, '2026-10-01', [8, 3]]
    ];
    for (const [ad, barkod, kategori, uretici, receteli, kritikStok, alis, satis, skt, stoklar] of ornekIlaclar) {
      const info = insertIlac.run(ad, barkod, kategori, uretici, receteli, kritikStok, alis, satis, skt);
      subeler.forEach((sube, idx) => {
        insertStok.run(info.lastInsertRowid, sube.id, stoklar[idx] ?? 0);
      });
    }

    // Eczanelerde ilac disi urunler de satilir; ornek veriler
    const ilacDisiUrunler = [
      ['La Roche-Posay Effaclar Jel 200ml', '3337875545723', 'Cilt Bakım', 'La Roche-Posay', 'dermokozmetik', 5, 310.0, 449.0, '2028-01-01', [12, 6]],
      ['Bioderma Sensibio H2O 250ml', '3401345935571', 'Cilt Bakım', 'Bioderma', 'dermokozmetik', 5, 260.0, 379.0, '2027-11-01', [10, 4]],
      ['Supradyn Energy 30 Tablet', '8699546352071', 'Vitamin', 'Bayer', 'takviye', 6, 140.0, 219.0, '2027-08-01', [18, 8]],
      ['Omega-3 Balık Yağı 60 Kapsül', '8681234560017', 'Vitamin', 'Solgar', 'takviye', 6, 190.0, 289.0, '2027-05-01', [9, 4]],
      ['Omron M3 Tansiyon Aleti', '4015672105911', 'Ölçüm Cihazı', 'Omron', 'medikal', 2, 1350.0, 1890.0, null, [4, 2]],
      ["Cerrahi Maske 50'li", '8682345670019', 'Koruyucu', 'Medikal Tekstil', 'medikal', 10, 45.0, 79.0, '2029-01-01', [40, 20]]
    ];
    const insertUrun = db.prepare(`
      INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, urun_tipi)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);
    for (const [ad, barkod, kategori, uretici, tip, kritikStok, alis, satis, skt, stoklar] of ilacDisiUrunler) {
      const info = insertUrun.run(ad, barkod, kategori, uretici, kritikStok, alis, satis, skt, tip);
      subeler.forEach((sube, idx) => {
        insertStok.run(info.lastInsertRowid, sube.id, stoklar[idx] ?? 0);
      });
    }
  }

  const musteriCount = db.prepare('SELECT COUNT(*) AS c FROM musteriler').get().c;
  if (musteriCount === 0) {
    db.prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres) VALUES (?, ?, ?, ?, ?)').run(
      'Ahmet Yılmaz', '05551112233', 'ahmet.yilmaz@example.com', '12345678901', 'Atatürk Mah. No:5, İstanbul'
    );
    db.prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres) VALUES (?, ?, ?, ?, ?)').run(
      'Ayşe Kaya', '05339876543', 'ayse.kaya@example.com', '98765432109', 'Cumhuriyet Cad. No:12, Ankara'
    );
  }

  const tedarikciCount = db.prepare('SELECT COUNT(*) AS c FROM tedarikciler').get().c;
  if (tedarikciCount === 0) {
    db.prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email) VALUES (?, ?, ?, ?)').run(
      'Hedef İlaç Dağıtım', 'Mehmet Demir', '02123334455', 'info@hedefilac.com'
    );
    db.prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email) VALUES (?, ?, ?, ?)').run(
      'Selçuk Ecza Deposu', 'Fatma Şahin', '02163332211', 'satis@selcukecza.com'
    );
  }
}

// Karekod (seri no) hareket defteri: kutu bazli takip. Gercek ITS bildirimi icin hazirlik kaydidir.
db.exec(`
  CREATE TABLE IF NOT EXISTS karekod_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tip TEXT NOT NULL CHECK (tip IN ('giris', 'satis', 'iade')),
    ilac_id INTEGER REFERENCES ilaclar(id) ON DELETE SET NULL,
    gtin TEXT NOT NULL,
    seri_no TEXT NOT NULL,
    parti_no TEXT,
    skt TEXT,
    satis_id INTEGER REFERENCES satislar(id) ON DELETE SET NULL,
    mal_kabul_id INTEGER REFERENCES mal_kabulleri(id) ON DELETE SET NULL,
    iade_id INTEGER REFERENCES iadeler(id) ON DELETE SET NULL,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_karekod_seri ON karekod_hareketleri (gtin, seri_no, id);
`);

// Ilac karti bilgileri: tablet gorunumu (ilac tespit), ATC/endikasyon, kamu fiyatlari, SUT/KUB/KT notlari.
// Veriyi eczane girer veya CSV ile iceri aktarir; hazir bir ilac veritabani paketlenmez.
db.exec(`
  CREATE TABLE IF NOT EXISTS ilac_bilgi (
    ilac_id INTEGER PRIMARY KEY REFERENCES ilaclar(id) ON DELETE CASCADE,
    atc_kodu TEXT,
    endikasyon TEXT,
    tablet_renk TEXT,
    tablet_sekil TEXT,
    tablet_yazi TEXT,
    tablet_centik TEXT,
    tablet_seffaf INTEGER NOT NULL DEFAULT 0,
    imalatci_fiyati REAL,
    depocu_fiyati REAL,
    kamu_fiyati REAL,
    kamu_odenecek REAL,
    kurum_iskontosu REAL,
    sgk_kapsaminda INTEGER NOT NULL DEFAULT 0,
    sut_notu TEXT,
    kub_url TEXT,
    kt_url TEXT,
    guncelleme TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS fiyat_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    tarih TEXT NOT NULL,
    isf REAL, dsf REAL, psf REAL, kf REAL, ko REAL, ki REAL,
    kaynak TEXT NOT NULL DEFAULT 'kayit'
  );
  CREATE INDEX IF NOT EXISTS idx_fiyat_hareketleri ON fiyat_hareketleri (ilac_id, tarih);
  -- TITCK (SKRS e-recete) resmi ilac listesi: barkod, ATC, firma, recete turu, aktif/pasif durumu
  CREATE TABLE IF NOT EXISTS titck_ilaclar (
    barkod TEXT PRIMARY KEY,
    ad TEXT NOT NULL,
    atc_kodu TEXT,
    atc_adi TEXT,
    firma TEXT,
    recete_turu TEXT,
    durum TEXT NOT NULL CHECK (durum IN ('aktif', 'pasif', 'pasife_alinacak')),
    temel_ilac INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_titck_atc ON titck_ilaclar (atc_kodu);
`);
// Hasta takibi: raporlu ilac (rapor bitis uyarisi) ve musteri olcumleri (tansiyon, seker...)
db.exec(`
  CREATE TABLE IF NOT EXISTS hasta_raporlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
    sube_id INTEGER REFERENCES subeler(id),
    rapor_no TEXT,
    tani TEXT,
    ilac TEXT,
    doktor TEXT,
    baslangic TEXT,
    bitis TEXT NOT NULL,
    notlar TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_hasta_raporlari_bitis ON hasta_raporlari (bitis);
  CREATE TABLE IF NOT EXISTS musteri_olcumleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
    sube_id INTEGER REFERENCES subeler(id),
    tip TEXT NOT NULL CHECK (tip IN ('tansiyon', 'seker', 'nabiz', 'ates', 'spo2', 'kilo', 'kolesterol')),
    deger1 REAL NOT NULL,
    deger2 REAL,
    aclik TEXT CHECK (aclik IN ('ac', 'tok')),
    notlar TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_musteri_olcumleri ON musteri_olcumleri (musteri_id, tip, tarih);
`);
// Depoya iade: miadi yaklasan partilerin tedarikciye iadesi (iade formu icin kalemleriyle)
db.exec(`
  CREATE TABLE IF NOT EXISTS depo_iadeleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    tedarikci_id INTEGER REFERENCES tedarikciler(id) ON DELETE SET NULL,
    belge_no TEXT,
    toplam REAL NOT NULL DEFAULT 0,
    aciklama TEXT,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS depo_iade_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iade_id INTEGER NOT NULL REFERENCES depo_iadeleri(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    parti_id INTEGER REFERENCES ilac_partileri(id) ON DELETE SET NULL,
    parti_no TEXT,
    skt TEXT,
    adet INTEGER NOT NULL,
    birim_maliyet REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS e_arsiv_faturalari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_id INTEGER NOT NULL UNIQUE REFERENCES satislar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    fatura_no TEXT NOT NULL UNIQUE,
    ettn TEXT NOT NULL,
    tarih TEXT NOT NULL,
    alici_ad TEXT,
    alici_kimlik TEXT,
    kdv_haric REAL NOT NULL DEFAULT 0,
    kdv REAL NOT NULL DEFAULT 0,
    toplam REAL NOT NULL DEFAULT 0,
    xml TEXT NOT NULL,
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// SGK SUT ilac listeleri (resmi dosyadan yuklenir, yeniden yuklenebilir oldugu icin yedege girmez)
db.exec(`
  CREATE TABLE IF NOT EXISTS sgk_ek4a (
    barkod TEXT PRIMARY KEY,
    kamu_no TEXT,
    ad TEXT NOT NULL,
    eski_barkodlar TEXT,
    esdeger_grup TEXT,
    referans_grup TEXT,
    giris_tarihi TEXT,
    aktif_tarihi TEXT,
    pasif_tarihi TEXT,
    durum TEXT,
    isk1 REAL,
    isk2 REAL,
    isk3 REAL,
    isk4 REAL,
    ozel_iskonto TEXT,
    eczaci_iskonto TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sgk_ek4a_esdeger ON sgk_ek4a (esdeger_grup);
  CREATE TABLE IF NOT EXISTS sgk_ek4d_gruplar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT,
    ana TEXT,
    baslik TEXT NOT NULL,
    araliklar TEXT,
    ortak_not TEXT
  );
  CREATE TABLE IF NOT EXISTS sgk_ek4d_icd (
    grup_id INTEGER NOT NULL REFERENCES sgk_ek4d_gruplar(id) ON DELETE CASCADE,
    icd TEXT NOT NULL,
    ad TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sgk_ek4d_icd ON sgk_ek4d_icd (icd);
  CREATE TABLE IF NOT EXISTS sgk_ek4d_ilaclar (
    grup_id INTEGER NOT NULL REFERENCES sgk_ek4d_gruplar(id) ON DELETE CASCADE,
    no TEXT,
    ad TEXT NOT NULL,
    endikasyon INTEGER NOT NULL DEFAULT 0,
    kosul TEXT
  );
  CREATE TABLE IF NOT EXISTS sgk_kurallar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liste TEXT NOT NULL CHECK (liste IN ('EK-4E', 'EK-4F')),
    grup TEXT,
    no TEXT,
    baslik TEXT,
    metin TEXT NOT NULL
  );
`);
// Dermokozmetik kategori agaci (ana kategori / alt kategori)
sutunEkleGerekirse('ilac_bilgi', 'derma_ana', 'TEXT');
sutunEkleGerekirse('ilac_bilgi', 'derma_alt', 'TEXT');

seedIfEmpty();
ornekEtkenMaddeleriDoldur();
ornekKutuGunleriniDoldur();
ornekReceteTurleriniDoldur();
demoMetinleriniDuzelt();
ornekGuvenlikBilgileriniDoldur();

module.exports = { db, hashPassword, verifyPassword, ayarOku, ayarYaz, demoMetinleriniDuzelt };
