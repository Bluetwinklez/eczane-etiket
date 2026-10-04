window.Views = window.Views || {};

const UI = (function () {
  const RECETE_TURLERI = {
    beyaz: 'Beyaz',
    kirmizi: 'Kırmızı',
    yesil: 'Yeşil',
    mor: 'Mor',
    turuncu: 'Turuncu'
  };
  const URUN_TIPLERI = {
    ilac: 'İlaç',
    dermokozmetik: 'Dermokozmetik',
    takviye: 'Gıda Takviyesi',
    medikal: 'Medikal Ürün',
    diger: 'Diğer'
  };

  function toast(mesaj, tip) {
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (tip ? ' ' + tip : '');
    el.textContent = mesaj;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function tl(sayi) {
    const n = Number(sayi) || 0;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  }

  // Sunucu zaman damgalarini UTC tutar (SQLite datetime('now') ve toISOString).
  // Saat iceren degerler kullanicinin yerel saatine cevrilerek gosterilir;
  // yalnizca tarih olan degerler (YYYY-MM-DD) oldugu gibi kalir.
  function tarih(str) {
    if (!str) return '-';
    const s = String(str);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
      const d = new Date(s.replace(' ', 'T') + (/Z|[+-]\d{2}:?\d{2}$/.test(s) ? '' : 'Z'));
      if (!Number.isNaN(d.getTime())) {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      }
    }
    return s.replace('T', ' ').slice(0, 16);
  }

  function openModal(html) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function closeModal(el) {
    el.remove();
  }

  async function confirmSil(mesaj) {
    return window.confirm(mesaj || 'Silmek istediğinize emin misiniz?');
  }

  function temaAktifMi() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function temaDegistir() {
    const koyu = !temaAktifMi();
    if (koyu) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('eczanem-tema', koyu ? 'dark' : 'light');
    } catch (e) {}
    return koyu;
  }

  function aramaSeedOku() {
    try {
      const deger = sessionStorage.getItem('eczanem-arama-seed');
      sessionStorage.removeItem('eczanem-arama-seed');
      return deger || '';
    } catch (e) {
      return '';
    }
  }

  // Okutulan metin bir karekoda (GS1 DataMatrix) mi benziyor? Duz EAN-13 barkodlari eslesmez.
  function karekodaBenziyor(metin) {
    const s = String(metin || '').trim();
    return /^\][A-Za-z]\d/.test(s) || s.includes('\x1d') || s.startsWith('(01)') || /^01\d{14}(10|11|17|21)/.test(s);
  }

  async function karekodSorgula(metin) {
    return Api.get('/api/ilaclar/karekod?kod=' + encodeURIComponent(String(metin).trim()));
  }

  return { toast, esc, tl, tarih, openModal, closeModal, confirmSil, temaAktifMi, temaDegistir, aramaSeedOku, URUN_TIPLERI, RECETE_TURLERI, karekodaBenziyor, karekodSorgula };
})();
