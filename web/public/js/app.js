// Menu gruplara ayrilir; grup basliklari yalnizca gorunur ogesi olan gruplar icin cizilir
const NAV = [
  { key: 'anasayfa', label: 'Ana Sayfa', grup: '' },
  { key: 'satis', label: 'Satış (POS)', grup: 'Satış' },
  { key: 'iadeler', label: 'Satış İadeleri', grup: 'Satış', roles: ['admin', 'eczaci'] },
  { key: 'kasa-kapanisi', label: 'Kasa Kapanışı', grup: 'Satış' },
  { key: 'kampanyalar', label: 'Kampanyalar', grup: 'Satış' },
  { key: 'veresiye', label: 'Veresiye Defteri', grup: 'Satış' },
  { key: 'ilaclar', label: 'İlaçlar', grup: 'Stok' },
  { key: 'stok', label: 'Stok Hareketleri', grup: 'Stok' },
  { key: 'mal-kabul', label: 'Mal Kabul', grup: 'Stok', roles: ['admin', 'eczaci'] },
  { key: 'siparisler', label: 'Siparişler', grup: 'Stok', roles: ['admin', 'eczaci'] },
  { key: 'tedarikciler', label: 'Tedarikçiler', grup: 'Stok' },
  { key: 'sayim', label: 'Stok Sayımı', grup: 'Stok', roles: ['admin', 'eczaci'] },
  { key: 'transferler', label: 'Şube Transferleri', grup: 'Stok', roles: ['admin', 'eczaci'] },
  { key: 'etiketler', label: 'Raf Etiketleri', grup: 'Stok' },
  { key: 'musteriler', label: 'Müşteriler', grup: 'Müşteri & Eczacılık' },
  { key: 'hatirlatmalar', label: 'İlaç Hatırlatmaları', grup: 'Müşteri & Eczacılık' },
  { key: 'istekler', label: 'İstek / Eksik Defteri', grup: 'Müşteri & Eczacılık' },
  { key: 'emanetler', label: 'Emanet Defteri', grup: 'Müşteri & Eczacılık', roles: ['admin', 'eczaci'] },
  { key: 'etkilesimler', label: 'İlaç Etkileşimleri', grup: 'Müşteri & Eczacılık' },
  { key: 'bildirimler', label: 'Bildirimler / SMS', grup: 'Müşteri & Eczacılık' },
  { key: 'raporlar', label: 'Raporlar', grup: 'Rapor', roles: ['admin', 'eczaci'] },
  { key: 'analiz', label: 'Satış Analizi & Hedef', grup: 'Rapor' },
  { key: 'giderler', label: 'Giderler', grup: 'Rapor', roles: ['admin', 'eczaci'] },
  { key: 'gorevler', label: 'Görevler', grup: 'Ekip' },
  { key: 'vardiya', label: 'Vardiya Çizelgesi', grup: 'Ekip' },
  { key: 'nobetler', label: 'Nöbetçi Takvimi', grup: 'Ekip' },
  { key: 'kullanicilar', label: 'Kullanıcılar', grup: 'Yönetim', roles: ['admin'] },
  { key: 'subeler', label: 'Şubeler', grup: 'Yönetim', roles: ['admin'] },
  { key: 'yedekleme', label: 'Yedekleme', grup: 'Yönetim', roles: ['admin'] },
  { key: 'islem-kaydi', label: 'İşlem Kaydı', grup: 'Yönetim', roles: ['admin'] }
];

const TITLES = {
  anasayfa: 'Ana Sayfa',
  ilaclar: 'İlaçlar',
  stok: 'Stok Hareketleri',
  sayim: 'Stok Sayımı',
  transferler: 'Şubeler Arası Transfer',
  etiketler: 'Raf / Fiyat Etiketleri',
  satis: 'Satış (POS)',
  iadeler: 'Satış İadeleri',
  musteriler: 'Müşteriler',
  hatirlatmalar: 'İlaç Bitiş Hatırlatmaları',
  istekler: 'İstek / Eksik Defteri',
  emanetler: 'Emanet İlaç Defteri',
  tedarikciler: 'Tedarikçiler',
  siparisler: 'Siparişler',
  'mal-kabul': 'Mal Kabul (İrsaliye / Fatura)',
  raporlar: 'Raporlar',
  analiz: 'Satış Analizi ve Hedef',
  'kasa-kapanisi': 'Kasa Kapanışı',
  giderler: 'Giderler',
  kampanyalar: 'Kampanyalar',
  veresiye: 'Veresiye Defteri',
  etkilesimler: 'İlaç Etkileşimleri',
  gorevler: 'Görevler',
  nobetler: 'Nöbetçi Takvimi',
  vardiya: 'Personel Vardiya Çizelgesi',
  bildirimler: 'Bildirimler',
  kullanicilar: 'Kullanıcılar',
  subeler: 'Şubeler',
  yedekleme: 'Yedekleme',
  'islem-kaydi': 'İşlem Kaydı'
};

