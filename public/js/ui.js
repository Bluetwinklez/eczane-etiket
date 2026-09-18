window.Views = window.Views || {};

const UI = (function () {
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

  function tarih(str) {
    if (!str) return '-';
    return str.replace('T', ' ').slice(0, 16);
  }

  function openModal(html) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
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

  return { toast, esc, tl, tarih, openModal, closeModal, confirmSil };
})();
