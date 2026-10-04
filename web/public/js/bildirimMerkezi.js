// Ust bardaki zil: dikkat gerektiren isleri toplar, 60 sn'de bir ve sayfa degisince yenilenir
const BildirimMerkezi = (function () {
  const SIMGE = { danger: '⛔', warn: '⚠️', ok: '✅', info: 'ℹ️' };
  let son = { toplam: 0, ogeler: [] };

  function paneliCiz() {
    const panel = document.getElementById('zil-panel');
    panel.innerHTML = `
      <div class="zil-baslik">Bildirim Merkezi</div>
      ${
        son.ogeler.length
          ? son.ogeler
              .map(
                (o) => `<a class="zil-oge seviye-${o.seviye}" href="${o.link}">
                  <span class="zil-simge">${SIMGE[o.seviye] || ''}</span>
                  <span class="zil-metin"><b>${UI.esc(o.baslik)}</b><small>${UI.esc(o.aciklama)}</small></span>
                  <span class="zil-adet">${o.sayi}</span>
                </a>`
              )
              .join('')
          : '<div class="empty-state">Her şey yolunda 👍</div>'
      }`;
  }

  async function yenile() {
    try {
      son = await Api.get('/api/bildirim-merkezi');
    } catch (err) {
      return;
    }
    const rozet = document.getElementById('zil-sayi');
    const onemli = son.ogeler.filter((o) => o.seviye === 'danger' || o.seviye === 'warn').length;
    rozet.hidden = son.ogeler.length === 0;
    rozet.textContent = son.ogeler.length;
    rozet.classList.toggle('onemli', onemli > 0);
    if (!document.getElementById('zil-panel').hidden) paneliCiz();
  }

  function baslat() {
    const btn = document.getElementById('zil-btn');
    const panel = document.getElementById('zil-panel');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) paneliCiz();
    });
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a')) panel.hidden = true;
    });
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !e.target.closest('.zil-kutu')) panel.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') panel.hidden = true;
    });
    window.addEventListener('hashchange', () => setTimeout(yenile, 300));
    yenile();
    setInterval(yenile, 60000);
  }

  return { baslat, yenile };
})();