let CURRENT_USER = null;

function menuIcinRolUygunMu(item) {
  return !item.roles || item.roles.includes(CURRENT_USER.rol);
}

function navOlustur() {
  const nav = document.getElementById('nav');
  let sonGrup = null;
  nav.innerHTML = NAV.filter(menuIcinRolUygunMu)
    .map((item) => {
      const baslik = item.grup && item.grup !== sonGrup ? `<div class="nav-grup">${item.grup}</div>` : '';
      sonGrup = item.grup;
      return `${baslik}<a href="#${item.key}" data-key="${item.key}">${Ikon.svg(item.key)}<span>${item.label}</span></a>`;
    })
    .join('');
}

function aktifLinkiGuncelle(key) {
  let hedef = null;
  document.querySelectorAll('#nav a').forEach((a) => {
    const aktif = a.dataset.key === key;
    if (aktif && !a.classList.contains('active')) {
      // Ikon "ziplama" animasyonu yalnizca yeni secilen ogede bir kez oynar
      a.classList.remove('yeni-aktif');
      void a.offsetWidth;
      a.classList.add('yeni-aktif');
    }
    a.classList.toggle('active', aktif);
    if (aktif) hedef = a;
  });
  if (hedef) gostergeyiTasi(hedef, true);
}

// Secili ogeyi isaretleyen hapi tasir: once eski ve yeni ogeyi kapsayacak
// kadar uzar ("uzat"), sonra yeni ogenin ustune yaylanarak oturur ("otur").
let gostergeZamanlayici = null;
function gostergeyiTasi(hedef, animasyonlu) {
  const nav = document.getElementById('nav');
  let gosterge = nav.querySelector('.nav-gosterge');
  if (!gosterge) {
    gosterge = document.createElement('div');
    gosterge.className = 'nav-gosterge';
    gosterge.setAttribute('aria-hidden', 'true');
    nav.prepend(gosterge);
  }
  if (getComputedStyle(gosterge).display === 'none') return; // mobil yerlesim
  const ust = hedef.offsetTop, boy = hedef.offsetHeight;
  const eskiUst = parseFloat(gosterge.style.top), eskiBoy = parseFloat(gosterge.style.height);
  clearTimeout(gostergeZamanlayici);

  if (!animasyonlu || !eskiBoy || eskiUst === ust) {
    delete gosterge.dataset.faz;
    gosterge.style.top = ust + 'px';
    gosterge.style.height = boy + 'px';
  } else {
    const bas = Math.min(eskiUst, ust);
    const son = Math.max(eskiUst + eskiBoy, ust + boy);
    gosterge.dataset.faz = 'uzat';
    gosterge.style.top = bas + 'px';
    gosterge.style.height = son - bas + 'px';
    gostergeZamanlayici = setTimeout(() => {
      gosterge.dataset.faz = 'otur';
      gosterge.style.top = ust + 'px';
      gosterge.style.height = boy + 'px';
    }, 150);
  }
  const navKutu = nav.getBoundingClientRect(), ogeKutu = hedef.getBoundingClientRect();
  if (ogeKutu.top < navKutu.top || ogeKutu.bottom > navKutu.bottom) hedef.scrollIntoView({ block: 'nearest' });
}

function gostergeyiYenile() {
  const aktif = document.querySelector('#nav a.active');
  if (aktif) gostergeyiTasi(aktif, false);
}

const VIEW_MAP = {
  anasayfa: AnaSayfaView,
  ilaclar: () => Views.ilaclar,
  stok: () => Views.stok,
  sayim: () => Views.sayim,
  transferler: () => Views.transferler,
  etiketler: () => Views.etiketler,
  satis: () => Views.satis,
  iadeler: () => Views.iadeler,
  musteriler: () => Views.musteriler,
  hatirlatmalar: () => Views.hatirlatmalar,
  istekler: () => Views.istekler,
  emanetler: () => Views.emanetler,
  tedarikciler: () => Views.tedarikciler,
  siparisler: () => Views.siparisler,
  'mal-kabul': () => Views.malKabul,
  raporlar: () => Views.raporlar,
  analiz: () => Views.analiz,
  'kasa-kapanisi': () => Views.kasaKapanisi,
  giderler: () => Views.giderler,
  kampanyalar: () => Views.kampanyalar,
  veresiye: () => Views.veresiye,
  etkilesimler: () => Views.etkilesimler,
  gorevler: () => Views.gorevler,
  nobetler: () => Views.nobetler,
  vardiya: () => Views.vardiya,
  bildirimler: () => Views.bildirimler,
  kullanicilar: () => Views.kullanicilar,
  subeler: () => Views.subeler,
  yedekleme: () => Views.yedekleme,
  'islem-kaydi': () => Views.islemKaydi
};

