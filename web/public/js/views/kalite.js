// Kalite ve guvenlik: soguk zincir sicaklik defteri, ilac geri cagirma takibi, imha tutanagi
(function () {
  const YONTEMLER = { lisansli_firma: 'Lisanslı imha firması', depo_iadesi: 'Depoya iade', diger: 'Diğer' };

  function sekmeCubugu(sekmeler, aktif) {
    return `<div class="sekmeler" role="tablist">${sekmeler
      .map((s) => `<button type="button" role="tab" class="sekme ${s.k === aktif ? 'aktif' : ''}" data-sekme="${s.k}" aria-selected="${s.k === aktif}">${s.ad}</button>`)
      .join('')}</div>`;
  }

  async function sicaklikCiz(kutu) {
    const veri = await Api.get('/api/kalite/sicaklik?gun=14');
    const { min, max } = veri.aralik;
    const o = veri.ozet;
    // Basit cizgi grafik: son 14 gun olcumleri, 2-8 °C bandi vurgulu
    const noktalar = [...veri.kayitlar].reverse();
    const G = 640, Y = 180, sol = 34, sag = 10, ust = 12, alt = 22;
    const altDeger = Math.min(0, ...noktalar.map((n) => n.sicaklik));
    const ustDeger = Math.max(12, ...noktalar.map((n) => n.sicaklik));
    const y = (v) => ust + (1 - (v - altDeger) / (ustDeger - altDeger)) * (Y - ust - alt);
    const x = (i) => sol + (noktalar.length < 2 ? (G - sol - sag) / 2 : (i * (G - sol - sag)) / (noktalar.length - 1));
    const grafik = noktalar.length
      ? `<svg viewBox="0 0 ${G} ${Y}" class="grafik-svg" role="img" aria-label="Son 14 gün dolap sıcaklıkları">
          <rect x="${sol}" y="${y(max)}" width="${G - sol - sag}" height="${y(min) - y(max)}" class="sicaklik-bant"/>
          ${[altDeger, min, max, ustDeger].map((v) => `<text x="${sol - 6}" y="${y(v) + 4}" class="eksen-yazi" text-anchor="end">${v}°</text>`).join('')}
          <polyline points="${noktalar.map((n, i) => `${x(i).toFixed(1)},${y(n.sicaklik).toFixed(1)}`).join(' ')}" class="seri seri-1" fill="none"/>
          ${noktalar
            .map((n, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(n.sicaklik).toFixed(1)}" r="${n.aralik_disi ? 5 : 3.5}" class="${n.aralik_disi ? 'sicaklik-hata' : 'sicaklik-nokta'}"><title>${UI.esc(n.dolap)} · ${n.sicaklik} °C · ${UI.tarih(n.tarih)}</title></circle>`)
            .join('')}
        </svg>`
      : '<div class="empty-state">Henüz ölçüm yok. İlk ölçümü yukarıdan girin.</div>';

    kutu.innerHTML = `
      <div class="stat-row">
        <div class="stat-tile ${o.bugun_olcum ? 'c-mint' : 'c-amber'}"><div class="label">Bugünkü Ölçüm</div><div class="value">${o.bugun_olcum}</div></div>
        <div class="stat-tile ${o.aralik_disi ? 'c-rose' : ''}"><div class="label">Aralık Dışı (14 gün)</div><div class="value">${o.aralik_disi}</div></div>
        <div class="stat-tile"><div class="label">En Düşük / En Yüksek</div><div class="value">${o.en_dusuk ?? '-'}° / ${o.en_yuksek ?? '-'}°</div></div>
      </div>
      <div class="card">
        <h3>Yeni Ölçüm</h3>
        <form id="sic-form" class="form-grid">
          <div><label>Dolap</label><input name="dolap" value="Buzdolabı" list="sic-dolaplar" /><datalist id="sic-dolaplar">${[...new Set(veri.kayitlar.map((k) => k.dolap))].map((d) => `<option value="${UI.esc(d)}">`).join('')}</datalist></div>
          <div><label>Sıcaklık (°C)</label><input name="sicaklik" type="number" step="0.1" required placeholder="örn. 4.5" /></div>
          <div><label>Not</label><input name="notlar" placeholder="örn. kapı açık kalmış" /></div>
          <div style="align-self:end"><button type="submit">Kaydet</button></div>
        </form>
        <p class="form-ipucu">İlaç saklama aralığı ${min}–${max} °C. Aralık dışındaki ölçümler kırmızı işaretlenir ve bildirim merkezine düşer.</p>
      </div>
      <div class="card"><h3>Son 14 Gün</h3>${grafik}</div>
      <div class="card">
        <h3>Ölçüm Kayıtları</h3>
        <table><thead><tr><th>Tarih</th><th>Dolap</th><th class="num">Sıcaklık</th><th>Durum</th><th>Ölçen</th><th>Not</th></tr></thead><tbody>
        ${
          veri.kayitlar.length
            ? veri.kayitlar
                .map(
                  (k) => `<tr><td>${UI.tarih(k.tarih)}</td><td>${UI.esc(k.dolap)}</td><td class="num">${k.sicaklik} °C</td>
                    <td>${k.aralik_disi ? '<span class="badge danger">Aralık dışı</span>' : '<span class="badge ok">Normal</span>'}</td>
                    <td>${UI.esc(k.kullanici_adi || '-')}</td><td>${UI.esc(k.notlar || '')}</td></tr>`
                )
                .join('')
            : '<tr><td colspan="6" class="empty-state">Kayıt yok</td></tr>'
        }</tbody></table>
      </div>`;

    kutu.querySelector('#sic-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const k = await Api.post('/api/kalite/sicaklik', { dolap: f.dolap.value, sicaklik: f.sicaklik.value === '' ? null : Number(f.sicaklik.value), notlar: f.notlar.value || null });
        UI.toast(k.aralik_disi ? `Dikkat: ${k.sicaklik} °C aralık dışında!` : 'Ölçüm kaydedildi', k.aralik_disi ? 'error' : 'success');
        sicaklikCiz(kutu);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function geriCagirmaCiz(kutu) {
    const [ilaclar, gecmis] = await Promise.all([Api.get('/api/ilaclar'), Api.get('/api/kalite/geri-cagirmalar')]);
    kutu.innerHTML = `
      <div class="card">
        <h3>Parti Sorgula</h3>
        <form id="gc-form" class="form-grid">
          <div><label>Ürün</label><select name="ilac_id">${ilaclar.map((i) => `<option value="${i.id}">${UI.esc(i.ad)}</option>`).join('')}</select></div>
          <div><label>Parti / Lot No</label><input name="parti_no" required placeholder="örn. LOT2026A" /></div>
          <div style="align-self:end"><button type="submit">Sorgula</button></div>
        </form>
        <p class="form-ipucu">Bakanlık veya üretici bir partiyi geri çağırdığında: bu partiden kime satış yapıldığını ve stokta ne kaldığını görün, kaydı oluşturup kalan stoğu satıştan çekin.</p>
        <div id="gc-sonuc"></div>
      </div>
      <div class="card">
        <h3>Geri Çağırma Kayıtları</h3>
        <table><thead><tr><th>Tarih</th><th>Ürün</th><th>Parti</th><th class="num">Etkilenen Satış</th><th class="num">Stoktan Çekilen</th><th>Kaydeden</th><th>Açıklama</th></tr></thead><tbody>
        ${
          gecmis.length
            ? gecmis
                .map(
                  (g) => `<tr><td>${UI.tarih(g.tarih)}</td><td>${UI.esc(g.ilac_adi)}</td><td>${UI.esc(g.parti_no)}</td><td class="num">${g.etkilenen_satis}</td>
                    <td class="num">${g.stoktan_cekilen}</td><td>${UI.esc(g.kullanici_adi || '-')}</td><td>${UI.esc(g.aciklama || '')}</td></tr>`
                )
                .join('')
            : '<tr><td colspan="7" class="empty-state">Kayıt yok</td></tr>'
        }</tbody></table>
      </div>`;

    kutu.querySelector('#gc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ilacId = Number(e.target.ilac_id.value);
      const partiNo = e.target.parti_no.value.trim();
      const sonucDiv = kutu.querySelector('#gc-sonuc');
      try {
        const r = await Api.get(`/api/kalite/geri-cagirma/sorgu?ilac_id=${ilacId}&parti_no=${encodeURIComponent(partiNo)}`);
        if (!r.partiler.length) {
          sonucDiv.innerHTML = '<div class="empty-state">Bu ürün için bu parti numarası kayıtlı değil.</div>';
          return;
        }
        const stokta = r.partiler.reduce((t, p) => t + p.miktar, 0);
        sonucDiv.innerHTML = `
          <h3 style="margin-top:16px">Parti Durumu</h3>
          <table><thead><tr><th>Şube</th><th>SKT</th><th class="num">Giren</th><th class="num">Stokta</th></tr></thead><tbody>
            ${r.partiler.map((p) => `<tr><td>${UI.esc(p.sube_adi)}</td><td>${p.skt || '-'}</td><td class="num">${p.giris_miktari}</td><td class="num">${p.miktar}</td></tr>`).join('')}
          </tbody></table>
          <h3 style="margin-top:16px">Bu Partiden Yapılan Satışlar (${r.satislar.length})</h3>
          <table><thead><tr><th>Tarih</th><th>Satış</th><th>Müşteri</th><th>Telefon</th><th class="num">Adet</th></tr></thead><tbody>
            ${
              r.satislar.length
                ? r.satislar
                    .map((s) => `<tr><td>${UI.tarih(s.tarih)}</td><td>#${s.satis_id}</td><td>${UI.esc(s.musteri_adi || 'Perakende (kayıtsız)')}</td><td>${UI.esc(s.telefon || '-')}</td><td class="num">${s.adet}</td></tr>`)
                    .join('')
                : '<tr><td colspan="5" class="empty-state">Bu şubede bu partiden satış yok</td></tr>'
            }
          </tbody></table>
          <div class="form-grid" style="margin-top:12px">
            <div><label>Açıklama</label><input id="gc-aciklama" placeholder="örn. TİTCK duyurusu 2026/14" /></div>
            <div style="align-self:end"><label><input type="checkbox" id="gc-cek" style="width:auto" ${stokta ? 'checked' : ''} /> Stoktaki ${stokta} kutuyu satıştan çek</label></div>
            <div style="align-self:end"><button type="button" class="danger" id="gc-kaydet">Geri Çağırmayı Kaydet</button></div>
          </div>`;
        sonucDiv.querySelector('#gc-kaydet').addEventListener('click', async () => {
          try {
            const g = await Api.post('/api/kalite/geri-cagirmalar', {
              ilac_id: ilacId,
              parti_no: partiNo,
              aciklama: sonucDiv.querySelector('#gc-aciklama').value || null,
              stoktan_cek: sonucDiv.querySelector('#gc-cek').checked
            });
            UI.toast(`Geri çağırma kaydedildi; ${g.stoktan_cekilen} kutu stoktan çekildi`, 'success');
            geriCagirmaCiz(kutu);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function imhaCiz(kutu) {
    const [adaylar, gecmis] = await Promise.all([Api.get('/api/kalite/imha-adaylari'), Api.get('/api/kalite/imhalar')]);
    kutu.innerHTML = `
      <div class="card">
        <h3>İmha Edilecek Ürünler</h3>
        <p class="form-ipucu">SKT'si geçmiş veya 30 gün içinde geçecek partiler. İmha edilecekleri seçip adet girin; stok düşülür ve tutanak oluşturulur.</p>
        <table><thead><tr><th></th><th>Ürün</th><th>Parti</th><th>SKT</th><th class="num">Stokta</th><th class="num">İmha Adedi</th></tr></thead><tbody>
        ${
          adaylar.length
            ? adaylar
                .map(
                  (a) => `<tr><td><input type="checkbox" class="imha-sec" data-parti="${a.parti_id}" style="width:auto" ${a.skt_gecmis ? 'checked' : ''} /></td>
                    <td>${UI.esc(a.ilac_adi)}</td><td>${UI.esc(a.parti_no || '-')}</td>
                    <td>${a.skt} ${a.skt_gecmis ? '<span class="badge danger">Geçti</span>' : '<span class="badge warn">Yaklaşıyor</span>'}</td>
                    <td class="num">${a.miktar}</td>
                    <td class="num"><input type="number" class="imha-adet" data-parti="${a.parti_id}" min="1" max="${a.miktar}" value="${a.miktar}" style="width:80px" /></td></tr>`
                )
                .join('')
            : '<tr><td colspan="6" class="empty-state">İmha adayı ürün yok 🎉</td></tr>'
        }</tbody></table>
        ${
          adaylar.length
            ? `<form id="imha-form" class="form-grid" style="margin-top:12px">
                <div><label>Yöntem</label><select name="yontem">${Object.entries(YONTEMLER).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
                <div><label>Tanık</label><input name="tanik" placeholder="Ad soyad" /></div>
                <div><label>Açıklama</label><input name="aciklama" placeholder="örn. firma tutanak no" /></div>
                <div style="align-self:end"><button type="submit" class="danger">İmha Kaydı Oluştur</button></div>
              </form>`
            : ''
        }
      </div>
      <div class="card">
        <h3>İmha Tutanakları</h3>
        <table><thead><tr><th>No</th><th>Tarih</th><th>Yöntem</th><th>Tanık</th><th class="num">Kalem</th><th class="num">Adet</th><th class="num">Maliyet</th><th></th></tr></thead><tbody>
        ${
          gecmis.length
            ? gecmis
                .map(
                  (g) => `<tr><td>#${g.id}</td><td>${UI.tarih(g.tarih)}</td><td>${YONTEMLER[g.yontem] || g.yontem}</td><td>${UI.esc(g.tanik || '-')}</td>
                    <td class="num">${g.kalem_sayisi}</td><td class="num">${g.toplam_adet}</td><td class="num">${UI.tl(g.toplam_maliyet)}</td>
                    <td class="actions-col"><a class="hap-link" href="/api/kalite/imhalar/${g.id}/tutanak?format=pdf" target="_blank" rel="noopener">PDF ${Ikon.svg('ok')}</a></td></tr>`
                )
                .join('')
            : '<tr><td colspan="8" class="empty-state">Henüz imha kaydı yok</td></tr>'
        }</tbody></table>
      </div>`;

    const form = kutu.querySelector('#imha-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kalemler = [...kutu.querySelectorAll('.imha-sec:checked')].map((c) => ({
        parti_id: Number(c.dataset.parti),
        adet: Number(kutu.querySelector(`.imha-adet[data-parti="${c.dataset.parti}"]`).value)
      }));
      if (!kalemler.length) return UI.toast('İmha edilecek en az bir parti seçin', 'error');
      if (!window.confirm(`${kalemler.length} kalem imha edilecek ve stoktan düşülecek. Emin misiniz?`)) return;
      try {
        const im = await Api.post('/api/kalite/imhalar', { kalemler, yontem: form.yontem.value, tanik: form.tanik.value || null, aciklama: form.aciklama.value || null });
        UI.toast(`İmha tutanağı #${im.id} oluşturuldu`, 'success');
        imhaCiz(kutu);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  const view = {
    async render(container, { user }) {
      const yonetici = user.rol === 'admin' || user.rol === 'eczaci';
      const sekmeler = [{ k: 'sicaklik', ad: '❄️ Soğuk Zincir' }, ...(yonetici ? [{ k: 'geri', ad: '⚠️ Geri Çağırma' }, { k: 'imha', ad: '🗑️ İmha Tutanağı' }] : [])];
      let aktif = 'sicaklik';
      const ciz = async () => {
        container.innerHTML = sekmeCubugu(sekmeler, aktif) + '<div id="kalite-icerik"><div class="empty-state">Yükleniyor...</div></div>';
        container.querySelectorAll('[data-sekme]').forEach((b) =>
          b.addEventListener('click', () => {
            aktif = b.dataset.sekme;
            ciz();
          })
        );
        const kutu = container.querySelector('#kalite-icerik');
        try {
          if (aktif === 'sicaklik') await sicaklikCiz(kutu);
          else if (aktif === 'geri') await geriCagirmaCiz(kutu);
          else await imhaCiz(kutu);
        } catch (err) {
          kutu.innerHTML = `<div class="empty-state">Hata: ${UI.esc(err.message)}</div>`;
        }
      };
      await ciz();
    }
  };

  window.Views = window.Views || {};
  window.Views.kalite = view;
})();
