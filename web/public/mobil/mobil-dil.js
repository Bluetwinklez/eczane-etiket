// Eczam Mobil — arayuz dili (Turkce / Ingilizce).
// Ekranlar Turkce yazilmistir; Ingilizce secildiginde DOM'a eklenen metinler sozluk ve kurallarla cevrilir.
// Sunucudan gelen icerik (urun adlari, musteri adlari) cevrilmez. Dil degisince sayfa yeniden yuklenir.
(() => {
  'use strict';
  const ANAHTAR = 'eczanem:dil';
  const DILLER = ['tr', 'en'];
  const oku = () => {
    try {
      const v = localStorage.getItem(ANAHTAR);
      if (DILLER.includes(v)) return v;
    } catch (e) {}
    return String(navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  };
  const dil = oku();
  document.documentElement.lang = dil;

  const SOZLUK = {
    // Gezinme ve basliklar
    'Özet': 'Summary', 'Satış': 'Sales', 'Tara': 'Scan', 'Ürünler': 'Products', 'Bildirim': 'Alerts', 'Bildirimler': 'Notifications',
    'Profil': 'Profile', 'Eczane Özeti': 'Pharmacy Summary', 'Stok & Satış': 'Stock & Sales', 'Ana gezinme': 'Main navigation',
    'Geri': 'Back', 'Eczam ana sayfa': 'Eczam home', 'Yükleniyor…': 'Loading…', 'Eczam Mobil': 'Eczam Mobile', 'Eczam Mobil 1.0': 'Eczam Mobile 1.0',
    'Eczam Mobil için JavaScript gerekir.': 'Eczam Mobile needs JavaScript.',
    // Giris
    'Eczanenizi cebinizden izleyin.': 'Keep an eye on your pharmacy from your pocket.', 'Kullanıcı adı': 'Username', 'Şifre': 'Password', 'Giriş Yap': 'Sign in',
    'Yeni şifre belirleyin': 'Set a new password', 'Mevcut şifre': 'Current password', 'Yeni şifre': 'New password', 'Şifreyi Değiştir': 'Change password',
    'Güvenliğiniz için devam etmeden şifrenizi değiştirmelisiniz (en az 8 karakter, harf ve rakam).': 'For your security you must change your password before continuing (at least 8 characters, letters and digits).',
    'Şifre değiştirildi': 'Password changed', 'Şifre değiştir': 'Change password', 'Şifremi değiştir': 'Change my password',
    'Kullanıcı adı veya şifre hatalı': 'Wrong username or password', 'Kullanıcı adı ve şifre gerekli': 'Username and password are required',
    'Mevcut şifre hatalı': 'Current password is wrong', 'Şifre hatalı': 'Wrong password', 'Yeni şifre mevcut şifreyle aynı olamaz': 'The new password cannot be the same as the current one',
    'Oturum sona erdi': 'Session expired', 'Sunucuya ulaşılamıyor': 'Cannot reach the server', 'Bir hata oluştu': 'Something went wrong',
    // Ozet
    'Bugün satışları hızlandıralım.': "Let's speed up today's sales.", 'Bugün': 'Today', 'Hafta': 'Week', 'Ay': 'Month',
    'Reçeteli': 'Prescription', 'İlaçlar': 'Medicines', 'Reçetesiz': 'Over-the-counter', 'Kritik stok': 'Low stock', 'ürün azaldı': 'products running low',
    'SKT uyarısı': 'Expiry alert', 'parti 30 gün içinde': 'batches within 30 days', 'Henüz satış yok': 'No sales yet', 'Hızlı işlemler': 'Quick actions',
    'Hızlı satış': 'Quick sale', 'Hızlı Satış': 'Quick Sale', 'Sepete ekle, sat': 'Add to cart, sell', 'Müşteriler': 'Customers', 'Veresiye, tahsilat': 'Credit & collections',
    'Mal kabul': 'Goods receipt', 'Mal Kabul': 'Goods Receipt', 'Gelen malı okut': 'Scan incoming goods', 'Siparişler': 'Orders', 'Durumları gör': 'See statuses',
    'Akıllı öneriler': 'Smart suggestions', 'Akıllı Öneriler': 'Smart Suggestions', 'Stok bitiş tahmini, SKT indirimi, gün sonu özeti': 'Stock-out forecast, expiry discounts, end-of-day summary',
    // Satis grafigi
    'Toplam satış': 'Total sales', 'Satış grafiği': 'Sales chart', 'Şubeler': 'Branches', 'Gün': 'Day',
    'Pzt': 'Mon', 'Sal': 'Tue', 'Çar': 'Wed', 'Per': 'Thu', 'Cum': 'Fri', 'Cmt': 'Sat', 'Paz': 'Sun',
    // Urunler / kart
    'Ürün, barkod veya etken madde ara': 'Search product, barcode or active ingredient', 'Ürün ara': 'Search products', 'Tümü': 'All', 'Kritik': 'Low', 'SKT yakın': 'Expiring', 'Stok': 'Stock', 'Fiyat': 'Price',
    'Raf': 'Shelf', 'Belirtilmemiş': 'Not set', 'Barkod': 'Barcode', 'Yeterli': 'OK', 'Stok yok': 'Out of stock', 'Reçete': 'Rx', 'Reçeteli ilaç': 'Prescription drug',
    'Gebelik/emzirme': 'Pregnancy/breastfeeding', 'Kontrendike': 'Contraindicated', 'Dikkatli kullanılmalı': 'Use with caution', 'Uyarı': 'Warning', 'Partiler': 'Batches', 'Partisiz': 'No batch',
    'Muadiller': 'Alternatives', 'İstek defterine ekle': 'Add to request book', 'Kapat': 'Close', 'Müşteri adı (istek defteri için):': 'Customer name (for the request book):', 'İstek defterine eklendi': 'Added to the request book',
    'Sayıma +1 ekle': 'Add +1 to count', 'Ürün bulunamadı': 'Product not found', 'Eşleşenler': 'Matches',
    // Tara
    'Sorgu': 'Lookup', 'Sayım': 'Count', 'Kamera hazırlanıyor…': 'Starting camera…', 'Barkodu çerçeveye getirin': 'Place the barcode in the frame',
    'Barkod yazın veya karekod yapıştırın': 'Type a barcode or paste a QR code', 'Ara': 'Search',
    'Bu cihazda kamera kullanılamıyor. Barkodu elle yazabilirsiniz.': 'The camera is not available on this device. You can type the barcode.',
    'Açık sayım yok. Yeni bir sayım başlatılsın mı?': 'There is no open stock count. Start a new one?', 'Mobil sayım': 'Mobile count',
    // Bildirim
    '❄️ Soğuk zincir ölçümü gir': '❄️ Log cold-chain temperature', 'Soğuk zincir ölçümü': 'Cold-chain reading', 'Dolap': 'Fridge', 'Buzdolabı': 'Refrigerator', 'Sıcaklık (°C)': 'Temperature (°C)',
    'Kabul edilen aralık 2–8 °C.': 'Accepted range is 2–8 °C.', 'Kaydet': 'Save', 'Her şey yolunda! Bekleyen uyarı yok.': 'All good! No pending alerts.',
    "SKT'si geçmiş parti": 'Expired batch', 'Elde stoğu olan, son kullanma tarihi geçmiş partiler; imha veya iade edin': 'Batches past their expiry date that are still in stock; destroy or return them',
    'Stoğu kritik sınırın altına düşen ürünler': 'Products below their critical stock level', '30 gün içinde SKT': 'Expires within 30 days',
    'Son kullanma tarihi yaklaşan partiler; önce bunları satın (FEFO)': 'Batches nearing expiry; sell these first (FEFO)', 'Soğuk zincir aralık dışı': 'Cold chain out of range',
    'Son 24 saatte 2-8 °C dışında ölçülen dolap sıcaklığı': 'Fridge temperature measured outside 2–8 °C in the last 24 hours', 'Bugün sıcaklık ölçülmedi': 'No temperature reading today',
    'Soğuk zincir dolabı için bugün kayıt girilmedi': 'No reading was entered today for the cold-chain fridge', 'Bugün doğum günü olan müşteri': 'Customer birthday today',
    'Kutlama mesajı gönderebilirsiniz (ileti izni olanlara)': 'You can send a greeting (to customers who opted in)', 'İlacı biten müşteri': 'Customer running out of medicine',
    '3 gün içinde bitecek/bitmiş kronik ilaçlar, henüz hatırlatılmadı': 'Chronic medicines ending within 3 days or already finished, not yet reminded', 'İstenen ürün geldi': 'Requested product arrived',
    'İstek defterindeki ürün stokta; müşteriye haber verin': 'A product from the request book is in stock; notify the customer', '30 günü geçen veresiye': 'Credit overdue by 30+ days',
    'Son tahsilattan (yoksa ilk borçtan) bu yana 30 günü geçen açık hesaplar': 'Open accounts more than 30 days past the last payment (or first debt)', 'Dünün kasası kapatılmadı': "Yesterday's till was not closed",
    'Dün satış yapıldı ama gün sonu kasa kapanışı yapılmadı': 'Sales were made yesterday but the end-of-day closing was not done', 'Açık devir notu': 'Open handover note',
    'Vardiya devir notlarında tamamlanmamış işler': 'Unfinished tasks in shift handover notes', 'Bugün nöbetçisiniz': 'You are on duty today', 'Nöbet takviminde bugün işaretli': 'Marked on the duty calendar for today',
    'Vadesi geçmiş fatura': 'Overdue invoice', 'Tedarikçi faturası ödeme günü geçti': 'Supplier invoice is past due', '7 gün içinde vadesi dolan fatura': 'Invoice due within 7 days', 'Yaklaşan tedarikçi ödemeleri': 'Upcoming supplier payments',
    'Teslim bekleyen transfer': 'Transfer awaiting delivery', 'Başka şubeden gönderilen, teslim alınmamış transferler': 'Transfers sent from another branch that were not received', 'Geciken sipariş': 'Late order',
    '3 gündür teslim alınmamış bekleyen/gönderilmiş siparişler': 'Pending/sent orders not received for 3 days', 'Açık emanet': 'Open deposit', 'Kapanmamış emanet ilaç kayıtları': 'Deposited-medicine records not yet closed',
    'Açık stok sayımı': 'Open stock count', 'Başlatılmış ama tamamlanmamış sayım': 'A count that was started but not completed',
    // Profil
    'Sunucuya bağlı': 'Connected to server', 'Sürüm': 'Version', 'Bekleyen kayıtlar': 'Pending entries', 'Bağlantı gelince gönderilir': 'Sent when back online', 'Bağlantı': 'Connection',
    'Bekleyenleri şimdi gönder': 'Send pending entries now', 'Gizlilik politikası': 'Privacy policy', 'Gizlilik politikasını oku': 'Read the privacy policy', 'Sunucuyu değiştir': 'Change server',
    'Bu cihazdaki sunucu bağlantısı kaldırılsın ve farklı bir eczane sunucusu seçilsin mi?': 'Remove the server connection on this device and choose a different pharmacy server?',
    'Çıkış yap': 'Sign out', 'Hesabım ve veri silme': 'My account & data deletion', 'Hesap ve veri silme': 'Account & data deletion', 'Dil': 'Language', 'Türkçe': 'Türkçe', 'English': 'English',
    'Eczam Mobil, hesabınızı eczanenizin yöneticisi yönetir. Hesabınızın ve kişisel verilerinizin silinmesi için eczane yöneticinize başvurun (Web uygulaması → Kullanıcılar). Yönetici hesabı siler; satış kayıtları yasal saklama süresi boyunca anonim biçimde tutulur.':
      "Your account is managed by your pharmacy administrator. To have your account and personal data deleted, contact your pharmacy administrator (web app → Users). The administrator deletes the account; sales records are kept anonymously for the legally required period.",
    // Kuyruk / toast
    'Bağlantı yok: kayıt sıraya alındı': 'No connection: entry queued', 'Sıraya alındı': 'Queued', 'Çevrimdışı': 'Offline',
    // Hizli satis
    'Ürün adı veya barkod': 'Product name or barcode', 'Kamerayı aç/kapat': 'Toggle camera', 'Ekle': 'Add', 'Azalt': 'Decrease', 'Artır': 'Increase',
    'Sepet boş. Ürün arayın ya da barkod okutun.': 'The cart is empty. Search for a product or scan a barcode.', 'Nakit': 'Cash', 'Kart': 'Card', 'Veresiye': 'On credit', 'Müşteri': 'Customer',
    'Perakende': 'Walk-in', 'Veresiye için müşteri seçin': 'Pick a customer for credit sales', 'Seç': 'Pick', 'Değiştir': 'Change', 'Tahmini toplam': 'Estimated total',
    'Kampanya ve indirimler satışta uygulanır': 'Campaigns and discounts are applied at checkout', 'Satışı tamamla': 'Complete sale', 'Sepeti boşalt': 'Empty cart',
    'Satış tamamlandı ✓': 'Sale completed ✓', 'Toplam': 'Total', 'Yeni satış': 'New sale', 'Reçeteli ürünler için bilgisayardaki satış ekranını kullanın.': 'For prescription items use the sales screen on the computer.',
    'Bu işlem için internet bağlantısı gerekir.': 'This action needs an internet connection.',
    // Musteriler
    'Müşteri ara': 'Search customers', 'Ad veya telefon ara': 'Search by name or phone', 'Ad veya telefon': 'Name or phone', 'Müşteri seç': 'Pick a customer', 'Müşteri bulunamadı': 'Customer not found',
    'Veresiye borcu': 'Credit balance', 'Toplam alacak': 'Total receivable', 'Puan': 'Points', 'Son hareketler': 'Recent activity', 'Borç': 'Debt', 'Tahsilat': 'Payment', 'Tahsilat al': 'Collect payment',
    'Bu müşteriye satış yap': 'Sell to this customer', 'Veresiye borcu olan müşteri yok 🎉': 'No customers with an outstanding balance 🎉', 'Geçerli bir tutar girin': 'Enter a valid amount', 'Telefon yok': 'No phone',
    // Siparisler
    'Açık': 'Open', 'Beklemede': 'Pending', 'Gönderildi': 'Sent', 'Teslim alındı': 'Received', 'İptal': 'Cancelled', 'Kısmi': 'Partial', 'Sipariş yok': 'No orders',
    'Mal kabul yap (teslim al)': 'Receive goods', 'Gönderildi olarak işaretle': 'Mark as sent', 'Gönderildi olarak işaretlendi': 'Marked as sent', 'Siparişlere git': 'Go to orders',
    'Bu ekran eczacı ve yöneticiler içindir.': 'This screen is for pharmacists and administrators.',
    // Mal kabul
    'Gelen ürünü barkodla okutun ya da arayın; adet, SKT ve parti girin.': 'Scan or search the incoming product; enter quantity, expiry and batch.', 'Henüz ürün eklenmedi.': 'No products added yet.',
    'Parti no': 'Batch no.', 'Son kullanma tarihi': 'Expiry date', 'Fatura no (isteğe bağlı)': 'Invoice no. (optional)', 'Vazgeç': 'Cancel', 'Stoğa girildi ✓': 'Added to stock ✓', 'Tamam': 'OK',
    'Sipariş': 'Order',
    'Bugünün özeti': "Today's summary", 'Stoğu bitiyor': 'Running out', 'SKT için öneri': 'Expiry suggestions', 'Ölü stok': 'Dead stock', 'Stoklar rahat görünüyor 👍': 'Stock levels look comfortable 👍',
    'Yaklaşan riskli parti yok': 'No risky batches coming up', 'Kampanya aktif': 'Campaign active', 'Kampanya başlatıldı': 'Campaign started', 'Bitti': 'Sold out', 'Yarın biter': 'Ends tomorrow', 'Süresi geçti': 'Expired', 'En çok satan:': 'Top seller:',
    // Gorevler, kasa, hedef
    'Sipariş taslağı': 'Draft order', 'Önce bir tedarikçi tanımlayın (bilgisayardan)': 'Add a supplier first (from the computer)', 'Akıllı öneriden oluşturuldu': 'Created from smart suggestions',
    'Satış hızı': 'Sales pace', 'Haftalık satış': 'Weekly sales', 'Son 4 hafta (eskiden yeniye)': 'Last 4 weeks (oldest to newest)', 'Sepete ekle': 'Add to cart',
    'İade': 'Refund', 'Satıştan iade al': 'Refund a sale', 'Son 7 günün satışları. İade edilecek satışı seçin.': "Sales from the last 7 days. Pick the sale to refund.", 'Son 7 günde satış yok': 'No sales in the last 7 days',
    'Karma': 'Mixed', 'Tamamı iade edilmiş': 'Fully refunded', 'Ürünleri stoğa geri al': 'Return items to stock', 'İade nedeni (isteğe bağlı)': 'Reason for refund (optional)', 'İade nedeni': 'Reason for refund',
    'İade tutarı': 'Refund amount', 'İadeyi tamamla': 'Complete refund',
    'Görevler': 'Tasks', 'Yapılacaklar listesi': 'To-do list', 'Günün kasası': "Today's till", 'Günün Kasası': "Today's Till", 'Nakit, kart, veresiye': 'Cash, card, credit',
    '+ Yeni görev': '+ New task', 'Yeni görev': 'New task', 'Başlık': 'Title', 'Not (isteğe bağlı)': 'Note (optional)', 'Öncelik': 'Priority', 'Yüksek': 'High', 'Orta': 'Medium', 'Düşük': 'Low',
    'Bekleyen görev yok 🎉': 'No pending tasks 🎉', 'Son tamamlananlar': 'Recently completed', 'Herkes': 'Everyone', 'Görev eklendi': 'Task added', 'Tamamla': 'Complete', 'Geri al': 'Undo',
    'Günün cirosu': "Today's revenue", 'Kasa kapatıldı ✓': 'Till closed ✓', 'Kasa henüz kapatılmadı': 'Till not closed yet', 'SGK': 'SGK (insurance)', 'Veresiye tahsilatı': 'Credit collections',
    'Nakit/kart toplamına dahil': 'Included in cash/card totals', 'İadeler': 'Refunds', 'Kasa kapanışı bilgisayardan yapılır.': 'Till closing is done from the computer.', 'Aylık hedef': 'Monthly target'
  };

  // Birlesik / degiskenli metinler icin kurallar: [desen, uretici]
  const KURALLAR = [
    [/^Merhaba (.+)!$/, (m) => `Hello ${m[1]}!`],
    [/^(.+) satış · toplam (.+)$/, (m) => `${m[1]} sales · total ${m[2]}`],
    [/^(.+) satış · tahmini kâr (.+?)(?: · (.+))?$/, (m) => `${m[1]} sales · est. profit ${m[2]}${m[3] ? ' · ' + m[3] : ''}`],
    [/^([+−])(.+) fazla, (dünden|önceki 7 günden|geçen ayın aynı gününden)$/, (m) => `${m[1]}${m[2]} more than ${KARSI[m[3]]}`],
    [/^([+−])(.+) az, (dünden|önceki 7 günden|geçen ayın aynı gününden)$/, (m) => `${m[1]}${m[2]} less than ${KARSI[m[3]]}`],
    [/^(▲|▼) %(\d+) dünden$/, (m) => `${m[1]} ${m[2]}% vs yesterday`],
    [/^(.+) (müşteri)$/, (m) => (/^\d+$/.test(m[1]) ? `${m[1]} ${m[1] === '1' ? 'customer' : 'customers'}` : null)],
    [/^(\d+) adet$/, (m) => `${m[1]} pcs`],
    [/^(\d+) kalem$/, (m) => `${m[1]} ${m[1] === '1' ? 'item' : 'items'}`],
    [/^(\d+) puan$/, (m) => `${m[1]} pts`],
    [/^Stok (\d+)$/, (m) => `Stock ${m[1]}`],
    [/^stok (\d+)$/, (m) => `stock ${m[1]}`],
    [/^günde ~([\d.,]+)$/, (m) => `~${m[1]}/day`],
    [/^önerilen sipariş (\d+)$/, (m) => `suggested order ${m[1]}`],
    [/^Stoğu bitiyor \((\d+)\)$/, (m) => `Running out (${m[1]})`],
    [/^Yakında · (\d+) gün$/, (m) => `Soon · ${m[1]} days`],
    [/^Parti ([^·]+?)$/, (m) => `Batch ${m[1]}`],
    [/^SKT ([^·]+?)$/, (m) => `Exp ${m[1]}`],
    [/^SKT'ye \((\d+) gün\) kadar satılamayabilir$/, (m) => `may not sell within ${m[1]} days of expiry`],
    [/^(\d+) adet (\d+) gün içinde satılamayabilir$/, (m) => `${m[1]} pcs may not sell within ${m[2]} days`],
    [/^olası zarar (.+)$/, (m) => `possible loss ${m[1]}`],
    [/^Kampanya başlat · %(\d+)$/, (m) => `Start campaign · ${m[1]}% off`],
    [/^(.+): %(\d+) indirim kampanyası (.+) tarihine kadar başlatılsın mı\?$/, (m) => `Start a ${m[2]}% discount campaign for ${m[1]} until ${m[3]}?`],
    [/^%(\d+) indirim$/, (m) => `${m[1]}% off`],
    [/^(\d+) ürün (\d+) gündür satılmadı\. Bağlı sermaye: (.+)$/, (m) => `${m[1]} products have not sold for ${m[2]} days. Capital tied up: ${m[3]}`],
    [/^(\d+) gündür bekliyor$/, (m) => `waiting ${m[1]} days`],
    [/^Sipariş #(\d+)$/, (m) => `Order #${m[1]}`],
    [/^Sipariş #(\d+) teslim alınıyor\. Gelen adetleri kontrol edin\.$/, (m) => `Receiving order #${m[1]}. Check the quantities that arrived.`],
    [/^Mal kabul #(\d+) kaydedildi\. (\d+) adet stoğa eklendi\.$/, (m) => `Goods receipt #${m[1]} saved. ${m[2]} pcs added to stock.`],
    [/^Stoğa gir \((\d+) ürün · (\d+) adet\)$/, (m) => `Add to stock (${m[1]} ${m[1] === '1' ? 'product' : 'products'} · ${m[2]} pcs)`],
    [/^Fiş no #(\d+)$/, (m) => `Receipt #${m[1]}`],
    [/^Son 30 günde (\d+) adet$/, (m) => `${m[1]} pcs in the last 30 days`],
    [/^günde ~([\d.,]+) adet(?: · stok ~(\d+) gün yeter| · satış yok)?$/, (m) => `~${m[1]}/day${m[2] ? ` · stock lasts ~${m[2]} days` : ' · no sales'}`],
    [/^(.+) eklendi · sepette (\d+) ürün$/, (m) => `${m[1]} added · ${m[2]} in cart`],
    [/^Siparişe çevir \((\d+) ürün\)$/, (m) => `Turn into an order (${m[1]} ${m[1] === '1' ? 'product' : 'products'})`],
    [/^(\d+) ürün önerilen adetlerle siparişe eklenecek\. Tedarikçiyi seçin:$/, (m) => `${m[1]} products will be added to the order with the suggested quantities. Pick the supplier:`],
    [/^Sipariş #(\d+) oluşturuldu$/, (m) => `Order #${m[1]} created`],
    [/^Satış #(\d+) iadesi$/, (m) => `Refund for sale #${m[1]}`],
    [/^(.+) × (\d+) iade edilebilir$/, (m) => `${m[1]} × ${m[2]} refundable`],
    [/^İade tamamlandı: (.+)$/, (m) => `Refund completed: ${m[1]}`],
    [/^Satış #(\d+)$/, (m) => `Sale #${m[1]}`],
    [/^(.+) eklendi$/, (m) => `${m[1]} added`],
    [/^(.+): stokta yok görünüyor$/, (m) => `${m[1]}: appears to be out of stock`],
    [/^Tahsil edildi\. Kalan borç: (.+)$/, (m) => `Collected. Remaining balance: ${m[1]}`],
    [/^Tahsil edilen tutar \(borç: (.+)\):$/, (m) => `Amount collected (balance: ${m[1]}):`],
    [/^(\d+) bekleyen kayıt gönderildi$/, (m) => `${m[1]} pending entries sent`],
    [/^Sayım #(\d+) açık\. Okuttuğunuz her ürün \+1 sayılır\. Bitirmek için bilgisayardan "Sayımı tamamla"\.$/, (m) => `Count #${m[1]} is open. Each product you scan adds +1. Finish it from the computer with "Complete count".`],
    [/^(.+): sayılan (.+)$/, (m) => `${m[1]}: counted ${m[2]}`],
    [/^Çevrimdışı: (.+) tarihli kayıt gösteriliyor\.$/, (m) => `Offline: showing the record from ${m[1]}.`],
    [/^Çok fazla başarısız deneme\. (\d+) dakika sonra tekrar deneyin\.$/, (m) => `Too many failed attempts. Try again in ${m[1]} minutes.`],
    [/^Kronik: (.+)$/, (m) => `Chronic: ${m[1]}`],
    [/^Alerji: (.+)$/, (m) => `Allergy: ${m[1]}`],
    [/^Kamera açılamadı \((izin verilmedi|.+)\)\. Barkodu elle yazabilirsiniz\.$/, (m) => `Could not open the camera (${m[1] === 'izin verilmedi' ? 'permission denied' : m[1]}). You can type the barcode.`],
    [/^(.+) \/ (.+?)(?: · günde (.+) gerekli)?$/, (m) => (/₺/.test(m[1]) ? `${m[1]} / ${m[2]}${m[3] ? ` · ${m[3]}/day needed` : ''}` : null)],
    [/^\((\d+) adet\)$/, (m) => `(${m[1]} pcs)`],
    [/^(Pzt|Sal|Çar|Per|Cum|Cmt|Paz): (.+)$/, (m) => `${SOZLUK[m[1]]}: ${m[2]}`]
  ];
  const KARSI = { dünden: 'yesterday', 'önceki 7 günden': 'the previous 7 days', 'geçen ayın aynı gününden': 'the same day last month' };

  function cevirParca(parca) {
    const duz = parca.trim();
    if (!duz) return parca;
    let sonuc = SOZLUK[duz];
    if (sonuc === undefined) {
      for (const [desen, uret] of KURALLAR) {
        const m = duz.match(desen);
        if (m) {
          const r = uret(m);
          if (r) {
            sonuc = r;
            break;
          }
        }
      }
    }
    if (sonuc === undefined) return parca;
    return parca.replace(duz, sonuc);
  }

  // " · " ile ayrilan birlesik metinleri parca parca cevirir; tam eslesme once denenir
  function cevirMetin(metin) {
    if (dil === 'tr' || !metin) return metin;
    const tam = cevirParca(metin);
    if (tam !== metin) return tam;
    if (metin.includes(' · ')) {
      const parcalar = metin.split(' · ');
      const cevrilen = parcalar.map(cevirParca);
      if (cevrilen.some((p, i) => p !== parcalar[i])) return cevrilen.join(' · ');
    }
    return metin;
  }

  const ATTR = ['placeholder', 'aria-label', 'title', 'alt'];
  function dugumCevir(n) {
    if (n.nodeType === 3) {
      const y = cevirMetin(n.nodeValue);
      if (y !== n.nodeValue) n.nodeValue = y;
    } else if (n.nodeType === 1) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
      for (const a of ATTR) {
        const v = n.getAttribute(a);
        if (v) {
          const y = cevirMetin(v);
          if (y !== v) n.setAttribute(a, y);
        }
      }
      n.childNodes.forEach(dugumCevir);
    }
  }

  const dilApi = {
    dil,
    yerel: dil === 'tr' ? 'tr-TR' : 'en-US',
    t: cevirMetin,
    ayarla(yeni) {
      if (!DILLER.includes(yeni)) return;
      try {
        localStorage.setItem(ANAHTAR, yeni);
      } catch (e) {}
      location.reload();
    },
    // Testler icin
    _sozluk: SOZLUK,
    _kurallar: KURALLAR
  };
  window.EczamDil = dilApi;
  if (typeof module !== 'undefined') module.exports = dilApi;

  if (dil !== 'tr') {
    // JS penceresi metinleri (confirm/prompt/alert) de cevrilir
    for (const ad of ['confirm', 'prompt', 'alert']) {
      const asil = window[ad].bind(window);
      window[ad] = (m, ...r) => asil(cevirMetin(String(m)), ...r);
    }
    const gozlemci = new MutationObserver((kayitlar) => {
      for (const k of kayitlar) {
        if (k.type === 'characterData') dugumCevir(k.target);
        else if (k.type === 'attributes') dugumCevir(k.target);
        else k.addedNodes.forEach(dugumCevir);
      }
    });
    const baslat = () => {
      dugumCevir(document.body);
      gozlemci.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    };
    if (document.body) baslat();
    else document.addEventListener('DOMContentLoaded', baslat);
  }
})();
