# Eczam Programı (Web)

> Bu klasör, depodaki masaüstü **Eczane Etiket** uygulamasının yanında duran web tabanlı eczane yönetim sistemidir. Depo genel bakışı için [ana README](../README.md) dosyasına bakın.

Eczane yönetim ve otomasyon sistemi. Node.js + Express + yerleşik `node:sqlite` üzerinde çalışan, build adımı gerektirmeyen sade bir HTML/CSS/JS arayüzü olan tek prosesli bir web uygulaması.

## Özellikler

**Çekirdek**: ilaç envanteri, şube bazlı stok takibi ve otomatik düşüm, kritik stok uyarısı, son kullanma tarihi (SKT) uyarısı, satış/POS ekranı, reçeteli/reçetesiz ayrımı, müşteri kayıtları + satış geçmişi, tedarikçi yönetimi, fiyat geçmişi + kâr marjı, barkod ile arama.

**Raporlama**: gün/hafta/ay satış raporu, en çok satan ilaçlar, kritik stok + SKT raporu, kâr-zarar raporu, reçete/SGK işlem raporu. Her rapor CSV veya PDF olarak indirilebilir.

**İleri seviye**: kullanıcı girişi + rol yönetimi (admin/eczacı/kasiyer), çoklu şube desteği, e-posta/SMS hatırlatma (e-posta SMTP ile gerçek gönderim yapar; SMS ve SMTP tanımsızken e-posta simüle edilir), yedekleme/geri yükleme (JSON export/import).

**Ek özellikler**: POS'ta yüzdelik indirim desteği, yazdırılabilir satış fişi, ilaç bazlı stok hareketleri geçmişi, ana sayfada son 7 günün satış trend grafiği, karanlık/aydınlık tema (kalıcı tercih), POS klavye kısayolları (F2 arama, Enter ile sepete ekle, Ctrl+Enter ile satışı tamamla), her sayfadan `Ctrl+K` ile açılan hızlı komut paleti (sayfa + ilaç/müşteri arama).

**Arayüz**: siyah kenar menü (ikonlu, gruplu), adaçayı zemin ve fıstık yeşili vurgu rengi, yuvarlak kartlar ve hap butonlar; başlıklar Bricolage Grotesque, metinler Manrope (font dosyaları `public/fonts` altında yerel olarak bulunur, internet gerekmez; SIL OFL lisanslı). Ana sayfa paneli: bugünkü ciro/satış (düne göre değişim), kritik stok ve SKT kutuları, son satışlar, kategori radarı (son 30 gün / önceki 30 gün), bu hafta / geçen hafta satış trendi (fareyle gün ayrıntısı), bugün vardiyada olan ekip, hızlı işlemler ve aylık hedef kartı. Grafik verileri `GET /api/satislar/panel-ozet` ucundan gelir ve her grafik "Tablo olarak gör" ile tablo halinde de okunabilir.

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

