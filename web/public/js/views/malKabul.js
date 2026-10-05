(function () {
  let ilaclar = [];
  let satirlar = [];
  let faturaVkn = null; // e-faturadan gelen tedarikci vergi no (kayitta tedarikciye islenir)

  function birimMaliyet(s) {
    const adet = Number(s.adet) || 0;
    const mf = Number(s.mf) || 0;
    return adet > 0 ? (Number(s.alis_fiyati) * adet) / (adet + mf) : 0;
  }

  function satirlariCiz() {
    const tbody = document.getElementById('mk-satirlar');
    tbody.innerHTML = satirlar.length
      ? satirlar
          .map((s, i) => {
            const ilac = ilaclar.find((x) => x.id === s.ilac_id);
            return `<tr>
              <td>${UI.esc(ilac ? ilac.ad : '?')}</td>
              <td><input type="number" min="1" data-i="${i}" data-alan="adet" value="${s.adet}" style="width:70px" /></td>
              <td><input type="number" min="0" data-i="${i}" data-alan="mf" value="${s.mf}" style="width:60px" title="Mal fazlası (bedelsiz)" /></td>
              <td><input type="number" min="0" step="0.01" data-i="${i}" data-alan="alis_fiyati" value="${s.alis_fiyati}" style="width:90px" /></td>
              <td><input data-i="${i}" data-alan="parti_no" value="${UI.esc(s.parti_no || '')}" style="width:100px" /></td>
              <td><input type="date" data-i="${i}" data-alan="skt" value="${s.skt || ''}" /></td>
              <td class="num mk-birim">${UI.tl(birimMaliyet(s))}</td>
              <td class="num mk-tutar">${UI.tl(Number(s.alis_fiyati) * Number(s.adet || 0))}</td>
              <td><button type="button" class="secondary" data-sil="${i}">Sil</button></td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="9" class="empty-state">Karekod okutun veya ürün ekleyin</td></tr>';
    toplamCiz();
  }

  function toplamCiz() {
    const toplam = satirlar.reduce((t, s) => t + Number(s.alis_fiyati) * Number(s.adet || 0), 0);
    const adet = satirlar.reduce((t, s) => t + Number(s.adet || 0) + Number(s.mf || 0), 0);
    document.getElementById('mk-toplam').textContent = `${adet} kutu · Fatura toplamı ${UI.tl(toplam)}`;
  }

  function satirEkle(ilac, ek) {
    satirlar.push({ ilac_id: ilac.id, adet: 1, mf: 0, alis_fiyati: ilac.alis_fiyati, parti_no: '', skt: '', ...ek });
    satirlariCiz();
  }

  async function detayGoster(id) {
    const k = await Api.get(`/api/mal-kabul/${id}`);
    const modal = UI.openModal(`
      <h3 class="modal-genis">Mal Kabul #${k.id}</h3>
      <p class="form-ipucu">${UI.esc(k.tedarikci_adi || 'Tedarikçi belirtilmedi')} · Fatura ${UI.esc(k.fatura_no || '-')} ${k.fatura_tarihi ? '(' + k.fatura_tarihi + ')' : ''} · ${UI.tarih(k.tarih)} · ${UI.esc(k.kullanici_adi || '')}${k.siparis_id ? ` · Sipariş #${k.siparis_id}` : ''}</p>
      <table><thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">MF</th><th class="num">Alış</th><th class="num">Birim Maliyet</th><th>Parti</th><th>SKT</th></tr></thead>
      <tbody>${k.kalemler
        .map(
          (x) => `<tr><td>${UI.esc(x.ilac_adi)}</td><td class="num">${x.adet}</td><td class="num">${x.mf || '-'}</td><td class="num">${UI.tl(x.alis_fiyati)}</td>
            <td class="num">${UI.tl(x.birim_maliyet)}</td><td>${UI.esc(x.parti_no || '-')}</td><td>${x.skt || '-'}</td></tr>`
        )
        .join('')}</tbody></table>
      <div class="cart-total"><span>Fatura Toplamı</span><span>${UI.tl(k.toplam_tutar)}</span></div>
      <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  const view = {
    async render(container) {
      satirlar = [];
      faturaVkn = null;
      const [tedarikciler, siparisler, gecmis] = await Promise.all([
        Api.get('/api/tedarikciler'),
        Api.get('/api/siparisler'),
        Api.get('/api/mal-kabul')
      ]);
      ilaclar = await Api.get('/api/ilaclar');
      const bekleyen = siparisler.filter((s) => s.durum === 'beklemede' || s.durum === 'gonderildi');

      container.innerHTML = `
        <div class="card">
          <h3>Yeni Mal Kabul</h3>
          <div class="form-grid">
            <div><label>Tedarikçi</label><select id="mk-tedarikci"><option value="">-</option>${tedarikciler.map((t) => `<option value="${t.id}">${UI.esc(t.firma_adi)}</option>`).join('')}</select></div>
            <div><label>Fatura / İrsaliye No</label><input id="mk-fatura" /></div>
            <div><label>Fatura Tarihi</label><input id="mk-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
            <div><label>e-Fatura (XML / ZIP)</label><label class="secondary" style="display:inline-block;cursor:pointer;padding:9px 14px;border:1px solid var(--border);border-radius:999px"><input type="file" id="mk-efatura" accept=".xml,.zip,application/xml,text/xml,application/zip" hidden />e-Fatura yükle</label></div>
            <div><label>Siparişten Doldur</label><select id="mk-siparis"><option value="">-</option>${bekleyen.map((s) => `<option value="${s.id}">#${s.id} · ${UI.esc(s.tedarikci_adi || '')} · ${s.kalem_sayisi} kalem</option>`).join('')}</select></div>
          </div>
          <div class="form-grid" style="margin-top:8px">
            <div><label>Karekod / Barkod Okut</label><input id="mk-okut" placeholder="Okutun ve Enter (ürün, parti, SKT dolar)" /></div>
            <div><label>veya Ürün Seç</label><select id="mk-ilac">${ilaclar.map((i) => `<option value="${i.id}">${UI.esc(i.ad)}</option>`).join('')}</select></div>
            <div><label>&nbsp;</label><button type="button" class="secondary" id="mk-ekle">+ Ekle</button></div>
          </div>
          <div class="tablo-kaydir" style="margin-top:10px">
            <table><thead><tr><th>Ürün</th><th>Adet</th><th>MF</th><th>Alış Fiyatı</th><th>Parti No</th><th>SKT</th><th class="num">Birim Maliyet</th><th class="num">Tutar</th><th></th></tr></thead>
            <tbody id="mk-satirlar"></tbody></table>
          </div>
          <div class="toolbar" style="margin-top:10px">
            <label style="margin:0"><input type="checkbox" id="mk-alis-guncelle" style="width:auto" checked /> Ürünlerin alış fiyatını birim maliyete güncelle</label>
            <div class="spacer"></div>
            <b id="mk-toplam"></b>
            <button id="mk-kaydet">Mal Kabulü Kaydet</button>
          </div>
          <p class="form-ipucu">MF (mal fazlası): bedelsiz gelen adet. Örn. 10+1'de adet 10, MF 1 girilir; stoğa 11 girer, birim maliyet düşer.</p>
        </div>
        <div class="card">
          <h3>Geçmiş Mal Kabuller</h3>
          <table><thead><tr><th>No</th><th>Tarih</th><th>Tedarikçi</th><th>Fatura</th><th class="num">Kalem</th><th class="num">Kutu</th><th class="num">Tutar</th><th></th></tr></thead>
          <tbody>${
            gecmis.length
              ? gecmis
                  .map(
                    (k) => `<tr><td>#${k.id}</td><td>${UI.tarih(k.tarih)}</td><td>${UI.esc(k.tedarikci_adi || '-')}</td><td>${UI.esc(k.fatura_no || '-')}</td>
                      <td class="num">${k.kalem_sayisi}</td><td class="num">${k.toplam_adet}</td><td class="num">${UI.tl(k.toplam_tutar)}</td>
                      <td class="actions-col"><button class="secondary" data-detay="${k.id}">Detay</button></td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="8" class="empty-state">Henüz mal kabul yok</td></tr>'
          }</tbody></table>
        </div>
      `;
      satirlariCiz();

      document.getElementById('mk-ekle').addEventListener('click', () => {
        const ilac = ilaclar.find((i) => i.id === Number(document.getElementById('mk-ilac').value));
        if (ilac) satirEkle(ilac);
      });
      document.getElementById('mk-okut').addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const metin = e.target.value.trim();
        e.target.value = '';
        if (!metin) return;
        try {
          let barkod = metin;
          let ek = {};
          if (UI.karekodaBenziyor(metin)) {
            const sonuc = await UI.karekodSorgula(metin);
            const k = sonuc.karekod;
            barkod = k.barkod;
            ek = { parti_no: k.parti_no || '', skt: k.skt || '' };
            if (k.seri_no) {
              if (['giris', 'iade'].includes(sonuc.seri_durum) || satirlar.some((s) => (s.karekodlar || []).includes(metin))) {
                UI.toast(`Seri ${k.seri_no} zaten stokta / bu listede görünüyor`, 'error');
                return;
              }
              ek.karekodlar = [metin];
            }
          }
          const ilac = ilaclar.find((i) => i.barkod === barkod);
          if (!ilac) {
            UI.toast(`Ürün kayıtlı değil (barkod ${barkod})`, 'error');
            return;
          }
          // Ayni urun ve parti zaten varsa adedini artir
          const mevcut = satirlar.find((s) => s.ilac_id === ilac.id && (s.parti_no || '') === (ek.parti_no || '') && (s.skt || '') === (ek.skt || ''));
          if (mevcut) {
            mevcut.adet = Number(mevcut.adet) + 1;
            if (ek.karekodlar) mevcut.karekodlar = (mevcut.karekodlar || []).concat(ek.karekodlar);
            satirlariCiz();
          } else {
            satirEkle(ilac, ek);
          }
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('mk-siparis').addEventListener('change', async (e) => {
        if (!e.target.value) return;
        const s = await Api.get(`/api/siparisler/${e.target.value}`);
        document.getElementById('mk-tedarikci').value = s.tedarikci_id || '';
        satirlar = s.kalemler.map((k) => ({ ilac_id: k.ilac_id, adet: k.istenen_adet, mf: 0, alis_fiyati: k.tahmini_birim_fiyat, parti_no: '', skt: '' }));
        satirlariCiz();
      });
      const tbody = document.getElementById('mk-satirlar');
      tbody.addEventListener('input', (e) => {
        const i = e.target.dataset.i;
        if (i === undefined) return;
        satirlar[Number(i)][e.target.dataset.alan] = e.target.value;
        const tr = e.target.closest('tr');
        const s = satirlar[Number(i)];
        tr.querySelector('.mk-birim').textContent = UI.tl(birimMaliyet(s));
        tr.querySelector('.mk-tutar').textContent = UI.tl(Number(s.alis_fiyati) * Number(s.adet || 0));
        toplamCiz();
      });
      tbody.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sil]');
        if (b) {
          satirlar.splice(Number(b.dataset.sil), 1);
          satirlariCiz();
        }
      });
      document.getElementById('mk-efatura').addEventListener('change', async (e) => {
        const dosya = e.target.files[0];
        e.target.value = '';
        if (!dosya) return;
        try {
          const yanit = await fetch('/api/mal-kabul/e-fatura', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await dosya.arrayBuffer() });
          const v = await yanit.json();
          if (!yanit.ok) throw new Error(v.error || 'e-Fatura okunamadı');
          eFaturaOnizle(v, tedarikciler);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });

      function eFaturaOnizle(v, tedarikciListesi) {
        const f = v.fatura;
        let kdvDahil = true;
        const ilacSecenek = (secili) => `<option value="">— eşleşmedi, atla —</option>${ilaclar.map((i) => `<option value="${i.id}" ${secili === i.id ? 'selected' : ''}>${UI.esc(i.ad)}</option>`).join('')}`;
        const modal = UI.openModal(`
          <h3 class="modal-genis">e-Fatura önizleme</h3>
          <p class="form-ipucu"><b>${UI.esc(f.tedarikci.ad || '-')}</b> (VKN ${UI.esc(f.tedarikci.vkn || '-')}) · Fatura ${UI.esc(f.no || '-')} · ${UI.esc(f.tarih || '')} · Ödenecek ${UI.tl(f.odenecek)} (KDV ${UI.tl(f.kdv)})</p>
          ${v.uyarilar.length ? `<div style="padding:10px 14px;border-radius:10px;background:var(--warning-soft);color:var(--warning);margin-bottom:10px">${v.uyarilar.map((u) => '• ' + UI.esc(u)).join('<br>')}</div>` : ''}
          <div class="form-grid">
            <div><label>Tedarikçi</label><select id="ef-ted"><option value="">— seçin —</option>${tedarikciListesi.map((t) => `<option value="${t.id}" ${f.tedarikci.eslesen && f.tedarikci.eslesen.id === t.id ? 'selected' : ''}>${UI.esc(t.firma_adi)}</option>`).join('')}</select>
              ${f.tedarikci.eslesen ? '' : `<button type="button" class="secondary" id="ef-ted-ekle" style="margin-top:6px">“${UI.esc(f.tedarikci.ad || '')}” tedarikçi olarak ekle</button>`}</div>
            <div><label>Alış fiyatı</label><select id="ef-fiyat"><option value="dahil">KDV dahil (cari borç fatura tutarıyla aynı olur)</option><option value="haric">KDV hariç</option></select></div>
          </div>
          <div class="tablo-kaydir"><table><thead><tr><th>Faturadaki ürün</th><th>Barkod</th><th class="num">Adet</th><th class="num">MF</th><th class="num">Birim fiyat</th><th>Parti / SKT</th><th>Katalogdaki ürün</th></tr></thead>
          <tbody>${v.satirlar
            .map(
              (s, i) => `<tr><td>${UI.esc(s.ad)}</td><td>${UI.esc(s.barkod || '-')}</td><td class="num">${s.adet}</td><td class="num">${s.mf || '-'}</td>
                <td class="num ef-fiyat" data-i="${i}">${UI.tl(s.birim_fiyat_kdv_dahil)}</td><td>${UI.esc([s.parti_no, s.skt].filter(Boolean).join(' / ') || '-')}</td>
                <td><select data-ef="${i}" style="max-width:260px">${ilacSecenek(s.ilac_id)}</select>
                  ${!s.ilac_id && s.titck ? `<br><button type="button" class="secondary" data-ef-titck="${i}" style="margin-top:4px">TİTCK'dan kataloğa ekle</button>` : ''}
                  ${s.ilac_id && s.eslesme === 'ad' ? '<br><small class="form-ipucu">adla eşleşti, kontrol edin</small>' : ''}</td></tr>`
            )
            .join('')}</tbody></table></div>
          <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="button" id="ef-aktar">Forma aktar</button></div>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#ef-fiyat').addEventListener('change', (e) => {
          kdvDahil = e.target.value === 'dahil';
          modal.querySelectorAll('.ef-fiyat').forEach((td) => {
            const s = v.satirlar[Number(td.dataset.i)];
            td.textContent = UI.tl(kdvDahil ? s.birim_fiyat_kdv_dahil : s.birim_fiyat_kdv_haric);
          });
        });
        const tedEkle = modal.querySelector('#ef-ted-ekle');
        if (tedEkle) {
          tedEkle.addEventListener('click', async () => {
            try {
              const t = await Api.post('/api/tedarikciler', { firma_adi: f.tedarikci.ad, vergi_no: f.tedarikci.vkn || null });
              tedarikciListesi.push(t);
              for (const sel of [modal.querySelector('#ef-ted'), document.getElementById('mk-tedarikci')]) {
                sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${UI.esc(t.firma_adi)}</option>`);
              }
              modal.querySelector('#ef-ted').value = String(t.id);
              tedEkle.remove();
              UI.toast('Tedarikçi eklendi', 'success');
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          });
        }
        modal.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-ef-titck]');
          if (!b) return;
          const s = v.satirlar[Number(b.dataset.efTitck)];
          const fiyat = prompt(`${s.titck.ad}\nSatış fiyatı (TL):`);
          if (fiyat === null) return;
          try {
            const r = await Api.post('/api/titck/urune-ekle', { barkod: s.titck.barkod, satis_fiyati: Number(String(fiyat).replace(',', '.')), alis_fiyati: s.birim_fiyat_kdv_dahil });
            ilaclar.push({ id: r.id, ad: r.ad, alis_fiyati: s.birim_fiyat_kdv_dahil });
            s.ilac_id = r.id;
            modal.querySelectorAll('select[data-ef]').forEach((sel) => {
              const i = Number(sel.dataset.ef);
              sel.innerHTML = ilacSecenek(v.satirlar[i].ilac_id || Number(sel.value) || null);
            });
            b.remove();
            UI.toast('Ürün kataloğa eklendi', 'success');
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
        modal.querySelector('#ef-aktar').addEventListener('click', () => {
          const yeni = [];
          modal.querySelectorAll('select[data-ef]').forEach((sel) => {
            const s = v.satirlar[Number(sel.dataset.ef)];
            const ilacId = Number(sel.value);
            if (!ilacId || !(s.adet > 0)) return;
            yeni.push({ ilac_id: ilacId, adet: s.adet, mf: s.mf || 0, alis_fiyati: kdvDahil ? s.birim_fiyat_kdv_dahil : s.birim_fiyat_kdv_haric, parti_no: s.parti_no || '', skt: s.skt || '' });
          });
          if (!yeni.length) return UI.toast('Aktarılacak eşleşmiş satır yok', 'error');
          satirlar = yeni;
          const tedId = modal.querySelector('#ef-ted').value;
          if (tedId) document.getElementById('mk-tedarikci').value = tedId;
          document.getElementById('mk-fatura').value = f.no || '';
          if (f.tarih) document.getElementById('mk-tarih').value = f.tarih;
          faturaVkn = f.tedarikci.vkn || null;
          satirlariCiz();
          UI.closeModal(modal);
          const atlanan = v.satirlar.length - yeni.length;
          UI.toast(`${yeni.length} satır forma aktarıldı${atlanan ? `, ${atlanan} satır atlandı` : ''}. Kontrol edip kaydedin.`, atlanan ? 'error' : 'success');
        });
      }

      document.getElementById('mk-kaydet').addEventListener('click', async () => {
        if (!satirlar.length) {
          UI.toast('En az bir kalem ekleyin', 'error');
          return;
        }
        try {
          const k = await Api.post('/api/mal-kabul', {
            tedarikci_id: Number(document.getElementById('mk-tedarikci').value) || null,
            siparis_id: Number(document.getElementById('mk-siparis').value) || null,
            fatura_no: document.getElementById('mk-fatura').value || null,
            fatura_tarihi: document.getElementById('mk-tarih').value || null,
            alis_fiyati_guncelle: document.getElementById('mk-alis-guncelle').checked,
            tedarikci_vkn: faturaVkn,
            kalemler: satirlar.map((s) => ({ ...s, adet: Number(s.adet), mf: Number(s.mf) || 0, alis_fiyati: Number(s.alis_fiyati) }))
          });
          UI.toast(`Mal kabul #${k.id} kaydedildi, stoğa işlendi`, 'success');
          view.render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      container.querySelectorAll('[data-detay]').forEach((b) => b.addEventListener('click', () => detayGoster(Number(b.dataset.detay))));
    }
  };

  Views.malKabul = view;
})();
