(function () {
  const DURUM_ROZETI = {
    gonderildi: '<span class="badge ok">Gönderildi</span>',
    simule: '<span class="badge muted">Simüle</span>',
    hata: '<span class="badge danger">Hata</span>',
    bekliyor: '<span class="badge warn">Bekliyor</span>'
  };

  const view = {
    async render(container) {
      const musteriler = await Api.get('/api/musteriler');

      container.innerHTML = `
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
    }
  };

  Views.bildirimler = view;
})();
