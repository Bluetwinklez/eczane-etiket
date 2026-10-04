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
          <div class="kart-bas"><h3>Gün İçi Kasa Hareketleri</h3><button type="button" class="secondary" id="x-raporu-btn">🧾 X Raporu (ara rapor)</button></div>
          <form id="kh-form" class="form-grid">
            <div><label>Tip</label><select name="tip"><option value="giris">Kasaya giriş (bozuk para, avans iadesi)</option><option value="cikis">Kasadan çıkış (fatura ödemesi, avans, banka)</option></select></div>
            <div><label>Tutar (TL)</label><input name="tutar" type="number" step="0.01" min="0.01" required /></div>
            <div><label>Açıklama</label><input name="aciklama" required placeholder="örn. Bozuk para, kargo ödemesi" /></div>
            <div style="align-self:end"><button type="submit">Ekle</button></div>
          </form>
          <p class="form-ipucu">Bu hareketler ciroya yansımaz, yalnızca kasada olması gereken nakdi değiştirir.</p>
          <table><thead><tr><th>Saat</th><th>Tip</th><th class="num">Tutar</th><th>Açıklama</th><th>Kaydeden</th><th></th></tr></thead><tbody id="kh-tbody"></tbody></table>
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
            ozet.kasa_giris || ozet.kasa_cikis
              ? `<p class="form-ipucu">Beklenen nakde gün içi kasa hareketleri dahildir: giriş ${UI.tl(ozet.kasa_giris)}, çıkış ${UI.tl(ozet.kasa_cikis)}.</p>`
              : ''
          }
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

      const hareketleriYukle = async () => {
        const liste = await Api.get('/api/kasa-kapanislari/hareketler');
        document.getElementById('kh-tbody').innerHTML = liste.length
          ? liste
              .map(
                (h) => `<tr><td>${UI.tarih(h.tarih).slice(-5)}</td>
                  <td>${h.tip === 'giris' ? '<span class="badge ok">Giriş</span>' : '<span class="badge warn">Çıkış</span>'}</td>
                  <td class="num">${UI.tl(h.tutar)}</td><td>${UI.esc(h.aciklama)}</td><td>${UI.esc(h.kullanici_adi || '-')}</td>
                  <td class="actions-col"><button class="secondary" data-kh-sil="${h.id}">Sil</button></td></tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Bugün kasa hareketi yok</td></tr>';
      };
      document.getElementById('kh-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await Api.post('/api/kasa-kapanislari/hareketler', { tip: f.tip.value, tutar: Number(f.tutar.value), aciklama: f.aciklama.value });
          f.reset();
          UI.toast('Kasa hareketi eklendi', 'success');
          await Promise.all([hareketleriYukle(), ozetYukle()]);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('kh-tbody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-kh-sil]');
        if (!btn || !window.confirm('Bu kasa hareketi silinsin mi?')) return;
        try {
          await Api.del('/api/kasa-kapanislari/hareketler/' + btn.dataset.khSil);
          await Promise.all([hareketleriYukle(), ozetYukle()]);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('x-raporu-btn').addEventListener('click', async () => {
        try {
          const x = await Api.get('/api/kasa-kapanislari/x-raporu');
          const modal = UI.openModal(`
            <div class="modal-genis yazdirilabilir">
              <h3>X Raporu — ${x.tarih} ${new Date(x.olusturma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</h3>
              <p class="form-ipucu">Ara rapordur; kasayı kapatmaz.${x.zaten_kapatildi ? ' (Bugünün kasası kapatılmış.)' : ''}</p>
              <table><tbody>
                <tr><td>Satış adedi</td><td class="num">${x.satis_adedi}</td></tr>
                <tr><td>Nakit (kasada olması gereken)</td><td class="num">${UI.tl(x.nakit)}</td></tr>
                <tr><td>Kredi kartı</td><td class="num">${UI.tl(x.kart)}</td></tr>
                <tr><td>SGK</td><td class="num">${UI.tl(x.sgk)}</td></tr>
                <tr><td>Veresiye</td><td class="num">${UI.tl(x.veresiye)}</td></tr>
                <tr><td>İade</td><td class="num">-${UI.tl(x.iade)}</td></tr>
                <tr><td>Kasa giriş / çıkış</td><td class="num">${UI.tl(x.kasa_giris)} / ${UI.tl(x.kasa_cikis)}</td></tr>
                <tr><td><b>Toplam ciro</b></td><td class="num"><b>${UI.tl(x.toplam)}</b></td></tr>
              </tbody></table>
              <h3 style="margin-top:16px">Saatlik</h3>
              <table><thead><tr><th>Saat</th><th class="num">Satış</th><th class="num">Ciro</th></tr></thead><tbody>
                ${x.saatlik.map((r) => `<tr><td>${String(r.saat).padStart(2, '0')}:00</td><td class="num">${r.adet}</td><td class="num">${UI.tl(r.ciro)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">Satış yok</td></tr>'}
              </tbody></table>
              <h3 style="margin-top:16px">Personel</h3>
              <table><thead><tr><th>Personel</th><th class="num">Satış</th><th class="num">Ciro</th></tr></thead><tbody>
                ${x.personel.map((r) => `<tr><td>${UI.esc(r.personel || '-')}</td><td class="num">${r.adet}</td><td class="num">${UI.tl(r.ciro)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">Satış yok</td></tr>'}
              </tbody></table>
            </div>
            <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button><button type="button" data-action="yazdir">Yazdır</button></div>
          `);
          modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
          modal.querySelector('[data-action="yazdir"]').addEventListener('click', () => window.print());
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      hareketleriYukle();
    }
  };

  Views.kasaKapanisi = view;
})();