async function rotayiRenderEt() {
  let key = (location.hash || '#anasayfa').slice(1);
  const navItem = NAV.find((n) => n.key === key);
  if (!navItem || !menuIcinRolUygunMu(navItem)) {
    key = 'anasayfa';
  }

  aktifLinkiGuncelle(key);
  document.getElementById('page-title').textContent = TITLES[key] || '';

  const content = document.getElementById('content');
  const view = typeof VIEW_MAP[key] === 'function' ? VIEW_MAP[key]() : VIEW_MAP[key];
  if (!view) {
    content.innerHTML = '<div class="empty-state">Bu sayfa henüz hazır değil.</div>';
    return;
  }
  try {
    await view.render(content, { user: CURRENT_USER });
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Hata: ${UI.esc(err.message)}</div>`;
  }
}

async function init() {
  try {
    const { user } = await Api.get('/api/auth/me');
    if (user.sifre_degistirilmeli) {
      window.location.href = 'login.html';
      return;
    }
    CURRENT_USER = user;
  } catch (e) {
    return; // Api.get zaten login sayfasina yonlendirir
  }

  document.getElementById('user-name').textContent = CURRENT_USER.ad_soyad;
  document.getElementById('user-rol').textContent = CURRENT_USER.rol;
  document.getElementById('user-avatar').textContent = AnaSayfaView.basHarfler(CURRENT_USER.ad_soyad);
  document.getElementById('logo-yer').innerHTML = Ikon.logo();
  document.getElementById('cp-ikon').innerHTML = Ikon.svg('ara');
  document.getElementById('zil-ikon').innerHTML = Ikon.svg('zil');
  navOlustur();

  // Kullanici menusu (tema, sifre, cikis): disari tiklayinca ve sayfa degisince kapanir
  const kullaniciBtn = document.getElementById('kullanici-btn');
  const kullaniciMenu = document.getElementById('kullanici-menu');
  const menuKapat = () => {
    kullaniciMenu.hidden = true;
    kullaniciBtn.setAttribute('aria-expanded', 'false');
  };
  kullaniciBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    kullaniciMenu.hidden = !kullaniciMenu.hidden;
    kullaniciBtn.setAttribute('aria-expanded', String(!kullaniciMenu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!kullaniciMenu.hidden && !kullaniciMenu.contains(e.target)) menuKapat();
  });
  window.addEventListener('hashchange', menuKapat);

  const temaBtn = document.getElementById('tema-btn');
  const temaButonMetniGuncelle = () => {
    temaBtn.innerHTML = UI.temaAktifMi() ? `${Ikon.svg('gunes')} Aydınlık Tema` : `${Ikon.svg('ay')} Karanlık Tema`;
  };
  temaButonMetniGuncelle();
  temaBtn.addEventListener('click', () => {
    UI.temaDegistir();
    temaButonMetniGuncelle();
  });
  document.getElementById('sifre-btn').insertAdjacentHTML('afterbegin', Ikon.svg('anahtar') + ' ');
  document.getElementById('logout-btn').insertAdjacentHTML('afterbegin', Ikon.svg('cikis') + ' ');

  document.getElementById('cp-ac-btn').addEventListener('click', () => CommandPalette.ac());

  document.getElementById('sifre-btn').addEventListener('click', () => {
    menuKapat();
    const modal = UI.openModal(`
      <h3>Şifremi Değiştir</h3>
      <form id="sifre-degistir-form">
        <div><label>Mevcut şifre</label><input name="mevcut" type="password" autocomplete="current-password" required /></div>
        <div style="margin-top:10px"><label>Yeni şifre</label><input name="yeni" type="password" autocomplete="new-password" minlength="8" required /></div>
        <div style="margin-top:10px"><label>Yeni şifre (tekrar)</label><input name="yeni2" type="password" autocomplete="new-password" minlength="8" required /></div>
        <p class="sifre-kural">En az 8 karakter, en az bir harf ve bir rakam. Diğer cihazlardaki oturumlarınız kapatılır.</p>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Değiştir</button>
        </div>
      </form>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#sifre-degistir-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get('yeni') !== fd.get('yeni2')) {
        UI.toast('Yeni şifreler eşleşmiyor', 'error');
        return;
      }
      try {
        await Api.post('/api/auth/sifre-degistir', { mevcut_sifre: fd.get('mevcut'), yeni_sifre: fd.get('yeni') });
        UI.toast('Şifreniz değiştirildi', 'success');
        UI.closeModal(modal);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.post('/api/auth/logout');
    window.location.href = 'login.html';
  });

  window.addEventListener('hashchange', rotayiRenderEt);
  // Yazi tipi yuklenince veya pencere boyutu degisince oge yukseklikleri degisebilir
  window.addEventListener('resize', gostergeyiYenile);
  if (document.fonts) document.fonts.ready.then(gostergeyiYenile);
  BildirimMerkezi.baslat();
  rotayiRenderEt();
}

init();