**Depo ve stok yönetimi (ek paket)**:
- **Mal kabul (irsaliye/fatura girişi)**: Tedarikçi, fatura no, parti/SKT ve mal fazlası (MF, örn. 10+1) tek ekrandan girilir. Gerçek birim maliyet MF dahil hesaplanır. Karekod okutunca ürün, parti ve SKT kendiliğinden dolar. Bekleyen bir sipariş bu girişle kapatılabilir. **e-Fatura (UBL-TR XML veya XML içeren ZIP) yüklenince** satırlar barkoddan eşleşir; adet, mal fazlası (bedelsiz satır veya "MF" notu), KDV dahil/hariç birim fiyat, parti ve SKT forma dolar. Tedarikçi vergi numarasıyla bulunur (yoksa tek tıkla eklenir), katalogda olmayan ürün TİTCK listesinden eklenebilir, aynı fatura ikinci kez yüklenirse uyarılır.
- **Stok sayımı**: Sayılan adet elle girilir ya da barkod okutulur (her okutma +1). Fark canlı görünür. Tamamlanınca yalnızca sayılan ürünlerin stoğu düzeltilir; fazlalar yeni parti olarak girer, eksikler SKT sırasıyla düşer.
- **Şubeler arası transfer**: Gönderen şubeden stok SKT sırasıyla düşer. Alıcı şube teslim alınca ürün aynı parti ve SKT ile girer. Yoldaki transfer iptal edilirse ürün geri döner.
- **Toplu fiyat güncelleme**: Kategori, ürün tipi ya da reçeteli/reçetesiz ürünlere yüzde zam veya indirim uygulanır. Yuvarlama seçilebilir (kuruş, 0,50, tam lira, ,90). Uygulamadan önce önizleme gösterilir ve alış fiyatının altına düşen ürünler uyarılır.
- **Akıllı sipariş önerisi**: Son 30 günün satış hızına göre stoğun kaç gün yeteceği hesaplanır. 7 günden önce bitecek ürünler 30 günlük ihtiyaca tamamlanacak şekilde önerilir.
- **CSV ile toplu ürün yükleme**: Excel'den "CSV olarak kaydet" ile alınan dosya yüklenir; Türkçe başlıklar, "1.249,90" gibi sayılar ve Windows-1254 kodlaması tanınır. Önce önizleme gösterilir. Barkodu kayıtlı ürünler güncellenir, olmayanlar eklenir.
- **Raf/fiyat etiketi**: Barkodlu etiketler A4'e basılır. Geçerli barkodlar EAN-13, diğerleri Code 128 olarak çizilir. "Son N günde fiyatı değişenler" filtresi vardır.
- **Analiz raporları**: ölü stok (bağlı sermaye), ABC analizi, tedarikçi fiyat karşılaştırması (MF dahil).

**Satış ve müşteri (ek paket)**:
- **Sepeti beklet**: F8 ile sepet bekletilir, sonra geri alınır. Şubedeki tüm kasalar bekleyen sepetleri görür.
- **Bölünmüş ödeme**: Bir satış nakit + kart olarak ödenebilir. Kasa kapanışı iki kısmı ayrı sayar; iadede tutar aynı oranla nakit ve karta bölünür.
- **Sadakat puanı**: Varsayılan olarak 1 TL = 1 puan, 100 puan = 1 TL. Reçeteli ilaçlar ve SGK satışları puan kazandırmaz. İadede kazanılan puan geri alınır, harcanan puan geri yüklenir.
- **İlaç bitiş hatırlatması**: Kronik ilacı biten veya bitmek üzere olan müşteriler listelenir ve tek tıkla SMS/e-posta gönderilir. Aynı dönem için ikinci kez hatırlatma gitmez.
- **İstek/eksik defteri**: Stokta olmayan ürün not edilir. Ürün stoğa girince işaretlenir ve müşteriye haber verilir.
- **Emanet ilaç defteri**: Başka eczanelerle alınıp verilen ilaçlar takip edilir ve stok otomatik güncellenir. Eczane bazında açık borç/alacak gösterilir.
- **Reçete kaydı ve kontrollü ilaç defteri**: Satışa reçete no, renk, doktor ve hasta TC bağlanır. Kırmızı ve yeşil reçeteli ilaçlar bu bilgiler olmadan satılamaz. Kontrollü ilaç defteri raporu yürüyen bakiyeyle tutulur.
- **Hasta ilaç kullanım kartı**: POS'ta girilen kullanım talimatları, ilaçlar arası etkileşimler ve alerji notu yazdırılabilir bir kartta toplanır.
- **Toplu SMS**: Mesaj yalnızca ticari ileti onayı (İYS) olan müşterilere gider. Alıcı grupları seçilebilir (dermokozmetik alanlar, kronik ilaç kullananlar, 90 gündür gelmeyenler vb.).

