(function () {
  let aktifSayim = null;
  let kaydetZamanlayicilari = {};

  const DURUM = {
    acik: '<span class="badge warn">Açık</span>',
    tamamlandi: '<span class="badge ok">Tamamlandı</span>',
    iptal: '<span class="badge muted">İptal</span>'
  };

  function farkHucre(u) {
    if (u.fark == null) return '<span class="badge muted">Sayılmadı</span>';
    if (u.fark === 0) return '<span class="badge ok">Eşit</span>';
    return `<span class="badge ${u.fark > 0 ? 'warn' : 'danger'}">${u.fark > 0 ? '+' : ''}${u.fark}</span>`;
  }

  function kapsamMetni(kapsam) {
    if (!kapsam) return 'Tüm ürünler';
    if (kapsam.kategori) return `Kategori: ${kapsam.kategori}`;
    if (kapsam.urun_tipi) return UI.URUN_TIPLERI[kapsam.urun_tipi] || kapsam.urun_tipi;
    return 'Tüm ürünler';
  }

  async function sayimiAc(container, id) {
    aktifSayim = await Api.get(`/api/sayimlar/${id}`);
    const s = aktifSayim;
    const acik = s.durum === 'acik';
    container.innerHTML = `
      <div class="toolbar">
        <button class="secondary" id="sayim-geri">← Sayımlar</button>
        <h3 style="margin:0">Sayım #${s.id} ${DURUM[s.durum]}</h3>
        <span class="form-ipucu" style="margin:0">${kapsamMetni(s.kapsam)} · ${UI.tarih(s.baslangic)}</span>
        <div class="spacer"></div>
        ${acik ? '<button class="danger secondary" id="sayim-iptal">İptal Et</button><button id="sayim-tamamla">Sayımı Tamamla</button>' : ''}
      </div>
      <div class="stat-row" id="sayim-ozet"></div>
      ${
        acik
          ? `<div class="card">
              <div class="form-grid">
                <div><label>Barkod / Karekod Okut (her okutma +1)</label><input id="sayim-barkod" placeholder="Okutun ve Enter" autofocus /></div>
                <div><label>Listede Ara</label><input id="sayim-ara" placeholder="Ürün adı..." /></div>
              </div>
            </div>`
          : ''
      }
      <div class="card">
        <table>
          <thead><tr><th>Ürün</th><th>Barkod</th><th class="num">Sistem Stoğu</th><th class="num">Sayılan</th><th>Fark</th><th class="num">Fark Değeri</th></tr></thead>
          <tbody id="sayim-tbody"></tbody>
        </table>
      </div>
    `;

    const ozetCiz = () => {
      const sayilan = s.urunler.filter((u) => u.sayilan != null);
      const fazla = sayilan.filter((u) => u.fark > 0).length;
      const eksik = sayilan.filter((u) => u.fark < 0).length;
      const deger = sayilan.reduce((t, u) => t + (u.fark || 0) * u.alis_fiyati, 0);
      document.getElementById('sayim-ozet').innerHTML = `
        <div class="stat-tile c-lilac"><div class="label">Sayılan Ürün</div><div class="value">${sayilan.length} / ${s.urunler.length}</div></div>
        <div class="stat-tile c-amber"><div class="label">Fazla Çıkan</div><div class="value">${fazla}</div></div>
        <div class="stat-tile c-rose"><div class="label">Eksik Çıkan</div><div class="value">${eksik}</div></div>
        <div class="stat-tile c-mint"><div class="label">Net Fark (alış)</div><div class="value">${UI.tl(deger)}</div></div>`;
    };

    const tabloCiz = () => {
      const q = (document.getElementById('sayim-ara')?.value || '').toLocaleLowerCase('tr-TR');
      const satirlar = s.urunler.filter((u) => !q || u.ad.toLocaleLowerCase('tr-TR').includes(q));
      document.getElementById('sayim-tbody').innerHTML = satirlar.length
        ? satirlar
            .map(
              (u) => `<tr data-satir="${u.id}">
                <td>${UI.esc(u.ad)}</td>
                <td>${UI.esc(u.barkod || '-')}</td>
                <td class="num">${s.durum === 'tamamlandi' ? u.kapanis_stok : u.sistem_stok}</td>
                <td class="num">${
                  acik
                    ? `<input type="number" min="0" class="sayim-adet" data-ilac="${u.id}" value="${u.sayilan ?? ''}" style="width:90px" />`
                    : u.sayilan
                }</td>
                <td class="sayim-fark">${farkHucre(u)}</td>
                <td class="num sayim-deger">${u.fark ? UI.tl(u.fark * u.alis_fiyati) : '-'}</td>
              </tr>`
            )
            .join('')
        : '<tr><td colspan="6" class="empty-state">Ürün yok</td></tr>';
    };

    const satiriGuncelle = (u) => {
      u.fark = u.sayilan == null ? null : u.sayilan - u.sistem_stok;
      const tr = container.querySelector(`tr[data-satir="${u.id}"]`);
      if (tr) {
        tr.querySelector('.sayim-fark').innerHTML = farkHucre(u);
        tr.querySelector('.sayim-deger').textContent = u.fark ? UI.tl(u.fark * u.alis_fiyati) : '-';
        const inp = tr.querySelector('.sayim-adet');
        if (inp && document.activeElement !== inp) inp.value = u.sayilan ?? '';
      }
      ozetCiz();
    };

    ozetCiz();
    tabloCiz();

    document.getElementById('sayim-geri').addEventListener('click', () => rotayiRenderEt());
    if (!acik) return;

    document.getElementById('sayim-ara').addEventListener('input', tabloCiz);
    container.addEventListener('input', (e) => {
      if (!e.target.classList.contains('sayim-adet')) return;
      const ilacId = Number(e.target.dataset.ilac);
      const u = s.urunler.find((x) => x.id === ilacId);
      const deger = e.target.value === '' ? null : Number(e.target.value);
      clearTimeout(kaydetZamanlayicilari[ilacId]);
      kaydetZamanlayicilari[ilacId] = setTimeout(async () => {
        try {
          const r = await Api.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: ilacId, sayilan: deger });
          u.sayilan = r.sayilan;
          satiriGuncelle(u);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      }, 300);
    });

    document.getElementById('sayim-barkod').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      let kod = e.target.value.trim();
      e.target.value = '';
      if (!kod) return;
      try {
        if (UI.karekodaBenziyor(kod)) kod = (await UI.karekodSorgula(kod)).karekod.barkod;
        const u = s.urunler.find((x) => x.barkod === kod);
        if (!u) {
          UI.toast(`Bu barkod sayım listesinde yok: ${kod}`, 'error');
          return;
        }
        const r = await Api.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: u.id, sayilan: 1, arti: true });
        u.sayilan = r.sayilan;
        satiriGuncelle(u);
        UI.toast(`${u.ad}: ${u.sayilan}`, 'success');
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });

    document.getElementById('sayim-tamamla').addEventListener('click', async () => {
      const sayilan = s.urunler.filter((u) => u.sayilan != null);
      const farkli = sayilan.filter((u) => u.fark);
      if (!window.confirm(`${sayilan.length} ürün sayıldı, ${farkli.length} üründe fark var. Stoklar sayılan adetlere göre düzeltilecek. Onaylıyor musunuz?`)) return;
      try {
        await Api.post(`/api/sayimlar/${s.id}/tamamla`, {});
        UI.toast('Sayım tamamlandı, stoklar düzeltildi', 'success');
        sayimiAc(container, s.id);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
    document.getElementById('sayim-iptal').addEventListener('click', async () => {
      if (!window.confirm('Sayım iptal edilsin mi? Stoklara dokunulmaz.')) return;
      await Api.post(`/api/sayimlar/${s.id}/iptal`, {});
      rotayiRenderEt();
    });
  }

  const view = {
    async render(container) {
      const [sayimlar, ilaclar] = await Promise.all([Api.get('/api/sayimlar'), Api.get('/api/ilaclar')]);
      const kategoriler = [...new Set(ilaclar.map((i) => i.kategori).filter(Boolean))].sort();
      const acik = sayimlar.find((s) => s.durum === 'acik');
      container.innerHTML = `
        <div class="card">
          <h3>Yeni Sayım</h3>
          ${
            acik
              ? `<p>Açık bir sayım var (#${acik.id}). <button class="secondary" data-ac="${acik.id}">Devam Et</button></p>`
              : `<form id="sayim-form" class="form-grid">
                  <div>
                    <label>Kapsam</label>
                    <select name="kapsam">
                      <option value="">Tüm ürünler</option>
                      <optgroup label="Ürün tipi">
                        ${Object.entries(UI.URUN_TIPLERI).map(([v, l]) => `<option value="tip:${v}">${l}</option>`).join('')}
                      </optgroup>
                      <optgroup label="Kategori">
                        ${kategoriler.map((k) => `<option value="kat:${UI.esc(k)}">${UI.esc(k)}</option>`).join('')}
                      </optgroup>
                    </select>
                  </div>
                  <div><label>Açıklama</label><input name="aciklama" placeholder="örn. Yıl sonu sayımı" /></div>
                  <div><button type="submit">Sayımı Başlat</button></div>
                </form>`
          }
          <p class="form-ipucu">Sayım tamamlanınca yalnızca sayılan ürünlerin stoğu düzeltilir. Fazlalar "sayım" partisi olarak girer, eksikler SKT'si en yakın partiden düşer.</p>
        </div>
        <div class="card">
          <h3>Geçmiş Sayımlar</h3>
          <table>
            <thead><tr><th>No</th><th>Başlangıç</th><th>Durum</th><th>Kapsam</th><th class="num">Sayılan</th><th class="num">Farklı</th><th class="num">Fark Değeri</th><th>Sayan</th><th></th></tr></thead>
            <tbody>${
              sayimlar.length
                ? sayimlar
                    .map(
                      (s) => `<tr>
                        <td>#${s.id}</td>
                        <td>${UI.tarih(s.baslangic)}</td>
                        <td>${DURUM[s.durum]}</td>
                        <td>${kapsamMetni(s.kapsam ? JSON.parse(s.kapsam) : null)}</td>
                        <td class="num">${s.sayilan_urun}</td>
                        <td class="num">${s.durum === 'tamamlandi' ? s.farkli_urun : '-'}</td>
                        <td class="num">${s.durum === 'tamamlandi' ? UI.tl(s.fark_degeri) : '-'}</td>
                        <td>${UI.esc(s.kullanici_adi || '-')}</td>
                        <td class="actions-col"><button class="secondary" data-ac="${s.id}">${s.durum === 'acik' ? 'Devam Et' : 'Görüntüle'}</button></td>
                      </tr>`
                    )
                    .join('')
                : '<tr><td colspan="9" class="empty-state">Henüz sayım yapılmadı</td></tr>'
            }</tbody>
          </table>
        </div>
      `;

      const form = document.getElementById('sayim-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const kapsam = form.kapsam.value;
          const govde = { aciklama: form.aciklama.value || null };
          if (kapsam.startsWith('tip:')) govde.urun_tipi = kapsam.slice(4);
          if (kapsam.startsWith('kat:')) govde.kategori = kapsam.slice(4);
          try {
            const s = await Api.post('/api/sayimlar', govde);
            sayimiAc(container, s.id);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      }
      container.querySelectorAll('button[data-ac]').forEach((b) =>
        b.addEventListener('click', () => sayimiAc(container, Number(b.dataset.ac)))
      );
    }
  };

  Views.sayim = view;
})();
