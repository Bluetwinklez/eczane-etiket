(function () {
  const RENK_KODU = {
    beyaz: '#f5f5f0', 'sarı': '#f6d84a', turuncu: '#f39a2b', 'kırmızı': '#e0352b', pembe: '#f4a6c0', mor: '#8e4fb3',
    mavi: '#2f78d4', 'yeşil': '#4aae4f', kahverengi: '#8a5a33', gri: '#9a9a9a', siyah: '#222', krem: '#efe2c0'
  };

  const view = {
    async render(container) {
      let renkler = [];
      let sekil = '';
      let centik = '';
      let seffaf = false;
      const yazilar = [];

      container.innerHTML = `
        <div class="card">
          <p class="form-ipucu" style="margin:0 0 12px">Müşterinin getirdiği tablet veya kapsülü yazı, şekil, renk, ATC/endikasyon ve çentik bilgisiyle bulun. Arama, ürünlerin <b>İlaç Kartı → Tablet bilgisi</b> sekmesinde girilen bilgileri kullanır.</p>
          <div class="form-grid">
            <div><label>Metin (üzerindeki yazı)</label><div style="display:flex;gap:6px"><input id="t-yazi" placeholder="örn. 10, TEB" /><button type="button" class="secondary" id="t-yazi-ekle">Ekle</button></div><div id="t-yazilar" style="margin-top:6px"></div></div>
            <div><label>ATC kodu (başı yeterli)</label><input id="t-atc" placeholder="N02" /></div>
            <div><label>Endikasyon</label><input id="t-endikasyon" placeholder="örn. ağrı" /></div>
            <div><label>Çentik</label><select id="t-centik"><option value="">Fark etmez</option><option value="yok">Yok</option><option value="tek">Tek</option><option value="çift">Çift</option></select></div>
            <div><label><input type="checkbox" id="t-seffaf" /> Şeffaf / yarı şeffaf kapsül</label></div>
          </div>
          <label style="margin-top:12px">Renk (en fazla iki)</label>
          <div id="t-renkler" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          <label style="margin-top:12px">Şekil</label>
          <div id="t-sekiller" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          <button id="t-bul" style="width:100%;margin-top:16px;padding:12px">İlacı bul</button>
        </div>
        <div id="t-sonuc" style="margin-top:16px"></div>`;

      const yazilariCiz = () => {
        document.getElementById('t-yazilar').innerHTML = yazilar.map((y, i) => `<span class="badge muted" style="cursor:pointer" data-sil="${i}" title="Kaldır">${UI.esc(y)} ✕</span>`).join(' ');
      };
      const secimCiz = (secenekler) => {
        document.getElementById('t-renkler').innerHTML = secenekler.renkler
          .map(
            (r) => `<button type="button" class="secondary" data-renk="${r}" style="display:inline-flex;align-items:center;gap:6px;${renkler.includes(r) ? 'outline:2px solid var(--ink)' : ''}">
              <span style="width:16px;height:16px;border-radius:50%;background:${RENK_KODU[r] || '#ccc'};border:1px solid var(--border)"></span>${r}</button>`
          )
          .join('');
        document.getElementById('t-sekiller').innerHTML = secenekler.sekiller
          .map((s) => `<button type="button" class="secondary" data-sekil="${s}" style="${sekil === s ? 'outline:2px solid var(--ink)' : ''}">${s}</button>`)
          .join('');
      };
      // Sunucudaki izinli renk/sekil listesiyle ayni tutulur (server/ilacBilgi.js)
      const SECENEKLER = {
        renkler: ['beyaz', 'sarı', 'turuncu', 'kırmızı', 'pembe', 'mor', 'mavi', 'yeşil', 'kahverengi', 'gri', 'siyah', 'krem'],
        sekiller: ['yuvarlak', 'oval', 'uzun', 'kapsül', 'üçgen', 'kare', 'altıgen', 'elmas', 'diğer']
      };
      secimCiz(SECENEKLER);

      const yaziEkle = () => {
        const i = document.getElementById('t-yazi');
        const v = i.value.trim();
        if (v && !yazilar.includes(v)) yazilar.push(v);
        i.value = '';
        yazilariCiz();
      };
      document.getElementById('t-yazi-ekle').addEventListener('click', yaziEkle);
      document.getElementById('t-yazi').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          yaziEkle();
        }
      });

      container.addEventListener('click', (e) => {
        const sil = e.target.closest('[data-sil]');
        if (sil) {
          yazilar.splice(Number(sil.dataset.sil), 1);
          return yazilariCiz();
        }
        const r = e.target.closest('[data-renk]');
        if (r) {
          const v = r.dataset.renk;
          if (renkler.includes(v)) renkler = renkler.filter((x) => x !== v);
          else if (renkler.length < 2) renkler.push(v);
          else UI.toast('En fazla iki renk seçilebilir', 'error');
          return secimCiz(SECENEKLER);
        }
        const s = e.target.closest('[data-sekil]');
        if (s) {
          sekil = sekil === s.dataset.sekil ? '' : s.dataset.sekil;
          return secimCiz(SECENEKLER);
        }
        const kart = e.target.closest('[data-kart]');
        if (kart) window.IlacKartiAc(Number(kart.dataset.kart));
      });

      document.getElementById('t-bul').addEventListener('click', async () => {
        yaziEkle();
        const p = new URLSearchParams();
        yazilar.forEach((y) => p.append('yazi', y));
        renkler.forEach((r) => p.append('renk', r));
        if (sekil) p.set('sekil', sekil);
        const atc = document.getElementById('t-atc').value.trim();
        const end = document.getElementById('t-endikasyon').value.trim();
        const cen = document.getElementById('t-centik').value;
        if (atc) p.set('atc', atc);
        if (end) p.set('endikasyon', end);
        if (cen) p.set('centik', cen);
        if (document.getElementById('t-seffaf').checked) p.set('seffaf', '1');
        const hedef = document.getElementById('t-sonuc');
        try {
          const v = await Api.get('/api/ilac-bilgi/tespit?' + p.toString());
          hedef.innerHTML = `<div class="card"><h3 style="margin:0 0 8px">${v.toplam} sonuç</h3>${
            v.toplam
              ? `<table><thead><tr><th>Ürün</th><th>Görünüm</th><th>ATC</th><th class="num">Stok</th><th></th></tr></thead><tbody>${v.sonuclar
                  .map(
                    (r) => `<tr><td>${UI.esc(r.ad)}</td><td>${UI.esc([r.tablet_renk, r.tablet_sekil, r.tablet_yazi && `“${r.tablet_yazi}”`].filter(Boolean).join(' · ') || '-')}</td>
                    <td>${UI.esc(r.atc_kodu || '-')}</td><td class="num">${r.stok}</td><td><button class="secondary" data-kart="${r.id}">Kart</button></td></tr>`
                  )
                  .join('')}</tbody></table>`
              : '<p class="empty-state">Eşleşen ürün yok. Ürünlerin tablet bilgisi girilmemiş olabilir (İlaç Kartı → Tablet bilgisi) ya da arama çok dar.</p>'
          }</div>`;
        } catch (err) {
          hedef.innerHTML = '';
          UI.toast(err.message, 'error');
        }
      });
    }
  };

  Views.ilacTespit = view;
})();