**Yönetim (ek paket)**:
- **Satış analizi**: Gün × saat yoğunluk haritası (Türkiye saatiyle) ve aylık satış hedefi gösterilir. Hedefte yüzde, günlük gereken tutar ve ay sonu tahmini yer alır; hedef çubuğu ana sayfada da görünür.
- **Vardiya çizelgesi**: Hazır vardiyalar (sabah, öğle, akşam, 24 saat nöbet, izin, rapor) ve kişi başına haftalık toplam saat gösterilir. Önceki hafta tek tıkla kopyalanır; devir notları da buradadır.
- **Bildirim merkezi (🔔)**: Kritik stok, geçmiş/yaklaşan SKT, ilacı biten müşteri, gelen istek ürünü, geciken veresiye, kapatılmamış kasa, gelen transfer gibi işler tek panelde toplanır.
- **Otomatik günlük yedek**: Sunucu açıkken günde bir kez yedek alınır ve son 14 yedek saklanır. Admin bu yedekleri indirebilir.

**Hasta güvenliği ve kalite (v4)**:
- **Gebelik/emzirme ve yaş uyarıları**: Müşteri kartında doğum tarihi ve gebelik durumu, ilaç kartında gebelik uyarısı, en küçük kullanım yaşı ve "65+ dikkat" işareti. Kasada ciddi uyarıda satış öncesi onay istenir.
- **Muadil ilaç önerisi**: Stokta olmayan ürün için aynı etken maddeli, stoktaki ürünler listelenir ve tek tıkla sepete eklenir. Ürünlerin **raf konumu** kasada ve aramada görünür.
- **Kalite & Soğuk Zincir** sayfası: dolap sıcaklık defteri (2–8 °C dışı işaretlenir, 14 günlük grafik), **geri çağırma** (parti numarasıyla kime satıldığı + kalan stoğu çekme) ve **imha tutanağı** (stok düşümü + PDF).

**Kasa ve finans (v4)**:
- Gün içi **kasa giriş/çıkışları** (bozuk para, avans, ödeme) beklenen nakde yansır; **X raporu** kasayı kapatmadan saatlik ve personel kırılımlı ara rapor verir.
- **Tedarikçi cari hesabı**: faturalı mal kabul otomatik borç olur (vade = fatura tarihi + tedarikçi vade günü), ödemeler en eski vadeden kapatır; yaklaşan/geciken ödemeler listesi ve bildirim merkezi uyarısı. **Tedarikçi bazında alım raporu** (MF oranı dahil).
- **Kasiyer indirim limiti**: yöneticinin belirlediği yüzdenin üstünde sepet indirimi yapılamaz.

