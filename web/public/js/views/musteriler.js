(function () {
  let liste = [];

  function formHtml(m) {
    const x = m || {};
    return `
      <h3>${m ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h3>
      <form id="musteri-form">
        <div class="form-grid">
          <div><label>Ad Soyad</label><input name="ad_soyad" required value="${UI.esc(x.ad_soyad || '')}" /></div>
          <div><label>Telefon</label><input name="telefon" value="${UI.esc(x.telefon || '')}" /></div>
          <div><label>E-posta</label><input name="email" type="email" value="${UI.esc(x.email || '')}" /></div>
          <div><label>TC No</label><input name="tc_no" value="${UI.esc(x.tc_no || '')}" /></div>
          <div><label>Veresiye Limiti (TL)</label><input name="veresiye_limiti" type="number" step="0.01" min="0" placeholder="Boş = limitsiz" value="${x.veresiye_limiti ?? ''}" /></div>
          <div><label>Doğum Tarihi</label><input name="dogum_tarihi" type="date" value="${x.dogum_tarihi || ''}" title="Yaşa bağlı ilaç uyarıları ve doğum günü listesi için" /></div>
          <div>
            <label>Gebelik / Emzirme</label>
            <select name="gebelik_durumu" title="Kasada gebelikte riskli ilaçlar için uyarı verilir">
              <option value="">Yok</option>
              <option value="gebe" ${x.gebelik_durumu === 'gebe' ? 'selected' : ''}>Gebe</option>
              <option value="emziren" ${x.gebelik_durumu === 'emziren' ? 'selected' : ''}>Emziriyor</option>
            </select>
          </div>
        </div>
        <div><label>Adres</label><textarea name="adres" rows="2">${UI.esc(x.adres || '')}</textarea></div>
        <div>
          <label>Sağlık Notu <span style="color:var(--text-muted);font-weight:400">(alerji, kronik hastalık, dikkat edilmesi gereken ilaçlar)</span></label>
          <textarea name="saglik_notu" rows="2" placeholder="örn. Penisilin alerjisi, tip 2 diyabet">${UI.esc(x.saglik_notu || '')}</textarea>
        </div>
        <div><label><input type="checkbox" name="ileti_izni" style="width:auto" ${x.ileti_izni ? 'checked' : ''} /> Kampanya SMS / e-posta almayı kabul ediyor (ticari ileti onayı - İYS)</label></div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, musteri, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#musteri-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const veri = {
        ad_soyad: fd.get('ad_soyad'),
        telefon: fd.get('telefon') || null,
        email: fd.get('email') || null,
        tc_no: fd.get('tc_no') || null,
        adres: fd.get('adres') || null,
        saglik_notu: fd.get('saglik_notu') || null,
        veresiye_limiti: fd.get('veresiye_limiti') === '' ? null : Number(fd.get('veresiye_limiti')),
        ileti_izni: e.target.querySelector('[name="ileti_izni"]').checked,
        dogum_tarihi: fd.get('dogum_tarihi') || null,
        gebelik_durumu: fd.get('gebelik_durumu') || null
      };
      try {
        if (musteri) {
          await Api.put(`/api/musteriler/${musteri.id}`, veri);
          UI.toast('Müşteri güncellendi', 'success');
        } else {
          await Api.post('/api/musteriler', veri);
          UI.toast('Müşteri eklendi', 'success');
        }
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function kullanimKartiGoster(m) {
    const k = await Api.get(`/api/musteriler/${m.id}/kullanim-karti`);
    const tcMaskeli = k.musteri.tc_no ? k.musteri.tc_no.slice(0, 3) + '*****' + k.musteri.tc_no.slice(-3) : '-';
    const uyarilar = [
      ...k.alerji.map((a) => `<div class="kart-uyari"><b>Alerji:</b> ${UI.esc(a.urun)} (${UI.esc(a.madde)}) — sağlık notunda "${UI.esc(a.eslesen)}" geçiyor</div>`),
      ...k.etkilesimler.map((e) => `<div class="kart-uyari"><b>Etkileşim (${e.seviye}):</b> ${UI.esc(e.urun_a)} + ${UI.esc(e.urun_b)} — ${UI.esc(e.aciklama)}</div>`),
      ...k.mukerrer.map((x) => `<div class="kart-uyari"><b>Aynı etken madde:</b> ${UI.esc(x.urun_a)} ve ${UI.esc(x.urun_b)} (${UI.esc(x.madde)})</div>`)
    ];
    const modal = UI.openModal(`
      <div class="kullanim-karti yazdirilabilir">
        <h2 class="modal-genis">İlaç Kullanım Kartı</h2>
        <p><b>${UI.esc(k.musteri.ad_soyad)}</b> · TC: ${tcMaskeli} · ${k.tarih}</p>
        ${k.musteri.saglik_notu ? `<p>⚕ <b>Sağlık notu:</b> ${UI.esc(k.musteri.saglik_notu)}</p>` : ''}
        <table>
          <thead><tr><th>İlaç</th><th>Etken Madde</th><th>Nasıl Kullanılır</th><th>Son Alım</th></tr></thead>
          <tbody>${
            k.ilaclar.length
              ? k.ilaclar
                  .map(
                    (i) => `<tr><td>${UI.esc(i.ad)}</td><td>${UI.esc(i.etken_madde || '-')}</td>
                      <td>${i.kullanim ? `<b>${UI.esc(i.kullanim)}</b>` : '<span style="color:var(--text-muted)">Hekiminizin/eczacınızın önerdiği şekilde</span>'}</td>
                      <td>${UI.tarih(i.son_alim).slice(0, 10)}</td></tr>`
                  )
                  .join('')
              : `<tr><td colspan="4" class="empty-state">Son ${k.gun} günde ilaç alımı yok</td></tr>`
          }</tbody>
        </table>
        ${uyarilar.join('')}
        <p class="form-ipucu">Bu kart son ${k.gun} günde eczanemizden alınan ilaçlara göre hazırlanmıştır. Sorularınız için eczacınıza danışın.</p>
      </div>
      <div class="modal-actions"><button class="secondary" data-action="yazdir">Yazdır</button><button data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('[data-action="yazdir"]').addEventListener('click', () => window.print());
  }

  async function satisGecmisiGoster(m) {
    const satislar = await Api.get(`/api/musteriler/${m.id}/satislar`);
    const satirlar = satislar.length
      ? satislar.map((s) => `<tr><td>${UI.tarih(s.tarih)}</td><td>${s.odeme_tipi}</td><td class="num">${UI.tl(s.toplam_tutar)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Satış kaydı yok</td></tr>';

    const modal = UI.openModal(`
      <h3>${UI.esc(m.ad_soyad)} - Satış Geçmişi</h3>
      <table><thead><tr><th>Tarih</th><th>Ödeme</th><th class="num">Tutar</th></tr></thead>
      <tbody>${satirlar}</tbody></table>
      <div class="modal-actions"><button data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  const view = {
    async render(container, ctx) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="musteri-ara" placeholder="Müşteri ara..." style="max-width:320px" />
          <div class="spacer"></div>
          ${ctx && ctx.user.rol === 'admin' ? '<button class="secondary" id="sadakat-ayar-btn">Puan Ayarları</button>' : ''}
          <button id="yeni-musteri-btn">+ Yeni Müşteri</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Ad Soyad</th><th>Telefon</th><th>E-posta</th><th class="num">Puan</th><th></th></tr></thead>
            <tbody id="musteri-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async (q) => {
        liste = await Api.get('/api/musteriler' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const tbody = document.getElementById('musteri-tbody');
        tbody.innerHTML = liste.length
          ? liste
              .map(
                (m) => `<tr>
                  <td>${UI.esc(m.ad_soyad)} ${m.saglik_notu ? '<span class="badge danger" title="' + UI.esc(m.saglik_notu) + '">⚕ Sağlık Notu</span>' : ''}</td>
                  <td>${UI.esc(m.telefon || '-')}</td>
                  <td>${UI.esc(m.email || '-')}</td>
                  <td class="num">${m.puan ? `<span class="badge ok">${m.puan}</span>` : '-'}</td>
                  <td class="actions-col">
                    <button class="secondary" data-action="kart" data-id="${m.id}">Kullanım Kartı</button>
                    <button class="secondary" data-action="gecmis" data-id="${m.id}">Satış Geçmişi</button>
                    <button class="secondary" data-action="duzenle" data-id="${m.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${m.id}">Sil</button>
                  </td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      let timer;
      document.getElementById('musteri-ara').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => yenile(e.target.value), 250);
      });

      document.getElementById('sadakat-ayar-btn')?.addEventListener('click', async () => {
        const a = await Api.get('/api/musteriler/sadakat/ayarlar');
        const modal = UI.openModal(`
          <h3>Sadakat Puanı Ayarları</h3>
          <form id="sadakat-form">
            <div class="form-grid">
              <div><label>1 TL alışverişte kazanılan puan</label><input name="kazanim_orani" type="number" step="0.1" min="0" value="${a.kazanim_orani}" /></div>
              <div><label>1 puanın değeri (TL)</label><input name="puan_degeri" type="number" step="0.001" min="0.001" value="${a.puan_degeri}" /></div>
            </div>
            <label><input type="checkbox" name="aktif" style="width:auto" ${a.aktif ? 'checked' : ''} /> Puan sistemi açık</label>
            <p class="form-ipucu">Reçeteli ilaçlar ve SGK satışları puan kazandırmaz, puanla ödenemez. Varsayılan: 1 TL = 1 puan, 100 puan = 1 TL (%1).</p>
            <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="submit">Kaydet</button></div>
          </form>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#sadakat-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          try {
            await Api.put('/api/musteriler/sadakat/ayarlar', { kazanim_orani: Number(f.kazanim_orani.value), puan_degeri: Number(f.puan_degeri.value), aktif: f.aktif.checked });
            UI.toast('Puan ayarları kaydedildi', 'success');
            UI.closeModal(modal);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });

      document.getElementById('yeni-musteri-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, () => yenile(document.getElementById('musteri-ara').value));
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const m = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'kart') {
          kullanimKartiGoster(m);
          return;
        }
        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(m));
          formuBagla(modal, m, () => yenile(document.getElementById('musteri-ara').value));
        } else if (btn.dataset.action === 'gecmis') {
          satisGecmisiGoster(m);
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${m.ad_soyad}" silinsin mi?`))) return;
          try {
            await Api.del(`/api/musteriler/${id}`);
            UI.toast('Müşteri silindi', 'success');
            yenile(document.getElementById('musteri-ara').value);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      const seed = UI.aramaSeedOku();
      if (seed) document.getElementById('musteri-ara').value = seed;
      await yenile(seed);
    }
  };

  Views.musteriler = view;
})();
