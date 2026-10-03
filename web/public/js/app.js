const NAV = [
  { key: 'anasayfa', label: 'Ana Sayfa' },
  { key: 'ilaclar', label: 'İlaçlar' },
  { key: 'stok', label: 'Stok Hareketleri' },
  { key: 'satis', label: 'Satış (POS)' },
  { key: 'iadeler', label: 'Satış İadeleri', roles: ['admin', 'eczaci'] },
  { key: 'musteriler', label: 'Müşteriler' },
  { key: 'tedarikciler', label: 'Tedarikçiler' },
  { key: 'siparisler', label: 'Siparişler', roles: ['admin', 'eczaci'] },
  { key: 'raporlar', label: 'Raporlar', roles: ['admin', 'eczaci'] },
  { key: 'kasa-kapanisi', label: 'Kasa Kapanışı' },
  { key: 'giderler', label: 'Giderler', roles: ['admin', 'eczaci'] },
  { key: 'kampanyalar', label: 'Kampanyalar' },
  { key: 'veresiye', label: 'Veresiye Defteri' },
  { key: 'etkilesimler', label: 'İlaç Etkileşimleri' },
  { key: 'gorevler', label: 'Görevler' },
  { key: 'nobetler', label: 'Nöbetçi Takvimi' },
  { key: 'bildirimler', label: 'Bildirimler' },
  { key: 'kullanicilar', label: 'Kullanıcılar', roles: ['admin'] },
  { key: 'subeler', label: 'Şubeler', roles: ['admin'] },
  { key: 'yedekleme', label: 'Yedekleme', roles: ['admin'] },
  { key: 'islem-kaydi', label: 'İşlem Kaydı', roles: ['admin'] }
];

const TITLES = {
  anasayfa: 'Ana Sayfa',
  ilaclar: 'İlaçlar',
  stok: 'Stok Hareketleri',
  satis: 'Satış (POS)',
  iadeler: 'Satış İadeleri',
  musteriler: 'Müşteriler',
  tedarikciler: 'Tedarikçiler',
  siparisler: 'Siparişler',
  raporlar: 'Raporlar',
  'kasa-kapanisi': 'Kasa Kapanışı',
  giderler: 'Giderler',
  kampanyalar: 'Kampanyalar',
  veresiye: 'Veresiye Defteri',
  etkilesimler: 'İlaç Etkileşimleri',
  gorevler: 'Görevler',
  nobetler: 'Nöbetçi Takvimi',
  bildirimler: 'Bildirimler',
  kullanicilar: 'Kullanıcılar',
  subeler: 'Şubeler',
  yedekleme: 'Yedekleme',
  'islem-kaydi': 'İşlem Kaydı'
};

let CURRENT_USER = null;

function gunStr(tarih) {
  return tarih.toISOString().slice(0, 10);
}

