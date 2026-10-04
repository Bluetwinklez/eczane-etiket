(function () {
  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="card">
          <h3>Veritabanını Dışa Aktar</h3>
          <p style="color:var(--text-muted);font-size:13px">Tüm tablolar (şubeler, kullanıcılar, ilaçlar, satışlar, vb.) tek bir JSON dosyası olarak indirilir.</p>
          <a href="/api/yedekleme/export" download="eczanem-yedek.json"><button type="button">Yedeği İndir</button></a>
        </div>
        <div class="card">
          <h3>Otomatik Günlük Yedekler</h3>
          <p class="form-ipucu">Sunucu çalışırken günde bir kez kendiliğinden yedek alınır ve son 14 yedek saklanır (sunucudaki <code>web/data/yedekler</code> klasörü).</p>
          <button class="secondary" id="oto-simdi">Şimdi Yedek Al</button>
          <table style="margin-top:10px"><thead><tr><th>Dosya</th><th>Tarih</th><th class="num">Boyut</th><th></th></tr></thead><tbody id="oto-liste"></tbody></table>
        </div>
        <div class="card">
          <h3>Yedekten Geri Yükle</h3>
          <p style="color:var(--danger);font-size:13px">Dikkat: bu işlem mevcut tüm verinin üzerine yazar ve geri alınamaz.</p>
          <input type="file" id="yedek-dosya" accept="application/json" />
          <button id="yedek-yukle-btn" class="danger" style="margin-top:10px">Yedeği Geri Yükle</button>
        </div>
      `;

      const otoYenile = async () => {
        const liste = await Api.get('/api/yedekleme/otomatik');
        document.getElementById('oto-liste').innerHTML = liste.length
          ? liste
              .map(
                (y) => `<tr><td>${UI.esc(y.dosya)}</td><td>${UI.tarih(y.tarih)}</td><td class="num">${(y.boyut / 1024).toFixed(1)} KB</td>
                  <td class="actions-col"><a href="/api/yedekleme/otomatik/${encodeURIComponent(y.dosya)}" download><button class="secondary" type="button">İndir</button></a></td></tr>`
              )
              .join('')
          : '<tr><td colspan="4" class="empty-state">Henüz otomatik yedek yok</td></tr>';
      };
      document.getElementById('oto-simdi').addEventListener('click', async () => {
        try {
          const r = await Api.post('/api/yedekleme/otomatik/simdi', {});
          UI.toast(`Yedek alındı: ${r.dosya}`, 'success');
          otoYenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      otoYenile();

      document.getElementById('yedek-yukle-btn').addEventListener('click', async () => {
        const dosyaInput = document.getElementById('yedek-dosya');
        const dosya = dosyaInput.files[0];
        if (!dosya) {
          UI.toast('Lütfen bir yedek dosyası seçin', 'error');
          return;
        }
        if (!(await UI.confirmSil('Mevcut tüm veri silinip yedekteki veriyle degistirilecek. Emin misiniz?'))) return;

        try {
          const metin = await dosya.text();
          const veri = JSON.parse(metin);
          await Api.post('/api/yedekleme/import', veri);
          UI.toast('Yedek geri yüklendi', 'success');
        } catch (err) {
          UI.toast(err.message || 'Dosya okunamadı', 'error');
        }
      });
    }
  };

  Views.yedekleme = view;
})();
