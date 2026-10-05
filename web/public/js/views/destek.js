(function () {
  const DURUM_METNI = {
    guncel: ['Program güncel', 'ok'],
    yeni_surum_var: ['Yeni sürüm var: masaüstündeki “Eczam Güncelle” kısayoluna çift tıklayın', 'warn'],
    kontrol_edilemedi: ['Güncelleme kontrol edilemedi', 'muted'],
    bilinmiyor: ['Güncelleme durumu bilinmiyor', 'muted']
  };

  function kopyala(metin, alan) {
    // http ile yerel agdan acildiginda panoya yazma izni olmayabilir; o zaman metin secilip eski yontem denenir
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(metin);
    alan.focus();
    alan.select();
    return document.execCommand('copy') ? Promise.resolve() : Promise.reject(new Error('Kopyalanamadı'));
  }

  const view = {
    async render(container, ctx) {
      const yonetici = ['admin', 'eczaci'].includes(ctx.user.rol);
      container.innerHTML = `
        <div class="card">
          <h3 style="margin-top:0">Bir sorun mu var?</h3>
          <p class="form-ipucu">Ne yaparken ne olduğunu kısaca yazın, sonra <b>Raporu kopyala</b>'ya basın ve kopyalanan metni destek sohbetine yapıştırın. Rapor; program sürümünü, son hataları ve hangi sayfada olduğunuzu içerir. Şifre ve müşteri bilgisi eklenmez.</p>
          <label>Sorunu anlatın</label>
          <textarea id="ds-anlat" rows="4" placeholder="Örn. Satış ekranında karekod okutunca ‘…’ uyarısı çıktı, satış tamamlanmadı."></textarea>
          <div class="modal-actions"><button id="ds-kopyala">Raporu kopyala</button></div>
          <textarea id="ds-rapor" rows="12" readonly style="font-family:monospace;font-size:12px;margin-top:10px"></textarea>
        </div>
        <div class="card" style="margin-top:16px" id="ds-surum"><span class="form-ipucu">Sürüm bilgisi yükleniyor…</span></div>`;

      const surum = await Api.get('/api/sistem/surum').catch(() => ({}));
      const [rapor, guncelleme] = yonetici
        ? await Promise.all([Api.get('/api/sistem/hata-raporu').catch(() => null), Api.get('/api/sistem/guncelleme').catch(() => null)])
        : [null, null];

      const d = guncelleme && DURUM_METNI[guncelleme.durum];
      document.getElementById('ds-surum').innerHTML = `
        <h3 style="margin-top:0">Program</h3>
        <table><tbody>
          <tr><td style="color:var(--text-muted);width:34%">Sürüm</td><td>${UI.esc(surum.surum || '-')}${surum.kisa ? ` <span class="badge muted">${UI.esc(surum.kisa)}</span>` : ''}</td></tr>
          <tr><td style="color:var(--text-muted)">Node.js</td><td>${UI.esc(surum.node || '-')} · ${UI.esc(surum.platform || '')}</td></tr>
          ${d ? `<tr><td style="color:var(--text-muted)">Güncelleme</td><td><span class="badge ${d[1]}">${UI.esc(d[0])}</span>${guncelleme.uzak && guncelleme.durum === 'yeni_surum_var' ? `<br><small class="form-ipucu">Son değişiklik: ${UI.esc(guncelleme.uzak.mesaj || '')}</small>` : ''}</td></tr>` : ''}
          ${rapor ? `<tr><td style="color:var(--text-muted)">Kayıtlı hata</td><td>${rapor.hatalar.length ? `son ${rapor.hatalar.length} kayıt rapora eklenir` : 'yok'}</td></tr>` : ''}
        </tbody></table>`;

      const raporOlustur = () => {
        const satirlar = [
          '=== ECZAM HATA RAPORU ===',
          `Zaman: ${new Date().toLocaleString('tr-TR')}`,
          `Sürüm: ${surum.surum || '-'} (${surum.kisa || 'commit yok'}) · Node ${surum.node || '-'} · ${surum.platform || ''}`,
          `Kullanıcı rolü: ${ctx.user.rol} · Tarayıcı: ${navigator.userAgent}`,
          guncelleme ? `Güncelleme: ${guncelleme.durum}${guncelleme.uzak ? ` (GitHub ${guncelleme.uzak.kisa})` : ''}` : null,
          '',
          '--- Kullanıcının anlattığı ---',
          document.getElementById('ds-anlat').value.trim() || '(boş)',
          '',
          '--- Bu oturumdaki tarayıcı hataları ---',
          ...(window.EczamHatalar ? window.EczamHatalar.liste() : []).map((h) => `${h.zaman} ${h.sayfa} ${h.mesaj}${h.yigin ? ' @ ' + h.yigin : ''}`),
          '',
          '--- Sunucu hata günlüğü (son kayıtlar) ---',
          ...(rapor ? rapor.hatalar.map((h) => `${h.zaman} [${h.kaynak}] ${h.yol || h.sayfa || ''} ${h.mesaj}${h.yigin ? ' @ ' + h.yigin : ''}`) : ['(yalnızca eczacı/yönetici görür)'])
        ].filter((s) => s !== null);
        return satirlar.join('\n');
      };
      const alan = document.getElementById('ds-rapor');
      alan.value = raporOlustur();
      document.getElementById('ds-anlat').addEventListener('input', () => (alan.value = raporOlustur()));
      document.getElementById('ds-kopyala').addEventListener('click', async () => {
        alan.value = raporOlustur();
        try {
          await kopyala(alan.value, alan);
          UI.toast('Rapor kopyalandı; destek sohbetine yapıştırın', 'success');
        } catch (err) {
          alan.focus();
          alan.select();
          UI.toast('Otomatik kopyalanamadı; seçili metni Ctrl+C ile kopyalayın', 'error');
        }
      });
    }
  };

  Views.destek = view;
})();
