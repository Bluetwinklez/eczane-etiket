(function () {
  let veri = { musteriler: [], ozet: {} };

  const HAREKET_ETIKETI = {
    borc: '<span class="badge danger">Borç</span>',
    tahsilat: '<span class="badge ok">Tahsilat</span>',
    iade: '<span class="badge muted">İade</span>'
  };

  function gecikmeRozeti(m) {
    if (m.bakiye <= 0) return '<span class="badge ok">Kapalı</span>';
    if (m.bekleyen_gun > 60) return `<span class="badge danger">${m.bekleyen_gun} gün</span>`;
    if (m.bekleyen_gun > 30) return `<span class="badge warn">${m.bekleyen_gun} gün</span>`;
    return `<span class="badge muted">${m.bekleyen_gun} gün</span>`;
  }

  async function detayGoster(musteriId, onDegisti) {
    const d = await Api.get(`/api/veresiye/${musteriId}`);
    const satirlar = d.hareketler.length
      ? d.hareketler
          .map(
            (h) => `<tr>
              <td>${UI.tarih(h.tarih)}</td>
              <td>${HAREKET_ETIKETI[h.tip] || h.tip}</td>
              <td>${UI.esc(h.aciklama || '-')}${h.odeme_tipi ? ` <small>(${h.odeme_tipi === 'kredi_karti' ? 'kart' : h.odeme_tipi})</small>` : ''}</td>
              <td class="num ${h.tip === 'borc' ? 'tutar-borc' : 'tutar-alacak'}">${h.tip === 'borc' ? '+' : '-'}${UI.tl(h.tutar)}</td>
              <td class="num">${UI.tl(h.bakiye)}</td>
              <td>${UI.esc(h.kullanici_adi || '-')}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="empty-state">Hareket yok</td></tr>';

    const modal = UI.openModal(`
      <h3 class="modal-genis">Cari Hesap — ${UI.esc(d.musteri.ad_soyad)}</h3>
      <div class="stat-row">
        <div class="stat-tile c-rose"><div class="label">Güncel Borç</div><div class="value">${UI.tl(d.bakiye)}</div></div>
        <div class="stat-tile c-lilac"><div class="label">Limit</div><div class="value">${d.musteri.veresiye_limiti != null ? UI.tl(d.musteri.veresiye_limiti) : 'Limitsiz'}</div></div>
      </div>
      ${
        d.bakiye > 0
          ? `<form id="tahsilat-form" class="card" style="margin:12px 0">
              <h3 style="margin-bottom:8px">Tahsilat Al</h3>
              <div class="form-grid">
                <div><label>Tutar (TL)</label><input name="tutar" type="number" step="0.01" min="0.01" max="${d.bakiye}" value="${d.bakiye}" required /></div>
                <div><label>Ödeme</label><select name="odeme_tipi"><option value="nakit">Nakit</option><option value="kredi_karti">Kredi Kartı</option></select></div>
                <div><label>Açıklama</label><input name="aciklama" placeholder="opsiyonel" /></div>
              </div>
              <button type="submit">Tahsil Et</button>
            </form>`
          : ''
      }
      <div class="tablo-kaydir">
        <table>
          <thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th class="num">Tutar</th><th class="num">Bakiye</th><th>Kullanıcı</th></tr></thead>
          <tbody>${satirlar}</tbody>
        </table>
      </div>
      <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    const form = modal.querySelector('#tahsilat-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          const sonuc = await Api.post(`/api/veresiye/${musteriId}/tahsilat`, {
            tutar: Number(fd.get('tutar')),
            odeme_tipi: fd.get('odeme_tipi'),
            aciklama: fd.get('aciklama') || null
          });
          UI.toast(`Tahsilat alındı. Kalan borç: ${UI.tl(sonuc.bakiye)}`, 'success');
          UI.closeModal(modal);
          onDegisti();
          detayGoster(musteriId, onDegisti);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="veresiye-ara" placeholder="Müşteri ara..." style="max-width:280px" />
          <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="veresiye-tumu" style="width:auto" /> Kapanmış hesapları da göster</label>
          <div class="spacer"></div>
        </div>
        <div class="stat-row" id="veresiye-ozet"></div>
        <div class="card">
          <table>
            <thead><tr><th>Müşteri</th><th>Telefon</th><th class="num">Borç</th><th class="num">Limit</th><th>Bekleyen</th><th>Son Hareket</th><th></th></tr></thead>
            <tbody id="veresiye-tbody"></tbody>
          </table>
          <p class="form-ipucu">Bekleyen: son tahsilattan (yoksa ilk borçtan) bu yana geçen gün. Veresiye satış POS ekranında "Veresiye" ödeme tipiyle yapılır.</p>
        </div>
      `;

      const ciz = () => {
        const q = document.getElementById('veresiye-ara').value.toLocaleLowerCase('tr-TR');
        const liste = veri.musteriler.filter((m) => !q || m.ad_soyad.toLocaleLowerCase('tr-TR').includes(q));
        document.getElementById('veresiye-tbody').innerHTML = liste.length
          ? liste
              .map(
                (m) => `<tr>
                  <td>${UI.esc(m.ad_soyad)} ${m.limit_asimi ? '<span class="badge danger">Limit aşıldı</span>' : ''}</td>
                  <td>${UI.esc(m.telefon || '-')}</td>
                  <td class="num"><b>${UI.tl(m.bakiye)}</b></td>
                  <td class="num">${m.veresiye_limiti != null ? UI.tl(m.veresiye_limiti) : '-'}</td>
                  <td>${gecikmeRozeti(m)}</td>
                  <td>${UI.tarih(m.son_hareket)}</td>
                  <td class="actions-col"><button class="secondary" data-musteri="${m.id}">Hesap / Tahsilat</button> ${m.bakiye > 0 ? EczamWA.dugme(m.telefon, EczamWA.SABLONLAR.bakiye({ ad: m.ad_soyad, tutar: UI.tl(m.bakiye) })) : ''}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="7" class="empty-state">Açık veresiye hesabı yok</td></tr>';
      };

      const yenile = async () => {
        const tumu = document.getElementById('veresiye-tumu').checked;
        veri = await Api.get('/api/veresiye' + (tumu ? '?tumu=1' : ''));
        const o = veri.ozet;
        document.getElementById('veresiye-ozet').innerHTML = `
          <div class="stat-tile c-rose"><div class="label">Toplam Alacak</div><div class="value">${UI.tl(o.toplam_alacak)}</div></div>
          <div class="stat-tile c-lilac"><div class="label">Borçlu Müşteri</div><div class="value">${o.borclu_musteri}</div></div>
          <div class="stat-tile c-amber"><div class="label">30 Günü Geçen</div><div class="value">${o.otuz_gun_ustu}</div></div>
          <div class="stat-tile c-mint"><div class="label">Bu Ay Tahsilat</div><div class="value">${UI.tl(o.bu_ay_tahsilat)}</div></div>
        `;
        ciz();
      };

      document.getElementById('veresiye-ara').addEventListener('input', ciz);
      document.getElementById('veresiye-tumu').addEventListener('change', yenile);
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-musteri]');
        if (btn) detayGoster(Number(btn.dataset.musteri), yenile);
      });

      await yenile();
    }
  };

  Views.veresiye = view;
})();
