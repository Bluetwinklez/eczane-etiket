const NAV = [
  { key: 'anasayfa', label: 'Ana Sayfa' },
  { key: 'ilaclar', label: 'İlaçlar' },
  { key: 'stok', label: 'Stok Hareketleri' },
  { key: 'satis', label: 'Satış (POS)' },
  { key: 'musteriler', label: 'Müşteriler' },
  { key: 'tedarikciler', label: 'Tedarikçiler' },
  { key: 'raporlar', label: 'Raporlar', roles: ['admin', 'eczaci'] },
  { key: 'bildirimler', label: 'Bildirimler' },
  { key: 'kullanicilar', label: 'Kullanıcılar', roles: ['admin'] },
  { key: 'subeler', label: 'Şubeler', roles: ['admin'] },
  { key: 'yedekleme', label: 'Yedekleme', roles: ['admin'] }
];

const TITLES = {
  anasayfa: 'Ana Sayfa',
  ilaclar: 'İlaçlar',
  stok: 'Stok Hareketleri',
  satis: 'Satış (POS)',
  musteriler: 'Müşteriler',
  tedarikciler: 'Tedarikçiler',
  raporlar: 'Raporlar',
  bildirimler: 'Bildirimler',
  kullanicilar: 'Kullanıcılar',
  subeler: 'Şubeler',
  yedekleme: 'Yedekleme'
};

let CURRENT_USER = null;

const AnaSayfaView = {
  async render(container) {
    container.innerHTML = '<div class="empty-state">Yükleniyor...</div>';
    const [uyarilar, satislarBugun] = await Promise.all([
      Api.get('/api/ilaclar/uyarilar'),
      Api.get('/api/satislar?baslangic=' + new Date().toISOString().slice(0, 10))
    ]);

    const bugunkuCiro = satislarBugun.reduce((sum, s) => sum + s.toplam_tutar, 0);

    container.innerHTML = `
      <div class="stat-row">
        <div class="stat-tile">
          <div class="label">Bugünkü Satış Adedi</div>
          <div class="value">${satislarBugun.length}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Bugünkü Ciro</div>
          <div class="value">${UI.tl(bugunkuCiro)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Kritik Stok</div>
          <div class="value">${uyarilar.kritik_stok.length}</div>
        </div>
        <div class="stat-tile">
          <div class="label">SKT Uyarısı</div>
          <div class="value">${uyarilar.skt_yaklasan.length}</div>
        </div>
      </div>
      <div class="card">
        <h3>Hoş geldiniz, ${UI.esc(CURRENT_USER.ad_soyad)}</h3>
        <p>Sol menüden ilaç/stok yönetimi, satış (POS), raporlar ve diğer modüllere ulaşabilirsiniz.</p>
      </div>
    `;
  }
};

function menuIcinRolUygunMu(item) {
  return !item.roles || item.roles.includes(CURRENT_USER.rol);
}

function navOlustur() {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.filter(menuIcinRolUygunMu)
    .map((item) => `<a href="#${item.key}" data-key="${item.key}">${item.label}</a>`)
    .join('');
}

function aktifLinkiGuncelle(key) {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.key === key);
  });
}

const VIEW_MAP = {
  anasayfa: AnaSayfaView,
  ilaclar: () => Views.ilaclar,
  stok: () => Views.stok,
  satis: () => Views.satis,
  musteriler: () => Views.musteriler,
  tedarikciler: () => Views.tedarikciler,
  raporlar: () => Views.raporlar,
  bildirimler: () => Views.bildirimler,
  kullanicilar: () => Views.kullanicilar,
  subeler: () => Views.subeler,
  yedekleme: () => Views.yedekleme
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
    CURRENT_USER = user;
  } catch (e) {
    return; // Api.get zaten login sayfasina yonlendirir
  }

  document.getElementById('user-name').textContent = CURRENT_USER.ad_soyad;
  document.getElementById('user-rol').textContent = CURRENT_USER.rol;
  navOlustur();

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.post('/api/auth/logout');
    window.location.href = 'login.html';
  });

  window.addEventListener('hashchange', rotayiRenderEt);
  rotayiRenderEt();
}

init();
