(function () {
  const DURUM_ROZETI = {
    gonderildi: '<span class="badge ok">Gönderildi</span>',
    simule: '<span class="badge muted">Simüle</span>',
    hata: '<span class="badge danger">Hata</span>',
    bekliyor: '<span class="badge warn">Bekliyor</span>'
  };

  const view = {
    async render(container) {
      const [musteriler, segmentler] = await Promise.all([Api.get('/api/musteriler'), Api.get('/api/bildirimler/toplu/segmentler')]);

      container.innerHTML = `
        <div class="card">
          <h3>Toplu Mesaj</h3>
          <p class="form-ipucu">Yalnızca müşteri kartında <b>ticari ileti onayı (İYS)</b> işaretli olan ve telefonu/e-postası kayıtlı müşterilere gönderilir. Mesajda {ad} ve {adsoyad} kullanılabilir.</p>
          <form id="toplu-form" class="form-grid">
            <div><label>Alıcı Grubu</label><select name="segment">${segmentler.map((s) => `<option value="${s.kod}">${UI.esc(s.ad)}</option>`).join('')}</select></div>
            <div><label>Kanal</label><select name="kanal"><option value="sms">SMS</option><option value="email">E-posta</option></select></div>
            <div style="grid-column:1/-1"><label>Mesaj <span class="form-ipucu" id="toplu-sayac"></span></label><textarea name="mesaj" rows="3" placeholder="Merhaba {ad}, dermokozmetik ürünlerde %15 indirim başladı!"></textarea></div>
            <div><button type="button" class="secondary" id="toplu-onizle">Önizle</button> <button type="submit" id="toplu-gonder" disabled>Gönder</button></div>
          </form>
          <div id="toplu-sonuc"></div>
        </div>
        <div class="card">
          <h3>Müşteriye Hatırlatma Gönder</h3>
          <p style="color:#6b7873;font-size:13px">
            E-posta gönderimi sunucuda SMTP ayarı (SMTP_HOST/SMTP_USER/SMTP_PASS) tanımlıysa gerçekleşir;
            aksi halde ve SMS kanalında mesaj "simüle" olarak kayda geçer.
          </p>
          <form id="bildirim-form">
            <div class="form-grid">
              <div>
                <label>Müşteri</label>
                <select name="musteri_id" required>
                  ${musteriler.map((m) => `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label>Kanal</label>
                <select name="kanal">
                  <option value="email">E-posta</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            </div>
            <div><label>Mesaj</label><textarea name="mesaj" rows="2" required placeholder="örn. İlacınız hazır, eczaneden teslim alabilirsiniz."></textarea></div>
            <button type="submit">Gönder</button>
          </form>
        </div>
        <div class="card">
          <h3>Bildirim Geçmişi</h3>
          <table>
            <thead><tr><th>Tarih</th><th>Müşteri</th><th>Kanal</th><th>Mesaj</th><th>Durum</th></tr></thead>
            <tbody id="bildirim-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        const rows = await Api.get('/api/bildirimler');
        document.getElementById('bildirim-tbody').innerHTML = rows.length
          ? rows
              .map(
                (b) => `<tr>
                  <td>${UI.tarih(b.tarih)}</td>
                  <td>${UI.esc(b.musteri_adi || '-')}</td>
                  <td>${b.kanal}</td>
                  <td>${UI.esc(b.mesaj)}</td>
                  <td>${DURUM_ROZETI[b.durum] || b.durum}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Bildirim kaydı yok</td></tr>';
      };

      document.getElementById('bildirim-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await Api.post('/api/bildirimler', {
            musteri_id: Number(fd.get('musteri_id')),
            kanal: fd.get('kanal'),
            mesaj: fd.get('mesaj')
          });
          UI.toast('Bildirim oluşturuldu', 'success');
          e.target.reset();
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });

      await yenile();

      const tf = document.getElementById('toplu-form');
      const tGonder = document.getElementById('toplu-gonder');
      const govde = (onizleme) => ({ segment: tf.segment.value, kanal: tf.kanal.value, mesaj: tf.mesaj.value, onizleme });
      tf.addEventListener('input', () => {
        tGonder.disabled = true;
        const n = tf.mesaj.value.length;
        document.getElementById('toplu-sayac').textContent = tf.kanal.value === 'sms' ? `${n} karakter · ${Math.ceil(n / 153) || 1} SMS` : `${n} karakter`;
      });
      document.getElementById('toplu-onizle').addEventListener('click', async () => {
        try {
          const r = await Api.post('/api/bildirimler/toplu', govde(true));
          document.getElementById('toplu-sonuc').innerHTML = `<p><b>${r.alici_sayisi}</b> alıcı${r.ornek_alicilar.length ? ': ' + r.ornek_alicilar.map(UI.esc).join(', ') + (r.alici_sayisi > 5 ? '…' : '') : ''}</p>
            <p class="form-ipucu">Örnek mesaj: “${UI.esc(r.ornek_mesaj)}”</p>`;
          tGonder.disabled = r.alici_sayisi === 0;
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      tf.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!window.confirm('Mesaj gruptaki tüm onaylı müşterilere gönderilecek. Emin misiniz?')) return;
        try {
          const r = await Api.post('/api/bildirimler/toplu', govde(false));
          UI.toast(`${r.alici_sayisi} müşteriye gönderildi (${Object.entries(r.sonuc).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')})`, 'success');
          view.render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  };

  Views.bildirimler = view;
})();