function satisTrendSvg(gunlukVeri) {
  const genislik = 640;
  const yukseklik = 140;
  const altBosluk = 22;
  const maxTutar = Math.max(1, ...gunlukVeri.map((g) => g.toplam));
  const barGenislik = genislik / gunlukVeri.length;

  const barlar = gunlukVeri
    .map((g, i) => {
      const barYukseklik = (g.toplam / maxTutar) * (yukseklik - altBosluk - 10);
      const x = i * barGenislik + barGenislik * 0.15;
      const y = yukseklik - altBosluk - barYukseklik;
      const w = barGenislik * 0.7;
      const etiket = g.gun.slice(5).replace('-', '/');
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barYukseklik.toFixed(1)}" rx="3" fill="var(--primary)">
          <title>${g.gun}: ${g.toplam.toFixed(2)} TL</title>
        </rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${yukseklik - 6}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${etiket}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${genislik} ${yukseklik}" width="100%" height="${yukseklik}" role="img" aria-label="Son 7 gun satis grafigi">${barlar}</svg>`;
}

const AnaSayfaView = {
  async render(container) {
    container.innerHTML = '<div class="empty-state">Yükleniyor...</div>';

    const yediGunOnce = new Date();
    yediGunOnce.setDate(yediGunOnce.getDate() - 6);
    const buAy = new Date().toISOString().slice(0, 7);
    const yoneticiMi = CURRENT_USER.rol === 'admin' || CURRENT_USER.rol === 'eczaci';

    const [uyarilar, satislar7Gun, bekleyenGorevler, buAykiNobetler, bekleyenSiparisler] = await Promise.all([
      Api.get('/api/ilaclar/uyarilar'),
      Api.get('/api/satislar?baslangic=' + gunStr(yediGunOnce)),
      Api.get('/api/gorevler?durum=bekliyor'),
      Api.get('/api/nobetler?ay=' + buAy),
      yoneticiMi ? Api.get('/api/siparisler?durum=beklemede') : Promise.resolve([])
    ]);

    const bugun = gunStr(new Date());
    const satislarBugun = satislar7Gun.filter((s) => s.tarih.slice(0, 10) === bugun);
    const bugunkuCiro = satislarBugun.reduce((sum, s) => sum + s.toplam_tutar, 0);

    const gunlukVeri = [];
    for (let i = 6; i >= 0; i--) {
      const tarih = new Date();
      tarih.setDate(tarih.getDate() - i);
      const gunKey = gunStr(tarih);
      const toplam = satislar7Gun
        .filter((s) => s.tarih.slice(0, 10) === gunKey)
        .reduce((sum, s) => sum + s.toplam_tutar, 0);
      gunlukVeri.push({ gun: gunKey, toplam });
    }

    container.innerHTML = `
      <div class="stat-row">
        <div class="stat-tile c-mint">
          <div class="label">Bugünkü Satış Adedi</div>
          <div class="value">${satislarBugun.length}</div>
        </div>
        <div class="stat-tile c-lilac">
          <div class="label">Bugünkü Ciro</div>
          <div class="value">${UI.tl(bugunkuCiro)}</div>
        </div>
        <div class="stat-tile c-rose">
          <div class="label">Kritik Stok</div>
          <div class="value">${uyarilar.kritik_stok.length}</div>
        </div>
        <div class="stat-tile c-amber">
          <div class="label">SKT Uyarısı</div>
          <div class="value">${uyarilar.skt_yaklasan.length}</div>
        </div>
      </div>
      <div class="card">
        <h3>Son 7 Gün Satış Trendi</h3>
        ${satisTrendSvg(gunlukVeri)}
      </div>
      <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        <div class="card" style="margin-bottom:0">
          <h3>📋 Bekleyen Görevler (${bekleyenGorevler.length})</h3>
          ${
            bekleyenGorevler.length
              ? '<ul style="margin:0;padding-left:18px;font-size:13px">' +
                bekleyenGorevler
                  .slice(0, 5)
                  .map((g) => `<li style="margin-bottom:4px">${UI.esc(g.baslik)}${g.atanan_adi ? ` <span style="color:var(--text-muted)">→ ${UI.esc(g.atanan_adi)}</span>` : ''}</li>`)
                  .join('') +
                '</ul>'
              : '<p style="color:var(--text-muted);font-size:13px;margin:0">Bekleyen görev yok</p>'
          }
          <a href="#gorevler" style="font-size:12px">Tümünü gör →</a>
        </div>
        <div class="card" style="margin-bottom:0">
          <h3>⚕ Bu Ayki Nöbetler (${buAykiNobetler.length})</h3>
          ${
            buAykiNobetler.length
              ? '<ul style="margin:0;padding-left:18px;font-size:13px">' +
                buAykiNobetler.map((n) => `<li style="margin-bottom:4px">${n.tarih}</li>`).join('') +
                '</ul>'
              : '<p style="color:var(--text-muted);font-size:13px;margin:0">Bu ay nöbet kaydı yok</p>'
          }
          <a href="#nobetler" style="font-size:12px">Takvimi gör →</a>
        </div>
        ${
          yoneticiMi
            ? `<div class="card" style="margin-bottom:0">
                <h3>📦 Bekleyen Siparişler (${bekleyenSiparisler.length})</h3>
                ${
                  bekleyenSiparisler.length
                    ? '<ul style="margin:0;padding-left:18px;font-size:13px">' +
                      bekleyenSiparisler
                        .slice(0, 5)
                        .map((s) => `<li style="margin-bottom:4px">#${s.id} — ${UI.esc(s.tedarikci_adi || '-')}</li>`)
                        .join('') +
                      '</ul>'
                    : '<p style="color:var(--text-muted);font-size:13px;margin:0">Bekleyen sipariş yok</p>'
                }
                <a href="#siparisler" style="font-size:12px">Tümünü gör →</a>
              </div>`
            : ''
        }
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
  iadeler: () => Views.iadeler,
  musteriler: () => Views.musteriler,
  tedarikciler: () => Views.tedarikciler,
  siparisler: () => Views.siparisler,
  raporlar: () => Views.raporlar,
  'kasa-kapanisi': () => Views.kasaKapanisi,
  giderler: () => Views.giderler,
  kampanyalar: () => Views.kampanyalar,
  veresiye: () => Views.veresiye,
  etkilesimler: () => Views.etkilesimler,
  gorevler: () => Views.gorevler,
  nobetler: () => Views.nobetler,
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
  navOlustur();

  const temaBtn = document.getElementById('tema-btn');
  const temaButonMetniGuncelle = () => {
    temaBtn.textContent = UI.temaAktifMi() ? '☀️ Aydınlık Tema' : '🌙 Karanlık Tema';
  };
  temaButonMetniGuncelle();
  temaBtn.addEventListener('click', () => {
    UI.temaDegistir();
    temaButonMetniGuncelle();
  });

  document.getElementById('cp-ac-btn').addEventListener('click', () => CommandPalette.ac());

  document.getElementById('sifre-btn').addEventListener('click', () => {
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
  rotayiRenderEt();
}

init();
