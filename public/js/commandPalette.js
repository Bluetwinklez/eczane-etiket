(function () {
  const SAYFALAR = [
    { key: 'anasayfa', etiket: 'Ana Sayfa', ikon: '🏠' },
    { key: 'ilaclar', etiket: 'İlaçlar', ikon: '💊' },
    { key: 'stok', etiket: 'Stok Hareketleri', ikon: '📦' },
    { key: 'satis', etiket: 'Satış (POS)', ikon: '🧾' },
    { key: 'musteriler', etiket: 'Müşteriler', ikon: '👤' },
    { key: 'tedarikciler', etiket: 'Tedarikçiler', ikon: '🚚' },
    { key: 'siparisler', etiket: 'Siparişler', ikon: '📋', roller: ['admin', 'eczaci'] },
    { key: 'raporlar', etiket: 'Raporlar', ikon: '📊', roller: ['admin', 'eczaci'] },
    { key: 'kasa-kapanisi', etiket: 'Kasa Kapanışı', ikon: '💰' },
    { key: 'giderler', etiket: 'Giderler', ikon: '💸', roller: ['admin', 'eczaci'] },
    { key: 'kampanyalar', etiket: 'Kampanyalar', ikon: '🏷️' },
    { key: 'gorevler', etiket: 'Görevler', ikon: '✅' },
    { key: 'nobetler', etiket: 'Nöbetçi Takvimi', ikon: '⚕' },
    { key: 'bildirimler', etiket: 'Bildirimler', ikon: '🔔' },
    { key: 'kullanicilar', etiket: 'Kullanıcılar', ikon: '🧑‍💼', roller: ['admin'] },
    { key: 'subeler', etiket: 'Şubeler', ikon: '🏢', roller: ['admin'] },
    { key: 'yedekleme', etiket: 'Yedekleme', ikon: '💾', roller: ['admin'] },
    { key: 'islem-kaydi', etiket: 'İşlem Kaydı', ikon: '📜', roller: ['admin'] }
  ];

  let overlay = null;
  let seciliIndex = 0;
  let mevcutSonuclar = [];
  let aramaTimer = null;

  function normallestir(s) {
    return (s || '').toLocaleLowerCase('tr-TR');
  }

  function sayfaFiltrele(sorgu, rol) {
    const q = normallestir(sorgu);
    return SAYFALAR.filter((s) => (!s.roller || s.roller.includes(rol)) && normallestir(s.etiket).includes(q));
  }

  async function veriAra(sorgu) {
    if (sorgu.trim().length < 2) return [];
    try {
      const [ilaclar, musteriler] = await Promise.all([
        Api.get('/api/ilaclar?q=' + encodeURIComponent(sorgu)),
        Api.get('/api/musteriler?q=' + encodeURIComponent(sorgu))
      ]);
      const ilacSonuc = ilaclar.slice(0, 4).map((i) => ({ tip: 'ilac', id: i.id, baslik: i.ad, altBaslik: `Stok: ${i.stok} · ${UI.tl(i.satis_fiyati)}`, hedef: 'ilaclar' }));
      const musteriSonuc = musteriler.slice(0, 4).map((m) => ({ tip: 'musteri', id: m.id, baslik: m.ad_soyad, altBaslik: m.telefon || '', hedef: 'musteriler' }));
      return [...ilacSonuc, ...musteriSonuc];
    } catch (e) {
      return [];
    }
  }

  function sonuclariCiz() {
    const liste = overlay.querySelector('#cp-liste');
    if (mevcutSonuclar.length === 0) {
      liste.innerHTML = '<div class="empty-state" style="padding:20px">Sonuç bulunamadı</div>';
      return;
    }
    liste.innerHTML = mevcutSonuclar
      .map(
        (s, i) => `
        <div class="cp-item ${i === seciliIndex ? 'cp-secili' : ''}" data-idx="${i}">
          <span class="cp-ikon">${s.ikon || (s.tip === 'ilac' ? '💊' : s.tip === 'musteri' ? '👤' : '→')}</span>
          <div class="cp-metin">
            <div class="cp-baslik">${UI.esc(s.etiket || s.baslik)}</div>
            ${s.altBaslik ? `<div class="cp-alt">${UI.esc(s.altBaslik)}</div>` : ''}
          </div>
        </div>`
      )
      .join('');
    liste.querySelectorAll('.cp-item').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        seciliIndex = Number(el.dataset.idx);
        sonuclariCiz();
      });
      el.addEventListener('click', () => sonucaGit(Number(el.dataset.idx)));
    });
  }

  function sonucaGit(index) {
    const secilen = mevcutSonuclar[index];
    if (!secilen) return;
    if (secilen.key) {
      location.hash = '#' + secilen.key;
    } else if (secilen.hedef) {
      try {
        sessionStorage.setItem('eczanem-arama-seed', overlay.querySelector('#cp-input').value.trim());
      } catch (e) {}
      location.hash = '#' + secilen.hedef;
    }
    kapat();
  }

  async function sorguGuncelle(deger) {
    const sayfalar = sayfaFiltrele(deger, typeof CURRENT_USER !== 'undefined' && CURRENT_USER ? CURRENT_USER.rol : '');
    if (deger.trim().length >= 2) {
      const veriSonuclari = await veriAra(deger);
      mevcutSonuclar = [...sayfalar, ...veriSonuclari];
    } else {
      mevcutSonuclar = sayfalar;
    }
    seciliIndex = 0;
    sonuclariCiz();
  }

  function ac() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cp-backdrop';
    overlay.innerHTML = `
      <div class="cp-box">
        <input id="cp-input" placeholder="Sayfa, ilaç veya müşteri ara..." autocomplete="off" />
        <div id="cp-liste" class="cp-sonuclar"></div>
        <div class="cp-footer">↑↓ gezin · Enter seç · Esc kapat</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#cp-input');
    input.focus();
    sorguGuncelle('');

    input.addEventListener('input', (e) => {
      clearTimeout(aramaTimer);
      aramaTimer = setTimeout(() => sorguGuncelle(e.target.value), 150);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) kapat();
    });

    document.addEventListener('keydown', tusDinleyici, true);
  }

  function kapat() {
    if (!overlay) return;
    document.removeEventListener('keydown', tusDinleyici, true);
    overlay.remove();
    overlay = null;
  }

  function tusDinleyici(e) {
    if (!overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      kapat();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      seciliIndex = Math.min(seciliIndex + 1, mevcutSonuclar.length - 1);
      sonuclariCiz();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      seciliIndex = Math.max(seciliIndex - 1, 0);
      sonuclariCiz();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      sonucaGit(seciliIndex);
    }
  }

  document.addEventListener('keydown', (e) => {
    const modTus = e.metaKey || e.ctrlKey;
    if (modTus && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay) kapat();
      else ac();
    }
  });

  window.CommandPalette = { ac, kapat };
})();
