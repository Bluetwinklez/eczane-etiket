(function () {
  const ROZET = { ok: 'ok', info: 'muted', warn: 'warn', danger: 'danger' };
  const DURUM = { aktif: ['Aktif', 'ok'], yaklasan: ['Bitiyor', 'warn'], bitti: ['Bitti', 'danger'] };

  function cizgiGrafik(olcumler, tip) {
    const n = olcumler.filter((o) => o.tip === tip).slice(0, 30).reverse();
    if (n.length < 2) return '<p class="form-ipucu">Grafik için en az iki ölçüm gerekir.</p>';
    const W = 560, H = 170, sol = 40, alt = 20, ust = 8;
    const degerler = n.flatMap((o) => [o.deger1, o.deger2]).filter((v) => v != null);
    const en = Math.max(...degerler) * 1.05;
    const enaz = Math.min(...degerler) * 0.9;
    const x = (i) => sol + (i * (W - sol - 10)) / (n.length - 1);
    const y = (v) => ust + (1 - (v - enaz) / (en - enaz || 1)) * (H - ust - alt);
    const cizgi = (alan, renk) => `<polyline fill="none" stroke="${renk}" stroke-width="2.2" points="${n.filter((o) => o[alan] != null).map((o) => `${x(n.indexOf(o)).toFixed(1)},${y(o[alan]).toFixed(1)}`).join(' ')}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:640px" role="img" aria-label="Ölçüm grafiği">
      ${[enaz, (enaz + en) / 2, en].map((v) => `<line x1="${sol}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="3 4"/><text x="${sol - 5}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${Math.round(v)}</text>`).join('')}
      ${cizgi('deger1', 'var(--accent-rose-fg)')}${n.some((o) => o.deger2 != null) ? cizgi('deger2', 'var(--seri-2)') : ''}
      <text x="${sol}" y="${H - 4}" font-size="10" fill="var(--text-muted)">${UI.esc(n[0].tarih.slice(0, 10))}</text>
      <text x="${W - 10}" y="${H - 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${UI.esc(n[n.length - 1].tarih.slice(0, 10))}</text></svg>`;
  }
  const degerMetni = (o, tipler) => `${o.deger1}${o.deger2 != null ? '/' + o.deger2 : ''} ${tipler[o.tip].birim}${o.aclik ? (o.aclik === 'ac' ? ' (açlık)' : ' (tokluk)') : ''}`;

  const view = {
    async render(container, ctx) {
      const yazma = ['admin', 'eczaci'].includes(ctx.user.rol);
      const [musteriler, tipler] = await Promise.all([Api.get('/api/musteriler'), Api.get('/api/takip/olcum-tipleri')]);
      let sekme = 'olcum';
      let musteriId = null;
      let grafikTipi = 'tansiyon';
      try {
        musteriId = Number(sessionStorage.getItem('eczam:takip-musteri')) || null;
        sessionStorage.removeItem('eczam:takip-musteri');
      } catch (e) {
        /* yoksa secim bos baslar */
      }
      const musteriSecenek = (secili) => `<option value="">— müşteri seçin —</option>${musteriler.map((m) => `<option value="${m.id}" ${secili === m.id ? 'selected' : ''}>${UI.esc(m.ad_soyad)}${m.telefon ? ' · ' + UI.esc(m.telefon) : ''}</option>`).join('')}`;

      container.innerHTML = `
        <div class="toolbar" id="ht-sekmeler">
          <button class="secondary" data-sekme="olcum">Ölçümler (tansiyon, şeker…)</button>
          <button class="secondary" data-sekme="rapor">Raporlu ilaçlar</button>
        </div>
        <div id="ht-icerik"></div>
        <p class="form-ipucu">Sağlık verisi yalnızca bu eczane bilgisayarında tutulur (KVKK özel nitelikli veri). Değerlendirmeler dikkat çekmek içindir, tanı yerine geçmez.</p>`;

      const olcumCiz = async () => {
        const hedef = document.getElementById('ht-icerik');
        hedef.innerHTML = `
          <div class="card">
            <div class="form-grid">
              <div><label>Müşteri</label><select id="ht-musteri">${musteriSecenek(musteriId)}</select></div>
            </div>
            ${musteriId ? `<form id="ht-form" class="form-grid" style="margin-top:10px">
              <div><label>Ölçüm</label><select name="tip">${Object.entries(tipler).map(([k, t]) => `<option value="${k}">${t.ad} (${t.birim})</option>`).join('')}</select></div>
              <div><label id="ht-d1-etiket">Büyük tansiyon</label><input name="deger1" inputmode="decimal" required /></div>
              <div id="ht-d2"><label>Küçük tansiyon</label><input name="deger2" inputmode="decimal" /></div>
              <div id="ht-aclik" hidden><label>Zaman</label><select name="aclik"><option value="ac">Açlık</option><option value="tok">Tokluk</option></select></div>
              <div><label>Not</label><input name="notlar" /></div>
              <div><label>&nbsp;</label><button type="submit">Kaydet</button></div>
            </form>` : '<p class="form-ipucu" style="margin-top:8px">Ölçüm girmek için müşteri seçin. Yeni müşteri, Müşteriler sayfasından eklenir.</p>'}
          </div>
          <div id="ht-veri"></div>`;
        document.getElementById('ht-musteri').addEventListener('change', (e) => {
          musteriId = Number(e.target.value) || null;
          olcumCiz();
        });
        if (!musteriId) return;
        const form = document.getElementById('ht-form');
        const tipDegis = () => {
          const t = form.tip.value;
          document.getElementById('ht-d2').hidden = t !== 'tansiyon';
          document.getElementById('ht-aclik').hidden = t !== 'seker';
          document.getElementById('ht-d1-etiket').textContent = t === 'tansiyon' ? 'Büyük tansiyon' : `${tipler[t].ad} (${tipler[t].birim})`;
        };
        form.tip.addEventListener('change', tipDegis);
        tipDegis();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            const o = await Api.post('/api/takip/olcumler', { musteri_id: musteriId, tip: fd.get('tip'), deger1: fd.get('deger1'), deger2: fd.get('deger2') || null, aclik: fd.get('aclik'), notlar: fd.get('notlar') || null });
            UI.toast(`Kaydedildi: ${o.degerlendirme.metin}`, o.degerlendirme.seviye === 'ok' ? 'success' : 'error');
            grafikTipi = o.tip;
            form.deger1.value = '';
            form.deger2.value = '';
            veriCiz();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
        const veriCiz = async () => {
          const v = await Api.get(`/api/takip/olcumler?musteri_id=${musteriId}`);
          const sonlar = Object.values(v.son);
          document.getElementById('ht-veri').innerHTML = `
            <div class="stat-row" style="margin-top:14px">${sonlar.length ? sonlar.map((o) => `<div class="stat-tile" data-grafik="${o.tip}" style="cursor:pointer"><div class="label">${tipler[o.tip].ad}</div><div class="value" style="font-size:1.3em">${UI.esc(degerMetni(o, tipler))}</div><span class="badge ${ROZET[o.degerlendirme.seviye]}">${UI.esc(o.degerlendirme.metin)}</span><div class="form-ipucu">${UI.esc(o.tarih.slice(0, 16))}</div></div>`).join('') : '<p class="form-ipucu">Henüz ölçüm yok.</p>'}</div>
            ${sonlar.length ? `<div class="card"><h4 style="margin:0 0 6px">${tipler[grafikTipi] ? tipler[grafikTipi].ad : ''} grafiği <small class="form-ipucu">(kutuya tıklayarak değiştirin)</small></h4>${cizgiGrafik(v.olcumler, grafikTipi)}</div>
            <div class="card"><table><thead><tr><th>Tarih</th><th>Ölçüm</th><th>Değer</th><th>Değerlendirme</th><th>Not</th><th>Ölçen</th>${yazma ? '<th></th>' : ''}</tr></thead><tbody>${v.olcumler
              .map((o) => `<tr><td>${UI.esc(o.tarih.slice(0, 16))}</td><td>${tipler[o.tip].ad}</td><td>${UI.esc(degerMetni(o, tipler))}</td><td><span class="badge ${ROZET[o.degerlendirme.seviye]}">${UI.esc(o.degerlendirme.metin)}</span></td><td>${UI.esc(o.notlar || '')}</td><td>${UI.esc(o.olcen || '')}</td>${yazma ? `<td><button class="danger" data-olcum-sil="${o.id}">Sil</button></td>` : ''}</tr>`)
              .join('')}</tbody></table></div>` : ''}`;
        };
        await veriCiz();
        hedef.addEventListener('click', async (e) => {
          const g = e.target.closest('[data-grafik]');
          if (g) {
            grafikTipi = g.dataset.grafik;
            return veriCiz();
          }
          const sil = e.target.closest('[data-olcum-sil]');
          if (sil && (await UI.confirmSil('Ölçüm silinsin mi?'))) {
            await Api.del('/api/takip/olcumler/' + sil.dataset.olcumSil).catch((err) => UI.toast(err.message, 'error'));
            veriCiz();
          }
        });
      };

      const raporCiz = async () => {
        const hedef = document.getElementById('ht-icerik');
        const v = await Api.get('/api/takip/raporlar');
        hedef.innerHTML = `
          <div class="stat-row">
            <div class="stat-tile c-amber"><div class="label">30 gün içinde bitiyor</div><div class="value">${v.sayim.yaklasan}</div></div>
            <div class="stat-tile c-mint"><div class="label">Aktif</div><div class="value">${v.sayim.aktif}</div></div>
            <div class="stat-tile c-rose"><div class="label">Bitmiş</div><div class="value">${v.sayim.bitti}</div></div>
          </div>
          ${yazma ? '<div class="toolbar"><button id="ht-rapor-yeni">+ Yeni rapor</button></div>' : ''}
          <div class="card"><table><thead><tr><th>Hasta</th><th>Telefon</th><th>Tanı</th><th>İlaç</th><th>Rapor no</th><th>Bitiş</th><th>Durum</th>${yazma ? '<th></th>' : ''}</tr></thead>
          <tbody>${v.raporlar.length ? v.raporlar
            .map((r) => `<tr><td>${UI.esc(r.musteri_adi)}</td><td>${UI.esc(r.telefon || '-')}</td><td>${UI.esc(r.tani || '-')}</td><td>${UI.esc(r.ilac || '-')}</td><td>${UI.esc(r.rapor_no || '-')}</td>
              <td>${UI.esc(r.bitis)}</td><td><span class="badge ${DURUM[r.durum][1]}">${DURUM[r.durum][0]}${r.durum === 'bitti' ? '' : ` · ${r.kalan_gun} gün`}</span></td>
              ${yazma ? `<td><button class="secondary" data-rapor-duzenle="${r.id}">Düzenle</button> <button class="danger" data-rapor-sil="${r.id}">Sil</button></td>` : ''}</tr>`)
            .join('') : `<tr><td colspan="${yazma ? 8 : 7}" class="empty-state">Kayıtlı rapor yok</td></tr>`}</tbody></table></div>`;
        const formAc = (r) => {
          const x = r || {};
          const modal = UI.openModal(`
            <h3>${r ? 'Raporu düzenle' : 'Yeni rapor'}</h3>
            <form id="ht-rapor-form"><div class="form-grid">
              <div><label>Hasta</label><select name="musteri_id" ${r ? 'disabled' : 'required'}>${musteriSecenek(x.musteri_id || musteriId)}</select></div>
              <div><label>Rapor no</label><input name="rapor_no" value="${UI.esc(x.rapor_no || '')}" /></div>
              <div><label>Tanı (ICD-10 / açıklama)</label><input name="tani" value="${UI.esc(x.tani || '')}" placeholder="I10 Hipertansiyon" /></div>
              <div><label>İlaç / etken madde</label><input name="ilac" value="${UI.esc(x.ilac || '')}" /></div>
              <div><label>Doktor / hastane</label><input name="doktor" value="${UI.esc(x.doktor || '')}" /></div>
              <div><label>Başlangıç</label><input name="baslangic" type="date" value="${x.baslangic || ''}" /></div>
              <div><label>Bitiş</label><input name="bitis" type="date" required value="${x.bitis || ''}" /></div>
            </div><div><label>Not</label><input name="notlar" value="${UI.esc(x.notlar || '')}" /></div>
            <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="submit">Kaydet</button></div></form>`);
          modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
          modal.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const veri = Object.fromEntries([...fd.entries()].map(([k, val]) => [k, val || null]));
            try {
              if (r) await Api.put('/api/takip/raporlar/' + r.id, veri);
              else await Api.post('/api/takip/raporlar', { ...veri, musteri_id: Number(veri.musteri_id) });
              UI.closeModal(modal);
              UI.toast('Rapor kaydedildi', 'success');
              raporCiz();
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          });
        };
        const yeni = document.getElementById('ht-rapor-yeni');
        if (yeni) yeni.addEventListener('click', () => formAc(null));
        hedef.onclick = async (e) => {
          const d = e.target.closest('[data-rapor-duzenle]');
          if (d) return formAc(v.raporlar.find((r) => r.id === Number(d.dataset.raporDuzenle)));
          const s = e.target.closest('[data-rapor-sil]');
          if (s && (await UI.confirmSil('Rapor silinsin mi?'))) {
            await Api.del('/api/takip/raporlar/' + s.dataset.raporSil).catch((err) => UI.toast(err.message, 'error'));
            raporCiz();
          }
        };
      };

      const goster = () => {
        document.querySelectorAll('#ht-sekmeler button').forEach((b) => b.classList.toggle('active', b.dataset.sekme === sekme));
        return sekme === 'olcum' ? olcumCiz() : raporCiz();
      };
      document.getElementById('ht-sekmeler').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sekme]');
        if (b) {
          sekme = b.dataset.sekme;
          goster();
        }
      });
      await goster();
    }
  };
  Views.hastaTakip = view;
})();
