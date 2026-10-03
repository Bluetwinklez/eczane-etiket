(function () {
  const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const GUN_TAM = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function ayAdi(ay) {
    const [y, a] = ay.split('-').map(Number);
    return `${AY_ADLARI[a - 1]} ${y}`;
  }

  function hedefKarti(h, yazabilir) {
    const yuzde = h.hedef ? Math.min(100, h.yuzde) : 0;
    const renk = !h.hedef ? 'var(--border)' : h.yuzde >= 100 ? 'var(--success)' : h.yuzde >= 70 ? 'var(--primary)' : 'var(--warning)';
    return `
      <div class="card">
        <h3>🎯 ${ayAdi(h.ay)} Satış Hedefi</h3>
        ${
          h.hedef
            ? `<div class="hedef-cubuk"><div style="width:${yuzde}%;background:${renk}"></div></div>
               <div class="stat-row" style="margin-top:12px">
                 <div class="stat-tile c-mint"><div class="label">Gerçekleşen</div><div class="value">${UI.tl(h.gerceklesen)}</div></div>
                 <div class="stat-tile c-lilac"><div class="label">Hedef (%${h.yuzde})</div><div class="value">${UI.tl(h.hedef)}</div></div>
                 <div class="stat-tile c-amber"><div class="label">Kalan · ${h.kalan_gun} gün</div><div class="value">${UI.tl(h.kalan_tutar)}</div></div>
                 ${h.gunluk_gereken != null ? `<div class="stat-tile c-rose"><div class="label">Günlük Gereken</div><div class="value">${UI.tl(h.gunluk_gereken)}</div></div>` : ''}
               </div>
               ${h.ay_sonu_tahmini != null ? `<p class="form-ipucu">Bu tempoyla ay sonu tahmini: <b>${UI.tl(h.ay_sonu_tahmini)}</b> (${h.ay_sonu_tahmini >= h.hedef ? 'hedef aşılıyor 🎉' : 'hedefin altında'})</p>` : ''}`
            : `<p class="form-ipucu">Bu ay için hedef belirlenmedi. Gerçekleşen: <b>${UI.tl(h.gerceklesen)}</b></p>`
        }
        ${
          yazabilir
            ? `<form id="hedef-form" class="toolbar" style="margin:8px 0 0">
                <input name="hedef_tutar" type="number" min="1" step="any" placeholder="Hedef tutar (TL)" value="${h.hedef || ''}" style="max-width:220px" />
                <button type="submit">Hedefi Kaydet</button>
              </form>`
            : ''
        }
      </div>`;
  }

  function haritaHtml(veri, olcu) {
    let max = 0;
    for (const satir of veri.matris) for (const h of satir) max = Math.max(max, h[olcu]);
    // Calisma saatleri disinda hic satis yoksa o sutunlar gizlenir
    const doluSaatler = [];
    for (let s = 0; s < 24; s++) if (veri.matris.some((r) => r[s].adet > 0)) doluSaatler.push(s);
    const saatler = doluSaatler.length ? Array.from({ length: doluSaatler[doluSaatler.length - 1] - doluSaatler[0] + 1 }, (_, i) => doluSaatler[0] + i) : [];
    if (!saatler.length) return '<div class="empty-state">Bu dönemde satış yok</div>';
    const hucre = (h, gun, saat) => {
      const oran = max ? h[olcu] / max : 0;
      const deger = olcu === 'ciro' ? UI.tl(h.ciro) : `${h.adet} satış`;
      return `<div class="isi-hucre" style="--oran:${oran.toFixed(3)}" title="${GUN_TAM[gun]} ${String(saat).padStart(2, '0')}:00 · ${deger}">${h.adet || ''}</div>`;
    };
    return `
      <div class="isi-harita" style="grid-template-columns: 44px repeat(${saatler.length}, 1fr)">
        <div></div>${saatler.map((s) => `<div class="isi-baslik">${String(s).padStart(2, '0')}</div>`).join('')}
        ${veri.matris.map((satir, g) => `<div class="isi-gun">${GUNLER[g]}</div>${saatler.map((s) => hucre(satir[s], g, s)).join('')}`).join('')}
      </div>`;
  }

  const view = {
    async render(container, ctx) {
      const yazabilir = ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
      const [aktif, gecmis] = await Promise.all([Api.get('/api/hedefler/aktif'), Api.get('/api/hedefler')]);
      container.innerHTML = `
        ${hedefKarti(aktif, yazabilir)}
        <div class="card">
          <h3>Geçmiş Aylar</h3>
          <table><thead><tr><th>Ay</th><th class="num">Hedef</th><th class="num">Gerçekleşen</th><th>Durum</th></tr></thead>
          <tbody>${gecmis
            .filter((h) => h.hedef || h.gerceklesen)
            .map(
              (h) => `<tr><td>${ayAdi(h.ay)}</td><td class="num">${h.hedef ? UI.tl(h.hedef) : '-'}</td><td class="num">${UI.tl(h.gerceklesen)}</td>
                <td>${h.hedef ? `<span class="badge ${h.yuzde >= 100 ? 'ok' : h.yuzde >= 70 ? 'warn' : 'danger'}">%${h.yuzde}</span>` : '-'}</td></tr>`
            )
            .join('') || '<tr><td colspan="4" class="empty-state">Kayıt yok</td></tr>'}</tbody></table>
        </div>
        ${
          yazabilir
            ? `<div class="card">
                <div class="toolbar" style="margin:0 0 10px">
                  <h3 style="margin:0">Saatlik Yoğunluk Haritası</h3>
                  <div class="spacer"></div>
                  <select id="isi-gun" style="max-width:140px"><option value="7">Son 7 gün</option><option value="30" selected>Son 30 gün</option><option value="90">Son 90 gün</option></select>
                  <select id="isi-olcu" style="max-width:140px"><option value="adet">Satış adedi</option><option value="ciro">Ciro</option></select>
                </div>
                <div id="isi-icerik"></div>
                <p class="form-ipucu" id="isi-ozet"></p>
              </div>`
            : ''
        }
      `;

      const form = document.getElementById('hedef-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await Api.put('/api/hedefler', { ay: aktif.ay, hedef_tutar: form.hedef_tutar.value === '' ? null : Number(form.hedef_tutar.value) });
            UI.toast('Hedef kaydedildi', 'success');
            view.render(container, ctx);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      }
      if (!yazabilir) return;
      const haritaYenile = async () => {
        const veri = await Api.get('/api/raporlar/yogunluk?gun=' + document.getElementById('isi-gun').value);
        document.getElementById('isi-icerik').innerHTML = haritaHtml(veri, document.getElementById('isi-olcu').value);
        document.getElementById('isi-ozet').textContent = veri.en_yogun
          ? `En yoğun zaman: ${GUN_TAM[veri.en_yogun.gun]} ${String(veri.en_yogun.saat).padStart(2, '0')}:00-${String(veri.en_yogun.saat + 1).padStart(2, '0')}:00 (${veri.en_yogun.adet} satış). Saatler Türkiye saatidir; vardiya planlarken kullanın.`
          : '';
      };
      document.getElementById('isi-gun').addEventListener('change', haritaYenile);
      document.getElementById('isi-olcu').addEventListener('change', haritaYenile);
      haritaYenile();
    }
  };

  Views.analiz = view;
})();
