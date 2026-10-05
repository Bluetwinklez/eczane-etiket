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
          <h3>Bulut Yedeği (OneDrive / Google Drive / Dropbox)</h3>
          <p class="form-ipucu">Günlük yedeğin şifreli bir kopyası bilgisayardaki bulut eşitleme klasörüne yazılır; OneDrive / Google Drive / Dropbox programı onu buluta taşır. Bilgisayar bozulsa bile yedek bulutta kalır. Şifre bu bilgisayarda saklanır, yedeğin içine yazılmaz — <b>şifreyi bir yere not edin</b>, geri yüklerken gerekir.</p>
          <div class="form-grid">
            <div style="grid-column:1/-1"><label>Klasör</label><input id="bu-klasor" placeholder="C:\Users\Ad\OneDrive\Eczam Yedekleri" /><div id="bu-adaylar" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"></div></div>
            <div><label>Yedek şifresi</label><input id="bu-sifre" type="password" autocomplete="new-password" placeholder="En az 8 karakter" /><small id="bu-sifre-durum" class="form-ipucu"></small></div>
            <div><label>Saklanacak yedek</label><input id="bu-sakla" type="number" min="1" max="365" /></div>
            <div style="align-self:end"><label style="font-weight:400"><input type="checkbox" id="bu-aktif" style="width:auto" /> Bulut yedeği açık</label></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button id="bu-kaydet">Kaydet</button><button class="secondary" id="bu-simdi">Şimdi yedek al ve buluta yaz</button><span id="bu-son" class="form-ipucu" style="align-self:center;margin:0"></span></div>
          <div id="bu-dosyalar" style="margin-top:8px"></div>
        </div>
        <div class="card">
          <h3>Yedekten Geri Yükle</h3>
          <p style="color:var(--danger);font-size:13px">Dikkat: bu işlem mevcut tüm verinin üzerine yazar ve geri alınamaz.</p>
          <input type="file" id="yedek-dosya" accept=".json,.gz,.eczam,application/json" />
          <input type="password" id="yedek-sifre" placeholder="Şifreli (.eczam) yedekse şifresi" autocomplete="off" style="margin-top:8px;max-width:320px" />
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
          const sifre = document.getElementById('yedek-sifre').value;
          const yanit = await fetch('/api/yedekleme/import-dosya', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', ...(sifre ? { 'X-Yedek-Sifre': encodeURIComponent(sifre) } : {}) },
            body: await dosya.arrayBuffer()
          });
          const v = await yanit.json();
          if (!yanit.ok) throw new Error(v.error || 'Geri yüklenemedi');
          UI.toast('Yedek geri yüklendi', 'success');
        } catch (err) {
          UI.toast(err.message || 'Dosya okunamadı', 'error');
        }
      });

      const buluCiz = async () => {
        const b = await Api.get('/api/yedekleme/bulut');
        document.getElementById('bu-klasor').value = b.klasor || '';
        document.getElementById('bu-sakla').value = b.sakla || 30;
        document.getElementById('bu-aktif').checked = b.aktif;
        document.getElementById('bu-sifre-durum').textContent = b.sifre_var ? 'Şifre kayıtlı (değiştirmek için yenisini yazın)' : 'Şifre yok: yedek şifresiz (gzip) yazılır';
        document.getElementById('bu-adaylar').innerHTML = b.adaylar.length
          ? `<span class="form-ipucu" style="margin:0">Bulunan klasörler:</span>${b.adaylar.map((a) => `<button type="button" class="secondary" data-klasor="${UI.esc(a.yol)}">${UI.esc(a.ad)}</button>`).join('')}`
          : '<span class="form-ipucu" style="margin:0">Bu bilgisayarda OneDrive / Google Drive / Dropbox klasörü bulunamadı; programını kurup klasör yolunu yazın.</span>';
        document.getElementById('bu-son').textContent = b.son ? `Son: ${UI.tarih(b.son.tarih)} · ${b.son.durum === 'tamam' ? b.son.dosya : 'HATA: ' + b.son.mesaj}` : '';
        document.getElementById('bu-dosyalar').innerHTML = b.dosyalar.length
          ? `<small class="form-ipucu">Klasördeki yedekler: ${b.dosyalar.map((d) => `${UI.esc(d.dosya)} (${(d.boyut / 1024).toFixed(0)} KB)`).join(', ')}</small>`
          : '';
      };
      document.getElementById('bu-adaylar').addEventListener('click', (e) => {
        const k = e.target.closest('[data-klasor]');
        if (k) document.getElementById('bu-klasor').value = k.dataset.klasor;
      });
      document.getElementById('bu-kaydet').addEventListener('click', async () => {
        try {
          const govde = { klasor: document.getElementById('bu-klasor').value, sakla: Number(document.getElementById('bu-sakla').value), aktif: document.getElementById('bu-aktif').checked };
          const sifre = document.getElementById('bu-sifre').value;
          if (sifre) govde.sifre = sifre;
          await Api.put('/api/yedekleme/bulut', govde);
          document.getElementById('bu-sifre').value = '';
          UI.toast('Bulut yedeği ayarı kaydedildi', 'success');
          buluCiz();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('bu-simdi').addEventListener('click', async () => {
        try {
          const r = await Api.post('/api/yedekleme/otomatik/simdi', {});
          if (!r.bulut) UI.toast('Yerel yedek alındı; bulut yedeği kapalı', 'error');
          else if (r.bulut.durum === 'tamam') UI.toast(`Buluta yazıldı: ${r.bulut.dosya}`, 'success');
          else UI.toast('Bulut kopyası yazılamadı: ' + r.bulut.mesaj, 'error');
          otoYenile();
          buluCiz();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      buluCiz();
    }
  };

  Views.yedekleme = view;
})();
