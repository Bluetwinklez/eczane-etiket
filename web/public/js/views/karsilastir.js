(function () {
  const SATIRLAR = [
    ['firma', 'Firma'],
    ['urun_tipi', 'Ürün tipi'],
    ['etken_madde', 'Etken madde'],
    ['atc_kodu', 'ATC kodu'],
    ['satis_fiyati', 'Satış fiyatı', 'tl'],
    ['kamu_fiyati', 'Kamu fiyatı', 'tl'],
    ['fiyat_farki', 'Fiyat farkı', 'tl'],
    ['hasta_oder', 'Hasta öder (aktif çalışan, tahmini)', 'tl'],
    ['stok', 'Stok'],
    ['receteli', 'Reçete', (v) => (v ? 'Reçeteli' : 'Reçetesiz')],
    ['titck_durum', 'TİTCK durumu', (v) => ({ aktif: 'Aktif', pasif: 'Pasif', pasife_alinacak: 'Pasife alınacak' }[v] || '-')],
    ['sgk', 'SGK', (v) => (v ? 'Kapsamda' : '-')],
    ['gorunum', 'Tablet görünümü'],
    ['barkod', 'Barkod']
  ];

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="kr-ara" placeholder="Karşılaştırmaya ürün ekle: ad veya barkod…" style="max-width:420px" />
          <div class="spacer"></div>
          <button class="secondary" id="kr-temizle">Listeyi temizle</button>
        </div>
        <div id="kr-oneriler" class="card" hidden></div>
        <div id="kr-tablo"></div>`;

      const ciz = async () => {
        const idler = EczamSecim.karsilastirmaListesi();
        const hedef = document.getElementById('kr-tablo');
        if (idler.length < 2) {
          hedef.innerHTML = `<div class="card empty-state">Karşılaştırmak için en az 2 ürün ekleyin (${idler.length}/4). İlaç kartında, eşdeğerlerde veya kategori gezgininde “Karşılaştır” düğmesini de kullanabilirsiniz.</div>`;
          return;
        }
        try {
          const u = await Api.get('/api/ilac-bilgi/karsilastir?' + idler.map((id) => 'id=' + id).join('&'));
          const hucre = (r, s) => {
            const v = r[s[0]];
            if (typeof s[2] === 'function') return UI.esc(s[2](v));
            if (s[2] === 'tl') return v == null ? '-' : UI.tl(v);
            return v == null || v === '' ? '-' : UI.esc(String(v));
          };
          hedef.innerHTML = `<div class="card" style="overflow:auto"><table>
            <thead><tr><th></th>${u.map((r) => `<th>${UI.esc(r.ad)}${r.en_ucuz ? ' <span class="badge ok">en uygun</span>' : ''}<br>
              <button class="secondary" data-kart="${r.id}">Kart</button> <button class="secondary" data-sepet="${r.id}">Sepete</button> <button class="secondary" data-cikar="${r.id}">Çıkar</button></th>`).join('')}</tr></thead>
            <tbody>${SATIRLAR.map((s) => `<tr><td style="color:var(--text-muted)">${s[1]}</td>${u.map((r) => `<td>${hucre(r, s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        } catch (err) {
          hedef.innerHTML = `<div class="card empty-state">${UI.esc(err.message)}</div>`;
        }
      };

      let zaman;
      document.getElementById('kr-ara').addEventListener('input', (e) => {
        clearTimeout(zaman);
        zaman = setTimeout(async () => {
          const q = e.target.value.trim();
          const kutu = document.getElementById('kr-oneriler');
          if (q.length < 2) return (kutu.hidden = true);
          const l = (await Api.get('/api/ilaclar?q=' + encodeURIComponent(q))).slice(0, 8);
          kutu.hidden = false;
          kutu.innerHTML = l.length
            ? l.map((x) => `<div class="satir" data-ekle="${x.id}" style="cursor:pointer;padding:6px 2px">${UI.esc(x.ad)} <small style="color:var(--text-muted)">${UI.tl(x.satis_fiyati)} · stok ${x.stok}</small></div>`).join('')
            : '<p class="form-ipucu">Sonuç yok</p>';
        }, 250);
      });
      container.addEventListener('click', (e) => {
        const ekle = e.target.closest('[data-ekle]');
        if (ekle) {
          EczamSecim.karsilastirmayaEkle([ekle.dataset.ekle]);
          document.getElementById('kr-oneriler').hidden = true;
          document.getElementById('kr-ara').value = '';
          return ciz();
        }
        const cikar = e.target.closest('[data-cikar]');
        if (cikar) {
          EczamSecim.karsilastirmadanCikar(cikar.dataset.cikar);
          return ciz();
        }
        const sepet = e.target.closest('[data-sepet]');
        if (sepet) return EczamSecim.sepeteGonder([sepet.dataset.sepet]);
        const kart = e.target.closest('[data-kart]');
        if (kart) window.IlacKartiAc(Number(kart.dataset.kart));
      });
      document.getElementById('kr-temizle').addEventListener('click', () => {
        for (const id of EczamSecim.karsilastirmaListesi()) EczamSecim.karsilastirmadanCikar(id);
        ciz();
      });
      await ciz();
    }
  };
  Views.karsilastir = view;
})();
