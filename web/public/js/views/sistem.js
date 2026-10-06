// Sistem durumu (yonetici): surum, calisma suresi, veritabani boyutu, tablo kayit
// sayilari, son otomatik yedek ve aktif oturumlar.
(function () {
  function boyutYaz(bayt) {
    if (bayt >= 1024 * 1024) return (bayt / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB';
    return Math.round(bayt / 1024).toLocaleString('tr-TR') + ' KB';
  }
  function sureYaz(sn) {
    const g = Math.floor(sn / 86400);
    const s = Math.floor((sn % 86400) / 3600);
    const d = Math.floor((sn % 3600) / 60);
    return [g && `${g} gün`, s && `${s} sa`, `${d} dk`].filter(Boolean).join(' ');
  }

  const view = {
    async render(container) {
      const d = await Api.get('/api/sistem/durum');
      const yedekYasi = d.son_yedek ? Math.floor((Date.now() - new Date(d.son_yedek.tarih).getTime()) / 3600000) : null;
      container.innerHTML = `
        <div class="stat-row">
          <div class="stat-tile c-mint"><div class="label">Sürüm</div><div class="value">v${UI.esc(d.surum)}</div></div>
          <div class="stat-tile"><div class="label">Çalışma Süresi</div><div class="value">${sureYaz(d.calisma_suresi_sn)}</div></div>
          <div class="stat-tile"><div class="label">Veritabanı</div><div class="value">${boyutYaz(d.veritabani.boyut_bayt)}</div></div>
          <div class="stat-tile ${yedekYasi === null || yedekYasi > 26 ? 'c-rose' : ''}"><div class="label">Son Otomatik Yedek</div>
            <div class="value" style="font-size:20px">${d.son_yedek ? `${yedekYasi} saat önce` : 'Yok'}</div></div>
        </div>
        <div class="card">
          <h3>Sunucu</h3>
          <table><tbody>
            <tr><td>Node.js</td><td>${UI.esc(d.node)} (${UI.esc(d.platform)})</td></tr>
            <tr><td>Sunucu saati</td><td>${new Date(d.sunucu_saati).toLocaleString('tr-TR')}</td></tr>
            <tr><td>Veritabanı dosyası</td><td>${UI.esc(d.veritabani.yol)} · ${d.veritabani.toplam_kayit.toLocaleString('tr-TR')} kayıt</td></tr>
            <tr><td>Aktif oturum</td><td>${d.aktif_oturum}</td></tr>
            <tr><td>Yedek dosyası</td><td>${d.yedek_sayisi} adet${d.son_yedek ? ` · son: ${UI.esc(d.son_yedek.dosya)} (${boyutYaz(d.son_yedek.boyut)})` : ''}</td></tr>
            <tr><td>E-posta (SMTP)</td><td>${d.smtp ? '<span class="badge ok">Yapılandırıldı</span>' : '<span class="badge muted">Yok — e-postalar simüle edilir</span>'}</td></tr>
          </tbody></table>
          ${yedekYasi === null || yedekYasi > 26 ? '<p class="form-ipucu">Son 26 saatte otomatik yedek alınmamış. <a href="#yedekleme">Yedekleme</a> sayfasından şimdi yedek alabilirsiniz.</p>' : ''}
        </div>
        <div class="card" id="gs-kart">
          <h3>Gün sonu özeti e-postası</h3>
          <p class="form-ipucu">Her akşam ayarlanan saatte günün hasılatı, kârı, kasa dağılımı, en çok satanlar ve dikkat gerektiren işler e-postayla gönderilir${d.smtp ? '' : ' (SMTP ayarlanmadığı için şu an yalnızca önizleme yapılabilir; .env dosyasına SMTP_HOST, SMTP_USER, SMTP_PASS girin)'}.</p>
          <div class="form-grid">
            <div><label>E-posta adresi</label><input id="gs-adres" placeholder="ornek@eposta.com" /></div>
            <div><label>Gönderim saati</label><input id="gs-saat" type="time" /></div>
            <div style="align-self:end"><label style="font-weight:400"><input type="checkbox" id="gs-aktif" style="width:auto" /> Her gün otomatik gönder</label></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button id="gs-kaydet">Kaydet</button><button class="secondary" id="gs-onizle">Bugünün özetini göster</button><button class="secondary" id="gs-gonder">Şimdi gönder</button>
            <span id="gs-son" class="form-ipucu" style="margin:0;align-self:center"></span>
          </div>
          <div id="gs-onizleme" style="margin-top:12px"></div>
        </div>
        <div class="card">
          <h3>Tablolar</h3>
          <table><thead><tr><th>Tablo</th><th class="num">Kayıt</th></tr></thead><tbody>
            ${d.tablolar.map((t) => `<tr><td><code>${UI.esc(t.tablo)}</code></td><td class="num">${t.kayit.toLocaleString('tr-TR')}</td></tr>`).join('')}
          </tbody></table>
        </div>`;

      const gs = await Api.get('/api/gun-sonu/ayar');
      document.getElementById('gs-adres').value = gs.adres || '';
      document.getElementById('gs-saat').value = gs.saat || '21:00';
      document.getElementById('gs-aktif').checked = gs.aktif;
      const DURUM = { gonderildi: 'gönderildi', simule: 'simüle edildi (SMTP yok)', hata: 'hata' };
      document.getElementById('gs-son').textContent = gs.son_gonderim ? `Son: ${gs.son_gonderim} · ${DURUM[gs.son_durum] || ''}` : '';
      document.getElementById('gs-kaydet').addEventListener('click', async () => {
        try {
          await Api.put('/api/gun-sonu/ayar', { adres: document.getElementById('gs-adres').value, saat: document.getElementById('gs-saat').value, aktif: document.getElementById('gs-aktif').checked });
          UI.toast('Gün sonu özeti ayarı kaydedildi', 'success');
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('gs-onizle').addEventListener('click', async () => {
        try {
          const o = await Api.get('/api/gun-sonu/onizleme');
          // E-posta HTML'i sunucuda kacislanarak uretilir; ayri bir cercevede gosterilir
          const cerceve = document.createElement('iframe');
          cerceve.setAttribute('sandbox', '');
          cerceve.style.cssText = 'width:100%;height:420px;border:1px solid var(--border);border-radius:10px;background:#fff';
          cerceve.srcdoc = `<p style="font:13px Arial;color:#555">Konu: ${o.konu.replace(/[<>&]/g, '')}</p>${o.html}`;
          const hedef = document.getElementById('gs-onizleme');
          hedef.innerHTML = '';
          hedef.appendChild(cerceve);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('gs-gonder').addEventListener('click', async () => {
        try {
          const r = await Api.post('/api/gun-sonu/gonder', { adres: document.getElementById('gs-adres').value });
          UI.toast(r.durum === 'gonderildi' ? 'Özet e-postayla gönderildi' : r.mesaj || 'Gönderilemedi', r.durum === 'gonderildi' ? 'success' : 'error');
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  };

  window.Views = window.Views || {};
  window.Views.sistem = view;
})();
