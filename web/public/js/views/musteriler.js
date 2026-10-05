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
          ${ctx && ['admin', 'eczaci'].includes(ctx.user.rol) ? '<a class="hap-link ikincil-link" href="/api/musteriler/disa-aktar" download>CSV Dışa Aktar</a>' : ''}
          <button id="yeni-musteri-btn">+ Yeni Müşteri</button>
        </div>
        <div class="musteri-ust">
          <div class="card" id="segment-kart"></div>
          <div class="card" id="dogum-kart"></div>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Ad Soyad</th><th>Segment</th><th>Telefon</th><th>E-posta</th><th class="num">Puan</th><th></th></tr></thead>
            <tbody id="musteri-tbody"></tbody>
          </table>
        </div>
      `;

      // Segmentler: hangi musteri sadik, hangisi kaybedilmek uzere; tiklayinca liste filtrelenir
      const SEGMENT_RENK = { sadik: 'ok', yeni: 'ok', risk: 'warn', kayip: 'danger', ara: 'muted', hic: 'muted' };
      let segmentler = { ozet: {}, musteriler: [] };
      let segmentFiltre = null;
      const segmentHaritasi = () => Object.fromEntries(segmentler.musteriler.map((m) => [m.id, m]));
      const segmentleriYukle = async () => {
        segmentler = await Api.get('/api/musteriler/segmentler');
        document.getElementById('segment-kart').innerHTML = `
          <div class="kart-bas"><h3>Müşteri Segmentleri</h3>${segmentFiltre ? '<button type="button" class="secondary" data-segment="">Filtreyi kaldır</button>' : ''}</div>
          <div class="segment-cipler">${Object.entries(segmentler.ozet)
            .filter(([, v]) => v.sayi > 0)
            .map(([k, v]) => `<button type="button" class="segment-cip ${segmentFiltre === k ? 'aktif' : ''}" data-segment="${k}"><span class="badge ${SEGMENT_RENK[k]}">${v.sayi}</span> ${v.ad}</button>`)
            .join('')}</div>
          <p class="form-ipucu" style="margin-bottom:0">Sadık: son 45 günde alışveriş ve 6 ayda 4+ alım · Kaybedilmek üzere: 45-120 gündür gelmeyen · Kayıp: 120+ gün.</p>`;
      };
      const dogumGunleriniYukle = async () => {
        const liste = await Api.get('/api/musteriler/dogum-gunleri?gun=7');
        document.getElementById('dogum-kart').innerHTML = `
          <h3>🎂 Yaklaşan Doğum Günleri</h3>
          ${
            liste.length
              ? `<ul class="dogum-liste">${liste
                  .map(
                    (m) => `<li><span><b>${UI.esc(m.ad_soyad)}</b> <small>${m.kalan_gun === 0 ? 'bugün' : m.kalan_gun + ' gün sonra'} · ${m.yeni_yas} yaş</small></span>
                      ${m.ileti_izni && m.telefon ? `<button type="button" class="secondary" data-kutla="${m.id}">Kutla (SMS)</button>` : '<small class="form-ipucu">ileti izni yok</small>'}</li>`
                  )
                  .join('')}</ul>`
              : '<p class="form-ipucu" style="margin:0">Önümüzdeki 7 günde doğum günü yok. Müşteri kartına doğum tarihi ekleyebilirsiniz.</p>'
          }`;
      };
      container.addEventListener('click', async (e) => {
        const seg = e.target.closest('[data-segment]');
        if (seg) {
          segmentFiltre = seg.dataset.segment || null;
          await segmentleriYukle();
          yenile(document.getElementById('musteri-ara').value);
          return;
        }
        const kutla = e.target.closest('[data-kutla]');
        if (kutla) {
          try {
            const b = await Api.post(`/api/musteriler/${kutla.dataset.kutla}/dogum-gunu-mesaji`, {});
            UI.toast(b.durum === 'simule' ? 'Kutlama mesajı kaydedildi (SMS simülasyonu)' : 'Kutlama mesajı gönderildi', 'success');
            kutla.disabled = true;
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      const yenile = async (q) => {
        liste = await Api.get('/api/musteriler' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const seg = segmentHaritasi();
        if (segmentFiltre) liste = liste.filter((m) => seg[m.id] && seg[m.id].segment === segmentFiltre);
        const tbody = document.getElementById('musteri-tbody');
        tbody.innerHTML = liste.length
          ? liste
              .map(
                (m) => `<tr>
                  <td>${UI.esc(m.ad_soyad)} ${m.saglik_notu ? '<span class="badge danger" title="' + UI.esc(m.saglik_notu) + '">⚕ Sağlık Notu</span>' : ''}</td>
                  <td>${seg[m.id] ? `<span class="badge ${SEGMENT_RENK[seg[m.id].segment]}" title="${seg[m.id].son_alim ? 'Son alım: ' + UI.esc(seg[m.id].son_alim.slice(0, 10)) : ''}">${seg[m.id].segment_adi}</span>` : '-'}</td>
                  <td>${UI.esc(m.telefon || '-')}</td>
                  <td>${UI.esc(m.email || '-')}</td>
                  <td class="num">${m.puan ? `<span class="badge ok">${m.puan}</span>` : '-'}</td>
                  <td class="actions-col">
                    <button class="secondary" data-action="kart" data-id="${m.id}">Kullanım Kartı</button>
                    <button class="secondary" data-action="gecmis" data-id="${m.id}">Satış Geçmişi</button>
                    <button class="secondary" data-action="takip" data-id="${m.id}">Takip</button>
                    ${EczamWA.dugme(m.telefon, '')}
                    <button class="secondary" data-action="duzenle" data-id="${m.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${m.id}">Sil</button>
                  </td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Kayıt bulunamadı</td></tr>';
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
        } else if (btn.dataset.action === 'takip') {
          try {
            sessionStorage.setItem('eczam:takip-musteri', String(btn.dataset.id));
          } catch (e) {
            /* secim olmadan acilir */
          }
          location.hash = '#hasta-takip';
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
      await Promise.all([segmentleriYukle(), dogumGunleriniYukle()]).catch(() => {});
      await yenile(seed);
    }
  };

  Views.musteriler = view;
})();
