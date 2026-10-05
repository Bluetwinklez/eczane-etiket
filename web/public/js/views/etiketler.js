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
    async render(container, ctx) {
      secim.clear();
      const yazma = ctx && ['admin', 'eczaci'].includes(ctx.user.rol);
      container.innerHTML = `
        ${yazma ? `<div class="card no-print" id="fl-kart" style="margin-bottom:14px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <b>Fiyat listesi</b>
            <label class="dugme secondary"><input type="file" id="fl-dosya" accept=".xlsx,.csv,.txt" hidden />Excel / CSV yükle</label>
            <label style="font-weight:400;margin:0"><input type="checkbox" id="fl-otomatik" style="width:auto" /> Satış fiyatlarına hemen uygula</label>
            <span class="form-ipucu" style="margin:0">Depo, firma ya da TİTCK listesi: barkod + PSF (DSF, KF de olabilir) sütunları yeterli.</span>
          </div>
          <div id="fl-farklar" style="margin-top:10px"></div>
        </div>` : ''}
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
      // Fiyat listesi: PSF'si satis fiyatindan farkli urunler → uygula → etiket secimine ekle
      const farklariCiz = async () => {
        const hedef = document.getElementById('fl-farklar');
        if (!hedef) return;
        const farklar = await Api.get('/api/fiyat-listesi/farklar');
        hedef.innerHTML = farklar.length
          ? `<p style="margin:0 0 6px"><b>${farklar.length} üründe</b> liste fiyatı satış fiyatından farklı.</p>
            <div class="tablo-kaydir" style="max-height:40vh;overflow-y:auto"><table><thead><tr><th><input type="checkbox" id="fl-hepsi" checked style="width:auto" /></th><th>Ürün</th><th class="num">Satış</th><th class="num">Liste (PSF)</th><th class="num">Fark</th><th>Liste tarihi</th></tr></thead><tbody>
            ${farklar.map((f) => `<tr><td><input type="checkbox" class="fl-sec" value="${f.id}" checked style="width:auto" /></td><td>${UI.esc(f.ad)}</td><td class="num">${UI.tl(f.satis_fiyati)}</td><td class="num"><b>${UI.tl(f.liste_psf)}</b></td>
              <td class="num"><span class="badge ${f.fark > 0 ? 'warn' : 'ok'}">${f.fark > 0 ? '+' : ''}${UI.tl(f.fark)}${f.yuzde != null ? ` (%${f.yuzde.toLocaleString('tr-TR')})` : ''}</span></td><td>${UI.esc(f.tarih)}</td></tr>`).join('')}
            </tbody></table></div>
            <div style="margin-top:8px"><button id="fl-uygula">Seçilenleri satış fiyatına uygula ve etiketlerini seç</button></div>`
          : '<p class="form-ipucu" style="margin:0">Satış fiyatları yüklenen liste ile uyumlu.</p>';
      };
      const uygulandi = async (idler) => {
        ilaclar = await Api.get('/api/ilaclar');
        await degisenleriYukle();
        for (const id of idler) secim.set(id, secim.get(id) || 1);
        document.getElementById('et-degisen').checked = true;
        listeCiz();
        onizlemeCiz();
        await farklariCiz();
      };
      if (yazma) {
        await farklariCiz();
        document.getElementById('fl-dosya').addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const otomatik = document.getElementById('fl-otomatik').checked ? '?otomatik=1' : '';
            const yanit = await fetch('/api/fiyat-listesi/yukle' + otomatik, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
            const v = await yanit.json();
            if (!yanit.ok) throw new Error(v.error || 'Yüklenemedi');
            UI.toast(`${v.satir} satır okundu, ${v.eslesen} ürün eşleşti, ${v.degisen} üründe fiyat değişti${v.uygulanan.length ? `, ${v.uygulanan.length} satış fiyatı güncellendi` : ''}`, 'success');
            if (v.uygulanan.length) await uygulandi(v.uygulanan);
            else await farklariCiz();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
          e.target.value = '';
        });
        document.getElementById('fl-farklar').addEventListener('change', (e) => {
          if (e.target.id === 'fl-hepsi') container.querySelectorAll('.fl-sec').forEach((cb) => (cb.checked = e.target.checked));
        });
        document.getElementById('fl-farklar').addEventListener('click', async (e) => {
          if (e.target.id !== 'fl-uygula') return;
          const idler = [...container.querySelectorAll('.fl-sec:checked')].map((cb) => Number(cb.value));
          if (!idler.length) return UI.toast('Ürün seçin', 'error');
          try {
            const r = await Api.post('/api/fiyat-listesi/uygula', { idler });
            UI.toast(`${r.uygulanan.length} ürünün satış fiyatı güncellendi; etiketleri seçildi`, 'success');
            await uygulandi(r.uygulanan);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      }

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