**Satış, müşteri ve stok (v4)**:
- Kasada **hızlı tuşlar** (sık satılan ürünler) ve **"+" ile hızlı müşteri kaydı**.
- **Müşteri segmentleri** (sadık, yeni, ara sıra, kaybedilmek üzere, kayıp) ve **doğum günü listesi** (ileti izni olanlara kutlama SMS'i).
- **Stok yaşlandırma raporu**, miadı yaklaşan reçetesiz ürünler için **tek tıkla indirim kampanyası önerisi**, tedarikçiye **PDF sipariş formu**.

**Kullanım (v4)**:
- **Ekran kilidi** (boşta kalınca veya Ctrl+Shift+L), **görünüm ayarları** (aydınlık/karanlık/sistem teması, yazı boyutu), sunucu bağlantısı koptuğunda uyarı bandı, `?` ile **klavye kısayolları** penceresi.
- Ana sayfada **ekip duyuru panosu**; yönetici için **Sistem Durumu** sayfası (sürüm, veritabanı boyutu, tablo kayıtları, son yedek); müşteri ve ürün listesi **CSV dışa aktarma**.
- Telefonda alttan **sekme çubuğu** ve kenardan açılan menü; PDF'ler Türkçe karakter destekli (DejaVu Sans).

**Güvenlik ve denetim**:
- Giriş denemesi sınırı: aynı IP + kullanıcı için 15 dakikada 5 hatalı deneme, ardından geçici kilit.
- Oturumlar SQLite'ta saklanır, sunucu yeniden başlasa da korunur. Girişte oturum kimliği yenilenir.
- Şifre kuralı: en az 8 karakter, en az bir harf ve bir rakam. Demo hesaplar ve yöneticinin oluşturduğu/sıfırladığı şifreler ilk girişte değiştirilmek zorundadır. Şifre değişince kullanıcının diğer oturumları kapatılır.
- İşlem kaydı (audit log): tüm veri değiştiren istekler kullanıcı, yöntem, kaynak ve sonuç koduyla kaydedilir; şifreler maskelenir. Admin, filtreleyip CSV olarak indirebilir.

**Muhasebe**:
- **Özet**: seçilen dönemde brüt hasılat, müşteri iadeleri, net hasılat, satılan malın maliyeti (stoğa dönen iadenin maliyeti düşülür), brüt/net kâr ve marj. Mal alımı (tedarik) giderleri maliyette zaten sayıldığı için net kâra ikinci kez yansıtılmaz, ayrıca gösterilir.
- **Alış tarafı**: alış faturaları, **alış iadeleri** (depoya iade / iade faturası; borçtan düşer, ödeme sayılmaz), tedarikçi ödemeleri, güncel ve vadesi geçmiş tedarikçi borcu, veresiye alacağı.
- **Günlük kazanç tablosu** ve **kasa raporu** (nakit/kart/SGK/veresiye, tahsilat, iade, kasa giriş-çıkış, beklenen nakit, kasa farkı). Hepsi CSV ve PDF olarak indirilir; mobilde Bugün/Hafta/Ay özeti vardır.

**İTS / karekod hareket defteri**:
- Satışta, mal kabulde ve iadede okutulan karekodların GTIN, seri no, parti ve SKT bilgisi kutu bazında kaydedilir.
- **Aynı kutu iki kez satılamaz**: seri no daha önce satıldıysa kasa uyarır ve satış reddedilir. Stokta görünen seri mal kabulde tekrar girilemez; iade edilen kutu yeniden satılabilir.
- Defter tarih/işlem/seri no ile süzülür, CSV/PDF indirilir; bir kutunun tüm geçmişi sorgulanabilir.
- **Stok eşitleme**: İTS ekranından indirilen stok listesi (CSV veya yapıştırma) sistem stoğuyla karşılaştırılır ("İTS fazla", "Sistem fazla", "Sistemde yok"); farklar CSV olarak iner.
- Bu modül İTS'ye **bildirim göndermez**; gerçek bildirim eczacının kendi İTS girişi veya resmî entegratör üzerinden yapılır.

**İlaç kartı, ilaç tespit ve TİTCK listesi**:
- **TİTCK resmî ilaç listesi** (SKRS e-reçete listesi, ~18 bin ürün: barkod, ATC kodu/adı, firma, reçete türü, aktif/pasif): `.xlsx` dosyası yüklenir ya da tek tıkla titck.gov.tr'den indirilir (yalnızca bu alan adı; internet gerektirir, isteğe bağlıdır). Yüklenince katalogdaki ürünlerin boş ATC kodu barkoddan dolar. Liste yedeğe alınmaz, yeniden indirilebilir. Dosya, harici paket kullanmayan küçük bir xlsx okuyucuyla açılır.
- **İlaç Kartı** (sekmeli): özet ve TİTCK durumu, fiyat hareketleri (İSF/DSF/PSF/KF/KÖ/Kİ tablosu ve grafiği), etkin madde/ATC, **eşdeğerler** (ATC koduna göre; katalogda olmayan TİTCK eşdeğerleri "Kataloğa ekle" ile), SUT/KÜB/KT notu ve bağlantıları, **hasta maliyeti** (fiyat farkı + katılım payı; oranlar varsayılan, tahminidir) ve tablet bilgisi formu.
- **İlaç Tespit**: üzerindeki yazı, şekil, renk (en fazla iki), ATC, endikasyon, çentik ve şeffaflığa göre ürün bulma (ilaç kartına girilen tablet bilgileriyle çalışır).
- **Kategori Gezgini**: ürün tipi, kategori ve marka/firma süzgeci, fiyat/stok sıralaması, "sadece stokta".
- TİTCK listesinden **tek tıkla ürün ekleme** (ad, firma, ATC ana grubu, reçete türü dolar) ve stokta duran **pasif ürün** uyarısı.
- Kamu fiyatı ve tablet bilgisi **CSV ile** toplu yüklenir (barkodla eşleşir, önizlemeli). Tablet görünümü, SUT maddeleri ve KÜB metinleri pakette hazır gelmez; eczane girer veya yükler.

**Hesaplamalar** (tarayıcıda çalışır, sunucuya veri gitmez): kiloya göre çocuk şurubu dozu (parasetamol, ibuprofen, amoksisilin hazır ayarları; mg ve ml, günlük üst sınır, yetişkin tek doz sınırı), kutu bitiş tarihi ("2x1", "3x5", "günde 2 kez 1"), şişe kaç gün yeter, VKİ ve vücut yüzey alanı (Mosteller), kreatinin klirensi (Cockcroft-Gault), mal fazlasıyla gerçek birim maliyet ve kâr marjı. Sonuçlar yardımcıdır; doz kararında KÜB ve eczacı değerlendirmesi esastır.

**Hasta Takibi**: müşteri başına tansiyon, kan şekeri (açlık/tok), nabız, ateş, SpO2, kilo ve kolesterol ölçümü girilir; son değerler renkli yorumla (normal / yüksek / acil), geçmiş grafik ve tabloyla gösterilir. Raporlu ilaçlar (tanı, ilaç, rapor no, bitiş tarihi) kaydedilir; 15 gün içinde biten raporlar bildirim zilinde çıkar. Müşteriler sayfasındaki "Takip" düğmesiyle doğrudan açılır.

**SUT / ICD-10** (SGK listeleri): SGK sitesindeki "Güncel 2013 SUT" zip dosyası tek tıkla indirilir ya da elle yüklenir (EK-4A .xlsx, EK-4D/EK-4F .doc, EK-4E .docx tek tek de olur; ek program gerekmez). ICD-10 kodu (I10, E11.9) veya hastalık adıyla arama: katılım payından muaf ilaçlar (EK-4/D) ve kataloğunuzdaki uygun ürünler listelenir. İlaç kartındaki "SUT / SGK / KÜB" sekmesinde: SGK ödeme listesinde mi (EK-4/A), kamu kurum iskontosu (DSF bandına göre), aynı eşdeğer gruptaki ürünler, muaf olduğu hastalıklar ve ICD kodları, antibiyotik reçeteleme kuralı (EK-4/E) ve rapor şartı (EK-4/F). Hasta Takibi'nde tanısı ICD koduyla başlayan raporlarda "Muafiyet" düğmesi bu aramayı açar. Eşleştirme etken madde ve ATC sınıfına göre yapılır (ATC için TİTCK listesinin yüklü olması önerilir); kesin karar için güncel SUT ve Medula esastır.

**Ürün satış hızı** (`GET /api/ilaclar/:id/analiz`: son 30 gün, 4 haftalık kırılım, stoğun kaç gün yeteceği; mobil ürün kartında gösterilir).

**Akıllı öneriler** (ana sayfa kartı ve `GET /api/oneriler`): son 30 günlük net satış hızından stoğun kaç gün yeteceğini, SKT'ye kadar satılamayacak fazla stoku (kademeli %10/20/30 indirim önerisiyle), satılmayan ölü stoku ve günün ciro/kâr özetini gösterir.

**Eczam Mobil** (`/mobil`): telefona kurulabilen (PWA) ikinci arayüz. Bugün/hafta/ay özeti ve şube karşılaştırması, ürün arama ve ürün kartı (parti, muadil, istek defteri), kamerayla barkod/karekod okuma (sorgu ve sayım modu), bildirim merkezi, soğuk zincir sıcaklık girişi, çevrimdışı açılış ve bekleyen işlem kuyruğu. Ayrıca **akıllı öneriler** (stok bitiş tahmini, SKT için indirim önerisi, ölü stok, gün sonu özeti), **muhasebe özeti** (Bugün/Hafta/Ay: net hasılat, kâr, alış ve borç), **hızlı satış** (sepet, barkod/kamera, nakit/kart/veresiye), **müşteri ve veresiye** (tahsilat), **siparişler** ve siparişten **mal kabul** (parti/SKT/fatura), **iade**, **görevler**, **günün kasası**, aylık **hedef** ilerlemesi ve SKT önerisinden tek dokunuşla **kampanya başlatma**. Arayüz **Türkçe ve İngilizce** (cihaz diline göre; Profil'den değiştirilir). App Store paketi ve yayın adımları: [`docs/APP_STORE_RELEASE.md`](../docs/APP_STORE_RELEASE.md). Gizlilik politikası sunucudan `/gizlilik.html` adresiyle yayınlanır.

## Kurulum

**Windows bilgisayara tek komutla kurulum, güncelleme kısayolu ve hata bildirimi:** [ana README → Eczam Programını Bilgisayara Kurma](../README.md#-eczam-programını-bilgisayara-kurma-windows).

Elle kurulum için Node.js 22.5 veya üstü gerekir (yerleşik `node:sqlite` modülü için).

```bash
cd web
npm install
npm start
```

Sunucu varsayılan olarak `http://localhost:3000` adresinde çalışır. Veritabanı ilk çalıştırmada `web/data/eczane.db` dosyasında otomatik oluşturulur ve örnek verilerle doldurulur.

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
| `ECZANEM_DB_PATH` | Veritabanı dosyası yolu (varsayılan `web/data/eczane.db`) |
| `COOKIE_SECURE`  | `1` ise oturum çerezi yalnızca HTTPS üzerinden gönderilir |
| `ECZANEM_SAAT_FARKI` | Saat bazlı analiz ve aylık hedef için UTC farkı (varsayılan `3`, Türkiye) |
| `ECZANEM_YEDEK_DIZINI` | Otomatik yedek klasörü (varsayılan `web/data/yedekler`) |
| `ECZANEM_YEDEK_SAKLA` | Saklanacak otomatik yedek sayısı (varsayılan `14`) |
| `ECZANEM_OTOMATIK_YEDEK` | `0` ise otomatik günlük yedek kapalı |
| `ECZANEM_HATA_GUNLUGU` | Hata günlüğü dosyası (varsayılan veritabanının yanında `hatalar.log`) |
| `ECZANEM_GIZLILIK_EPOSTA` | Gizlilik politikasında (`/gizlilik.html`) gösterilen iletişim e-postası (App Store için gerekli) |
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
- **Eczacı**: ilaç/stok/parti yönetimi, satış, iade, kampanya ve etkileşim kuralları, raporlar, muhasebe, İTS defteri, ilaç kartı düzenleme ve TİTCK listesi yükleme, müşteri/tedarikçi, bildirim.
- **Kasiyer**: satış (POS), veresiye tahsilatı, ilaç/stok görüntüleme, ilaç kartı ve ilaç tespit (salt okunur), müşteri/tedarikçi, bildirim. Raporlara, muhasebeye, İTS defterine, iadelere ve yönetim sayfalarına erişemez.

## Geliştirme

```bash
npm run dev   # node --watch ile otomatik yeniden başlatma
npm test      # node:test ile API testleri (her dosya kendi bellek içi veritabanını kullanır)
```
