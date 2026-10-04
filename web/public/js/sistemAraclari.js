// Kullanim araclari: gorunum ayarlari (tema, yazi boyutu), ekran kilidi,
// baglanti koptu bandi ve klavye kisayollari yardim penceresi.
const SistemAraclari = (() => {
  const ANAHTAR = { tema: 'eczanem-tema', yazi: 'eczanem-yazi', kilit: 'eczanem-kilit-dk', kilitli: 'eczanem-kilitli' };
  const oku = (k, v) => {
    try {
      return localStorage.getItem(k) ?? v;
    } catch (e) {
      return v;
    }
  };
  const yaz = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  };
  let kullanici = null;

  // ---- Gorunum: tema (aydinlik / karanlik / sistem) ve yazi boyutu ----
  const sistemKoyu = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function temaUygula() {
    const mod = oku(ANAHTAR.tema, 'light');
    const koyu = mod === 'dark' || (mod === 'sistem' && sistemKoyu && sistemKoyu.matches);
    if (koyu) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  if (sistemKoyu && sistemKoyu.addEventListener) sistemKoyu.addEventListener('change', temaUygula);

  function yaziUygula() {
    const boyut = oku(ANAHTAR.yazi, 'normal');
    if (boyut === 'normal') document.documentElement.removeAttribute('data-yazi');
    else document.documentElement.setAttribute('data-yazi', boyut);
  }

  function gorunumAc() {
    const tema = oku(ANAHTAR.tema, 'light');
    const yazi = oku(ANAHTAR.yazi, 'normal');
    const kilit = oku(ANAHTAR.kilit, '15');
    const secenek = (ad, deger, secili, etiket) =>
      `<label class="secim-kart"><input type="radio" name="${ad}" value="${deger}" ${secili === deger ? 'checked' : ''} /><span>${etiket}</span></label>`;
    const modal = UI.openModal(`
      <h3>Görünüm Ayarları</h3>
      <form id="gorunum-form">
        <label>Tema</label>
        <div class="secim-grup">${secenek('tema', 'light', tema, '☀️ Aydınlık')}${secenek('tema', 'dark', tema, '🌙 Karanlık')}${secenek('tema', 'sistem', tema, '💻 Sistem')}</div>
        <label style="margin-top:14px">Yazı boyutu</label>
        <div class="secim-grup">${secenek('yazi', 'kucuk', yazi, '<small>Aa</small> Küçük')}${secenek('yazi', 'normal', yazi, 'Aa Normal')}${secenek('yazi', 'buyuk', yazi, '<b>Aa</b> Büyük')}</div>
        <label style="margin-top:14px" for="kilit-dk">Boşta kalınca ekranı kilitle</label>
        <select id="kilit-dk" name="kilit">
          ${[['0', 'Kapalı'], ['5', '5 dakika'], ['10', '10 dakika'], ['15', '15 dakika'], ['30', '30 dakika']]
            .map(([v, a]) => `<option value="${v}" ${kilit === v ? 'selected' : ''}>${a}</option>`)
            .join('')}
        </select>
        <p class="form-ipucu">Ayarlar bu cihaza kaydedilir. Ekranı istediğiniz an Ctrl+Shift+L ile kilitleyebilirsiniz.</p>
        <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button></div>
      </form>`);
    const form = modal.querySelector('#gorunum-form');
    form.addEventListener('change', () => {
      yaz(ANAHTAR.tema, form.tema.value);
      yaz(ANAHTAR.yazi, form.yazi.value);
      yaz(ANAHTAR.kilit, form.kilit.value);
      temaUygula();
      yaziUygula();
      bostaSayaciniKur();
      window.dispatchEvent(new Event('eczanem:tema'));
    });
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  // ---- Ekran kilidi ----
  let bostaZamanlayici = null;
  function kilitliMi() {
    try {
      return sessionStorage.getItem(ANAHTAR.kilitli) === '1';
    } catch (e) {
      return Boolean(document.getElementById('ekran-kilidi'));
    }
  }
  function kilitle() {
    if (!kullanici || document.getElementById('ekran-kilidi')) return;
    try {
      sessionStorage.setItem(ANAHTAR.kilitli, '1');
    } catch (e) {}
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    const katman = document.createElement('div');
    katman.id = 'ekran-kilidi';
    katman.className = 'ekran-kilidi';
    katman.setAttribute('role', 'dialog');
    katman.setAttribute('aria-modal', 'true');
    katman.setAttribute('aria-label', 'Ekran kilitli');
    katman.innerHTML = `
      <form class="kilit-kart" id="kilit-form" autocomplete="off">
        ${Ikon.logo()}
        <span class="avatar kilit-avatar">${UI.esc(AnaSayfaView.basHarfler(kullanici.ad_soyad))}</span>
        <h2>${UI.esc(kullanici.ad_soyad)}</h2>
        <p>Ekran kilitlendi. Devam etmek için şifrenizi girin.</p>
        <input type="password" name="sifre" placeholder="Şifre" autocomplete="current-password" required />
        <div class="kilit-hata" id="kilit-hata" hidden></div>
        <button type="submit">Kilidi Aç</button>
        <button type="button" class="kilit-cikis" id="kilit-cikis">Farklı kullanıcıyla giriş</button>
      </form>`;
    document.body.appendChild(katman);
    const form = katman.querySelector('#kilit-form');
    form.sifre.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hata = katman.querySelector('#kilit-hata');
      try {
        await Api.post('/api/auth/kilit-ac', { sifre: form.sifre.value });
        kilidiAc();
      } catch (err) {
        hata.textContent = err.message;
        hata.hidden = false;
        form.sifre.value = '';
        form.sifre.focus();
        if (/yeniden giriş/.test(err.message)) setTimeout(cikisYap, 1200);
      }
    });
    katman.querySelector('#kilit-cikis').addEventListener('click', cikisYap);
  }
  function kilidiAc() {
    try {
      sessionStorage.removeItem(ANAHTAR.kilitli);
    } catch (e) {}
    const katman = document.getElementById('ekran-kilidi');
    if (katman) katman.remove();
    bostaSayaciniKur();
  }
  async function cikisYap() {
    try {
      sessionStorage.removeItem(ANAHTAR.kilitli);
      await Api.post('/api/auth/logout');
    } catch (e) {}
    window.location.href = 'login.html';
  }
  function bostaSayaciniKur() {
    clearTimeout(bostaZamanlayici);
    const dk = Number(oku(ANAHTAR.kilit, '15'));
    if (!dk || document.getElementById('ekran-kilidi')) return;
    bostaZamanlayici = setTimeout(kilitle, dk * 60 * 1000);
  }

  // ---- Baglanti koptu bandi ----
  let bant = null;
  let saglikZamanlayici = null;
  function baglantiDurumu(varMi) {
    if (varMi) {
      if (bant) {
        bant.remove();
        bant = null;
        clearInterval(saglikZamanlayici);
        UI.toast('Sunucu bağlantısı geri geldi', 'success');
      }
      return;
    }
    if (bant) return;
    bant = document.createElement('div');
    bant.className = 'baglanti-bandi';
    bant.setAttribute('role', 'alert');
    bant.innerHTML = '<span class="nokta"></span> Sunucuya ulaşılamıyor. Yaptığınız işlemler kaydedilmeyebilir; bağlantı yeniden deneniyor…';
    document.body.appendChild(bant);
    clearInterval(saglikZamanlayici);
    saglikZamanlayici = setInterval(async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) baglantiDurumu(true);
      } catch (e) {}
    }, 5000);
  }

  // ---- Klavye kisayollari ----
  const KISAYOLLAR = [
    ['Ctrl + K', 'Hızlı arama / komut paleti'],
    ['F2', 'Kasada ürün aramaya odaklan'],
    ['Enter', 'Kasada ilk arama sonucunu sepete ekle'],
    ['Ctrl + Enter', 'Satışı tamamla'],
    ['F8', 'Sepeti beklet'],
    ['Ctrl + Shift + L', 'Ekranı kilitle'],
    ['Esc', 'Açık pencereyi / menüyü kapat'],
    ['?', 'Bu yardım penceresi']
  ];
  function kisayollariGoster() {
    if (document.querySelector('.kisayol-tablo')) return;
    const modal = UI.openModal(`
      <h3>Klavye Kısayolları</h3>
      <table class="kisayol-tablo"><tbody>
        ${KISAYOLLAR.map(([t, a]) => `<tr><td>${t.split(' + ').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</td><td>${a}</td></tr>`).join('')}
      </tbody></table>
      <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button></div>`);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }
  function yaziAlanindaMi(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function baslat(user) {
    kullanici = user;
    temaUygula();
    yaziUygula();
    window.addEventListener('eczanem:baglanti', (e) => baglantiDurumu(e.detail.var));
    window.addEventListener('offline', () => baglantiDurumu(false));
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => document.addEventListener(t, () => !kilitliMi() && bostaSayaciniKur(), { passive: true }));
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        kilitle();
      } else if (e.key === '?' && !yaziAlanindaMi(document.activeElement) && !kilitliMi()) {
        e.preventDefault();
        kisayollariGoster();
      } else if (e.key === 'Escape') {
        const acik = document.querySelectorAll('.modal-backdrop');
        if (acik.length && !kilitliMi()) acik[acik.length - 1].remove();
      }
    });
    if (kilitliMi()) kilitle();
    else bostaSayaciniKur();
  }

  return { baslat, gorunumAc, kilitle, kisayollariGoster, temaUygula };
})();
