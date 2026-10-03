(function () {
  const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const HAZIR = [
    { ad: 'Sabah', tip: 'calisma', baslangic: '08:30', bitis: '17:00' },
    { ad: 'Öğle', tip: 'calisma', baslangic: '12:00', bitis: '21:00' },
    { ad: 'Akşam', tip: 'calisma', baslangic: '17:00', bitis: '24:00' },
    { ad: 'Nöbet (24 saat)', tip: 'calisma', baslangic: '08:30', bitis: '08:30' },
    { ad: 'İzin', tip: 'izin' },
    { ad: 'Rapor', tip: 'rapor' }
  ];
  let hafta = null;

  function gunEkle(tarih, n) {
    const d = new Date(tarih + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function hucreIcerik(v) {
    if (!v) return '<span class="vardiya-bos">+</span>';
    if (v.tip === 'izin') return '<span class="badge muted">İzin</span>';
    if (v.tip === 'rapor') return '<span class="badge warn">Rapor</span>';
    const bitis = v.bitis === '00:00' ? '24:00' : v.bitis;
    return `<span class="vardiya-saat">${v.baslangic}–${bitis}</span><small>${v.sure} sa</small>`;
  }

  function vardiyaModali(kisi, tarih, mevcut, onDegisti) {
    const modal = UI.openModal(`
      <h3>${UI.esc(kisi.ad_soyad)} · ${tarih}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${HAZIR.map((h, i) => `<button type="button" class="secondary" data-hazir="${i}">${h.ad}${h.baslangic ? ` <small>${h.baslangic}–${h.bitis === '08:30' ? '08:30' : h.bitis}</small>` : ''}</button>`).join('')}
      </div>
      <form id="vardiya-form" class="form-grid">
        <div><label>Başlangıç</label><input name="baslangic" type="time" value="${mevcut && mevcut.baslangic ? mevcut.baslangic : '08:30'}" /></div>
        <div><label>Bitiş</label><input name="bitis" type="time" value="${mevcut && mevcut.bitis ? mevcut.bitis : '17:00'}" /></div>
        <div style="grid-column:1/-1"><label>Not</label><input name="notlar" value="${UI.esc((mevcut && mevcut.notlar) || '')}" /></div>
      </form>
      <p class="form-ipucu">Bitiş başlangıçtan önceyse gece yarısını geçen vardiya sayılır (nöbet).</p>
      <div class="modal-actions">
        ${mevcut ? '<button class="danger secondary" data-action="sil">Kaldır</button>' : ''}
        <button class="secondary" data-action="kapat">Vazgeç</button>
        <button data-action="kaydet">Kaydet</button>
      </div>`);
    const kaydet = async (govde) => {
      try {
        await Api.put('/api/vardiyalar', { kullanici_id: kisi.id, tarih, ...govde });
        UI.closeModal(modal);
        onDegisti();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    };
    const form = modal.querySelector('#vardiya-form');
    const saatDuzelt = (s) => (s === '24:00' ? '00:00' : s);
    modal.querySelectorAll('[data-hazir]').forEach((b) =>
      b.addEventListener('click', () => {
        const h = HAZIR[Number(b.dataset.hazir)];
        kaydet({ tip: h.tip, baslangic: h.baslangic ? saatDuzelt(h.baslangic) : null, bitis: h.bitis ? saatDuzelt(h.bitis) : null, notlar: form.notlar.value || null });
      })
    );
    modal.querySelector('[data-action="kaydet"]').addEventListener('click', () =>
      kaydet({ tip: 'calisma', baslangic: form.baslangic.value, bitis: form.bitis.value, notlar: form.notlar.value || null })
    );
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('[data-action="sil"]')?.addEventListener('click', async () => {
      await Api.del(`/api/vardiyalar?kullanici_id=${kisi.id}&tarih=${tarih}`);
      UI.closeModal(modal);
      onDegisti();
    });
  }

  const view = {
    async render(container, ctx) {
      const yazabilir = ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
      const veri = await Api.get('/api/vardiyalar' + (hafta ? '?hafta=' + hafta : ''));
      hafta = veri.hafta;
      const notlar = await Api.get('/api/vardiyalar/notlar');
      const bugun = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
      const bul = (kid, tarih) => veri.vardiyalar.find((v) => v.kullanici_id === kid && v.tarih === tarih);

      container.innerHTML = `
        <div class="toolbar">
          <button class="secondary" id="hafta-onceki">◀</button>
          <b>${veri.gunler[0]} – ${veri.gunler[6]}</b>
          <button class="secondary" id="hafta-sonraki">▶</button>
          <button class="secondary" id="hafta-bugun">Bu hafta</button>
          <div class="spacer"></div>
          ${yazabilir ? '<button class="secondary" id="hafta-kopyala">Önceki haftayı kopyala</button>' : ''}
        </div>
        <div class="card tablo-kaydir">
          <table class="vardiya-tablo">
            <thead><tr><th>Personel</th>${veri.gunler.map((g, i) => `<th class="${g === bugun ? 'vardiya-bugun' : ''}">${GUNLER[i]}<br><small>${g.slice(8)}.${g.slice(5, 7)}</small></th>`).join('')}<th class="num">Toplam</th></tr></thead>
            <tbody>${
              veri.personel
                .map(
                  (k) => `<tr><td>${UI.esc(k.ad_soyad)}<br><small class="form-ipucu">${k.rol}</small></td>
                    ${veri.gunler.map((g) => `<td class="vardiya-hucre ${g === bugun ? 'vardiya-bugun' : ''} ${yazabilir ? 'tiklanir' : ''}" data-kisi="${k.id}" data-tarih="${g}">${hucreIcerik(bul(k.id, g))}</td>`).join('')}
                    <td class="num"><b>${veri.toplam_saat[k.id] || 0}</b> sa</td></tr>`
                )
                .join('') || '<tr><td colspan="9" class="empty-state">Bu şubede personel yok</td></tr>'
            }</tbody>
          </table>
        </div>
        <div class="card">
          <h3>📝 Vardiya Devir Notları</h3>
          <form id="not-form" class="toolbar" style="margin:0 0 10px">
            <input name="metin" placeholder="Sonraki vardiyaya not (örn. Ahmet bey'in ilacı öğleden sonra gelecek)" />
            <button type="submit">Ekle</button>
          </form>
          <ul class="devir-notlari">${
            notlar.length
              ? notlar
                  .map(
                    (n) => `<li class="${n.tamamlandi ? 'tamam' : ''}"><label><input type="checkbox" data-not="${n.id}" ${n.tamamlandi ? 'checked' : ''} style="width:auto" />
                      ${UI.esc(n.metin)}</label> <small class="form-ipucu">${UI.esc(n.ad_soyad || '')} · ${UI.tarih(n.tarih)}</small></li>`
                  )
                  .join('')
              : '<li class="empty-state">Not yok</li>'
          }</ul>
        </div>
      `;

      const yenile = () => view.render(container, ctx);
      document.getElementById('hafta-onceki').addEventListener('click', () => { hafta = gunEkle(hafta, -7); yenile(); });
      document.getElementById('hafta-sonraki').addEventListener('click', () => { hafta = gunEkle(hafta, 7); yenile(); });
      document.getElementById('hafta-bugun').addEventListener('click', () => { hafta = null; yenile(); });
      document.getElementById('hafta-kopyala')?.addEventListener('click', async () => {
        try {
          const r = await Api.post('/api/vardiyalar/kopyala', { kaynak_hafta: gunEkle(hafta, -7), hedef_hafta: hafta });
          UI.toast(`${r.eklenen} vardiya kopyalandı${r.atlanan ? `, ${r.atlanan} dolu gün atlandı` : ''}`, 'success');
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      if (yazabilir) {
        container.querySelectorAll('.vardiya-hucre').forEach((td) =>
          td.addEventListener('click', () => {
            const kisi = veri.personel.find((k) => k.id === Number(td.dataset.kisi));
            vardiyaModali(kisi, td.dataset.tarih, bul(kisi.id, td.dataset.tarih), yenile);
          })
        );
      }
      document.getElementById('not-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Api.post('/api/vardiyalar/notlar', { metin: e.target.metin.value });
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      container.querySelectorAll('[data-not]').forEach((cb) =>
        cb.addEventListener('change', async () => {
          await Api.put(`/api/vardiyalar/notlar/${cb.dataset.not}`, { tamamlandi: cb.checked });
          cb.closest('li').classList.toggle('tamam', cb.checked);
        })
      );
    }
  };

  Views.vardiya = view;
})();
