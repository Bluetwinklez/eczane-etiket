(function () {
  const BOYUTLAR = {
    kucuk: { ad: 'Küçük (5 sütun)', sutun: 5 },
    orta: { ad: 'Orta (4 sütun)', sutun: 4 },
    buyuk: { ad: 'Büyük (3 sütun)', sutun: 3 }
  };

  let ilaclar = [];
  let degisenler = new Set();
  const secim = new Map(); // ilac_id -> adet

  function etiketHtml(ilac) {
    const [lira, kurus] = Number(ilac.satis_fiyati).toFixed(2).split('.');
    return `<div class="raf-etiket">
      <div class="raf-ad">${UI.esc(ilac.ad)}</div>
      <div class="raf-fiyat"><span class="raf-lira">${Number(lira).toLocaleString('tr-TR')}</span><span class="raf-kurus">,${kurus} TL</span></div>
      ${ilac.barkod ? `<div class="raf-barkod">${Barkod.svg(ilac.barkod, { yukseklik: 34 })}<div class="raf-barkod-no">${UI.esc(ilac.barkod)}</div></div>` : ''}
      <div class="raf-alt">${UI.esc(ilac.uretici || '')}${ilac.receteli ? ' · Reçeteli' : ''}</div>
    </div>`;
  }

  function onizlemeCiz() {
    const boyut = document.getElementById('et-boyut').value;
    const etiketler = [];
    for (const [id, adet] of secim) {
      const ilac = ilaclar.find((i) => i.id === id);
      for (let i = 0; i < adet; i++) etiketler.push(etiketHtml(ilac));
    }
    const sayfa = document.getElementById('etiket-sayfa');
    sayfa.className = `etiket-sayfa boyut-${boyut}`;
    sayfa.style.setProperty('--etiket-sutun', BOYUTLAR[boyut].sutun);
    sayfa.innerHTML = etiketler.length ? etiketler.join('') : '<div class="empty-state">Etiket basılacak ürün seçin</div>';
    document.getElementById('et-sayac').textContent = `${etiketler.length} etiket`;
  }

  function listeCiz() {
    const q = document.getElementById('et-ara').value.toLocaleLowerCase('tr-TR');
    const tip = document.getElementById('et-tip').value;
    const sadeceDegisen = document.getElementById('et-degisen').checked;
    const liste = ilaclar.filter(
      (i) =>
        (!q || i.ad.toLocaleLowerCase('tr-TR').includes(q) || (i.barkod || '').includes(q)) &&
        (!tip || i.urun_tipi === tip) &&
        (!sadeceDegisen || degisenler.has(i.id))
    );
    document.getElementById('et-tbody').innerHTML = liste.length
      ? liste
          .map(
            (i) => `<tr>
              <td><input type="checkbox" class="et-sec" data-id="${i.id}" style="width:auto" ${secim.has(i.id) ? 'checked' : ''} /></td>
              <td>${UI.esc(i.ad)} ${degisenler.has(i.id) ? '<span class="badge warn">Fiyat değişti</span>' : ''}</td>
              <td class="num">${UI.tl(i.satis_fiyati)}</td>
              <td class="num"><input type="number" min="1" max="99" class="et-adet" data-id="${i.id}" value="${secim.get(i.id) || 1}" style="width:64px" /></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="4" class="empty-state">Ürün yok</td></tr>';
  }

  const view = {
    async render(container) {
      secim.clear();
      container.innerHTML = `
        <div class="etiket-duzen">
          <div class="card etiket-panel">
            <h3>Ürün Seçimi</h3>
            <div class="form-grid">
              <div><input id="et-ara" placeholder="Ürün adı veya barkod..." /></div>
              <div><select id="et-tip"><option value="">Tüm tipler</option>${Object.entries(UI.URUN_TIPLERI).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
            </div>
            <label><input type="checkbox" id="et-degisen" style="width:auto" /> Yalnızca son
              <select id="et-gun" style="width:auto;display:inline-block"><option value="1">1</option><option value="7" selected>7</option><option value="30">30</option></select>
              günde fiyatı değişenler</label>
            <div style="margin:8px 0"><button class="secondary" id="et-hepsi">Listedekilerin hepsini seç</button> <button class="secondary" id="et-temizle">Seçimi temizle</button></div>
            <div class="tablo-kaydir" style="max-height:55vh;overflow-y:auto">
              <table><thead><tr><th></th><th>Ürün</th><th class="num">Fiyat</th><th class="num">Adet</th></tr></thead><tbody id="et-tbody"></tbody></table>
            </div>
          </div>
          <div class="card">
            <div class="toolbar" style="margin:0 0 10px">
              <select id="et-boyut" style="max-width:200px">${Object.entries(BOYUTLAR).map(([v, b]) => `<option value="${v}" ${v === 'orta' ? 'selected' : ''}>${b.ad}</option>`).join('')}</select>
              <span id="et-sayac" class="form-ipucu" style="margin:0"></span>
              <div class="spacer"></div>
              <button id="et-yazdir">🖨️ Yazdır</button>
            </div>
            <div id="etiket-sayfa"></div>
            <p class="form-ipucu">A4 kâğıda basılır. Geçerli EAN-13 barkodlar EAN-13, diğerleri Code 128 olarak çizilir; ikisini de barkod okuyucular okur.</p>
          </div>
        </div>
      `;

      const degisenleriYukle = async () => {
        const rows = await Api.get('/api/ilaclar/fiyat-degisenler?gun=' + document.getElementById('et-gun').value);
        degisenler = new Set(rows.map((r) => r.ilac_id));
      };
      ilaclar = await Api.get('/api/ilaclar');
      await degisenleriYukle();
      listeCiz();
      onizlemeCiz();

      document.getElementById('et-ara').addEventListener('input', listeCiz);
      document.getElementById('et-tip').addEventListener('change', listeCiz);
      document.getElementById('et-degisen').addEventListener('change', listeCiz);
      document.getElementById('et-gun').addEventListener('change', async () => {
        await degisenleriYukle();
        listeCiz();
      });
      document.getElementById('et-boyut').addEventListener('change', onizlemeCiz);
      document.getElementById('et-tbody').addEventListener('change', (e) => {
        const id = Number(e.target.dataset.id);
        if (e.target.classList.contains('et-sec')) {
          if (e.target.checked) secim.set(id, Number(container.querySelector(`.et-adet[data-id="${id}"]`).value) || 1);
          else secim.delete(id);
        } else if (e.target.classList.contains('et-adet') && secim.has(id)) {
          secim.set(id, Math.min(99, Math.max(1, Number(e.target.value) || 1)));
        }
        onizlemeCiz();
      });
      document.getElementById('et-hepsi').addEventListener('click', () => {
        container.querySelectorAll('.et-sec').forEach((cb) => {
          cb.checked = true;
          const id = Number(cb.dataset.id);
          if (!secim.has(id)) secim.set(id, 1);
        });
        onizlemeCiz();
      });
      document.getElementById('et-temizle').addEventListener('click', () => {
        secim.clear();
        listeCiz();
        onizlemeCiz();
      });
      document.getElementById('et-yazdir').addEventListener('click', () => {
        if (!secim.size) {
          UI.toast('Önce ürün seçin', 'error');
          return;
        }
        window.print();
      });
    }
  };

  Views.etiketler = view;
})();
