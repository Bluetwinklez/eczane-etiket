(function () {
  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="card">
          <h3>Veritabanını Dışa Aktar</h3>
          <p style="color:#6b7873;font-size:13px">Tüm tablolar (şubeler, kullanıcılar, ilaçlar, satışlar, vb.) tek bir JSON dosyası olarak indirilir.</p>
          <a href="/api/yedekleme/export" download="eczanem-yedek.json"><button type="button">Yedeği İndir</button></a>
        </div>
        <div class="card">
          <h3>Yedekten Geri Yükle</h3>
          <p style="color:#c0392b;font-size:13px">Dikkat: bu işlem mevcut tüm verinin üzerine yazar ve geri alınamaz.</p>
          <input type="file" id="yedek-dosya" accept="application/json" />
          <button id="yedek-yukle-btn" class="danger" style="margin-top:10px">Yedeği Geri Yükle</button>
        </div>
      `;

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
