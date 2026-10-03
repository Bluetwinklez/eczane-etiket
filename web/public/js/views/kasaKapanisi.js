(function () {
  const view = {
    async render(container) {
      const bugun = new Date().toISOString().slice(0, 10);

      container.innerHTML = `
        <div class="card">
          <h3>Gün Sonu Kasa Kapanışı</h3>
          <div class="form-grid">
            <div><label>Tarih</label><input id="zr-tarih" type="date" value="${bugun}" /></div>
          </div>
          <div id="zr-ozet"></div>
        </div>
        <div class="card">
          <h3>Kapanış Geçmişi</h3>
          <table>
            <thead><tr><th>Tarih</th><th>Şube</th><th class="num">Sistem Toplamı</th><th class="num">Sayılan Nakit</th><th class="num">Fark</th><th>Kapatan</th></tr></thead>
            <tbody id="zr-gecmis"></tbody>
          </table>
        </div>
      `;

      const ozetYukle = async () => {
        const tarih = document.getElementById('zr-tarih').value;
        const ozet = await Api.get('/api/kasa-kapanislari/ozet?tarih=' + tarih);
        const ozetDiv = document.getElementById('zr-ozet');

        if (ozet.zaten_kapatildi) {
          ozetDiv.innerHTML = `<div class="empty-state">${tarih} için kasa zaten kapatılmış. Geçmiş listesinden detayları görebilirsiniz.</div>`;
          return;
        }

        ozetDiv.innerHTML = `
          <div class="stat-row" style="margin-top:12px">
            <div class="stat-tile c-mint"><div class="label">Nakit (Sistem)</div><div class="value">${UI.tl(ozet.nakit)}</div></div>
            <div class="stat-tile c-lilac"><div class="label">Kredi Kartı</div><div class="value">${UI.tl(ozet.kart)}</div></div>
            <div class="stat-tile c-amber"><div class="label">SGK</div><div class="value">${UI.tl(ozet.sgk)}</div></div>
            <div class="stat-tile c-rose"><div class="label">Veresiye Satış</div><div class="value">${UI.tl(ozet.veresiye)}</div></div>
            ${ozet.iade > 0 ? `<div class="stat-tile c-amber"><div class="label">İadeler</div><div class="value">-${UI.tl(ozet.iade)}</div></div>` : ''}
            <div class="stat-tile"><div class="label">Toplam Ciro (${ozet.satis_adedi} satış)</div><div class="value">${UI.tl(ozet.toplam)}</div></div>
          </div>
          ${
            ozet.tahsilat > 0
              ? `<p class="form-ipucu">Nakit ve kart tutarlarına veresiye tahsilatları dahildir (nakit ${UI.tl(ozet.tahsilat_nakit)}, kart ${UI.tl(ozet.tahsilat_kart)}).</p>`
              : ''
          }
          <form id="zr-form">
            <div class="form-grid">
              <div><label>Sayılan Nakit Tutarı (TL)</label><input name="nakit_sayilan" type="number" step="0.01" min="0" required /></div>
            </div>
            <div><label>Not (opsiyonel)</label><textarea name="not_metni" rows="2"></textarea></div>
            <button type="submit">Kasayı Kapat</button>
          </form>
        `;

        document.getElementById('zr-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            const sonuc = await Api.post('/api/kasa-kapanislari', {
              tarih,
              nakit_sayilan: Number(fd.get('nakit_sayilan')),
              not_metni: fd.get('not_metni') || null
            });
            const farkMetni =
              sonuc.fark === 0
                ? 'Kasa tam uyuştu.'
                : sonuc.fark > 0
                  ? `Kasada ${UI.tl(sonuc.fark)} fazla var.`
                  : `Kasada ${UI.tl(Math.abs(sonuc.fark))} eksik var.`;
            UI.toast('Kasa kapatıldı. ' + farkMetni, sonuc.fark === 0 ? 'success' : 'error');
            ozetYukle();
            gecmisYukle();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      };

      const gecmisYukle = async () => {
        const rows = await Api.get('/api/kasa-kapanislari');
        document.getElementById('zr-gecmis').innerHTML = rows.length
          ? rows
              .map(
                (k) => `<tr>
                  <td>${k.tarih}</td>
                  <td>${UI.esc(k.sube_adi || '-')}</td>
                  <td class="num">${UI.tl(k.toplam_sistem)}</td>
                  <td class="num">${UI.tl(k.nakit_sayilan)}</td>
                  <td class="num">${k.fark === 0 ? '<span class="badge ok">Tam</span>' : k.fark > 0 ? `<span class="badge warn">+${UI.tl(k.fark)}</span>` : `<span class="badge danger">${UI.tl(k.fark)}</span>`}</td>
                  <td>${UI.esc(k.kapatan || '-')}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Henüz kasa kapanışı yapılmadı</td></tr>';
      };

      document.getElementById('zr-tarih').addEventListener('change', ozetYukle);

      await Promise.all([ozetYukle(), gecmisYukle()]);
    }
  };

  Views.kasaKapanisi = view;
})();
