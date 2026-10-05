(function () {
  let liste = [];

  function kalanRozeti(r) {
    if (r.kalan_gun < 0) return `<span class="badge danger">${-r.kalan_gun} gün önce bitti</span>`;
    if (r.kalan_gun === 0) return '<span class="badge danger">Bugün bitiyor</span>';
    if (r.kalan_gun <= 3) return `<span class="badge warn">${r.kalan_gun} gün kaldı</span>`;
    return `<span class="badge muted">${r.kalan_gun} gün kaldı</span>`;
  }

  async function gonder(r, kanal, onGonderildi) {
    try {
      const sonuc = await Api.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: r.musteri_id, ilac_id: r.ilac_id, kanal });
      const durum = sonuc.bildirim.durum === 'simule' ? ' (simüle edildi: SMS/SMTP ayarı yok)' : '';
      UI.toast(`${r.ad_soyad} için hatırlatma kaydedildi${durum}`, 'success');
      onGonderildi();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="toolbar">
          <label style="margin:0">Önümüzdeki</label>
          <select id="hat-gun" style="max-width:140px">
            <option value="3">3 gün</option>
            <option value="7" selected>7 gün</option>
            <option value="14">14 gün</option>
            <option value="30">30 gün</option>
          </select>
          <label style="margin:0">içinde bitecek / bitmiş ilaçlar</label>
          <div class="spacer"></div>
        </div>
        <div class="stat-row" id="hat-ozet"></div>
        <div class="card">
          <table>
            <thead><tr><th>Müşteri</th><th>Telefon</th><th>İlaç</th><th>Son Alım</th><th class="num">Kutu</th><th>Tahmini Bitiş</th><th>Durum</th><th></th></tr></thead>
            <tbody id="hat-tbody"></tbody>
          </table>
          <p class="form-ipucu">Bitiş tarihi = son alım günü + (alınan kutu × bir kutunun yettiği gün). Takip için ilaç kartında "Bir Kutu Kaç Gün Yeter?" alanı dolu olmalıdır. 30 günden eski bitişler listelenmez.</p>
        </div>
      `;

      const yenile = async () => {
        liste = await Api.get('/api/hatirlatmalar/ilac-bitis?gun=' + document.getElementById('hat-gun').value);
        const gecmis = liste.filter((r) => r.kalan_gun < 0).length;
        const bekleyen = liste.filter((r) => !r.hatirlatildi).length;
        document.getElementById('hat-ozet').innerHTML = `
          <div class="stat-tile c-rose"><div class="label">İlacı Bitmiş</div><div class="value">${gecmis}</div></div>
          <div class="stat-tile c-amber"><div class="label">Yakında Bitecek</div><div class="value">${liste.length - gecmis}</div></div>
          <div class="stat-tile c-lilac"><div class="label">Hatırlatılmayı Bekleyen</div><div class="value">${bekleyen}</div></div>
        `;
        document.getElementById('hat-tbody').innerHTML = liste.length
          ? liste
              .map(
                (r, idx) => `<tr>
                  <td>${UI.esc(r.ad_soyad)}</td>
                  <td>${UI.esc(r.telefon || '-')}</td>
                  <td>${UI.esc(r.ilac_adi)}</td>
                  <td>${r.son_alim}</td>
                  <td class="num">${r.adet} × ${r.kutu_gun} gün</td>
                  <td>${r.bitis_tarihi}</td>
                  <td>${kalanRozeti(r)} ${r.hatirlatildi ? `<span class="badge ok" title="${UI.tarih(r.hatirlatildi)}">Hatırlatıldı</span>` : ''}</td>
                  <td class="actions-col">${EczamWA.dugme(r.telefon, EczamWA.SABLONLAR.ilacBitis({ ad: r.ad_soyad, ilac: r.ilac_adi, tarih: r.bitis_tarihi, gecti: r.kalan_gun < 0 }))} ${
                    r.hatirlatildi
                      ? ''
                      : `<button class="secondary" data-idx="${idx}" data-kanal="sms" ${r.telefon ? '' : 'disabled title="Telefon yok"'}>SMS</button>
                         <button class="secondary" data-idx="${idx}" data-kanal="email" ${r.email ? '' : 'disabled title="E-posta yok"'}>E-posta</button>`
                  }</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="empty-state">Bu aralıkta biten ilaç yok</td></tr>';
      };

      document.getElementById('hat-gun').addEventListener('change', yenile);
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-kanal]');
        if (!btn) return;
        gonder(liste[Number(btn.dataset.idx)], btn.dataset.kanal, yenile);
      });
      await yenile();
    }
  };

  Views.hatirlatmalar = view;
})();
