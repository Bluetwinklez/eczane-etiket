(function () {
  const ODEME_ETIKETI = { nakit: 'Nakit', kredi_karti: 'Kredi Kartı', sgk: 'SGK', veresiye: 'Veresiye', karma: 'Nakit + Kart' };

  function iadeYontemiMetni(odemeTipi) {
    if (odemeTipi === 'veresiye') return 'Tutar müşterinin veresiye borcundan düşülecek.';
    if (odemeTipi === 'kredi_karti') return 'Tutar karta iade edilecek (POS üzerinden iade yapın).';
    if (odemeTipi === 'karma') return 'Bölünmüş ödeme: tutar satıştaki nakit/kart oranıyla iade edilir.';
    if (odemeTipi === 'sgk') return 'SGK satışı: iade tutarı SGK toplamından düşülür.';
    return 'Tutar kasadan nakit olarak ödenecek.';
  }

  async function iadeFormuAc(satisId, onTamamlandi) {
    let satis;
    try {
      satis = await Api.get(`/api/iadeler/satis/${satisId}`);
    } catch (err) {
      UI.toast(err.message, 'error');
      return;
    }
    const iadeEdilebilir = satis.kalemler.filter((k) => k.iade_edilebilir_adet > 0);
    const satirlar = satis.kalemler
      .map(
        (k) => `<tr>
          <td>${UI.esc(k.ilac_adi)}${k.kampanya_adi ? `<br /><small>${UI.esc(k.kampanya_adi)}</small>` : ''}</td>
          <td class="num">${k.adet}${k.iade_edilen_adet ? ` <small>(${k.iade_edilen_adet} iade)</small>` : ''}</td>
          <td class="num">${UI.tl(k.birim_iade_tutari)}</td>
          <td class="num">${
            k.iade_edilebilir_adet > 0
              ? `<input type="number" class="iade-adet" data-kalem="${k.id}" data-birim="${k.birim_iade_tutari}" min="0" max="${k.iade_edilebilir_adet}" value="0" style="width:80px" />`
              : '<span class="badge muted">Tamamı iade</span>'
          }</td>
        </tr>`
      )
      .join('');

    const modal = UI.openModal(`
      <h3 class="modal-genis">İade — Satış #${satis.id}</h3>
      <p class="form-ipucu">${UI.tarih(satis.tarih)} · ${ODEME_ETIKETI[satis.odeme_tipi] || satis.odeme_tipi}${satis.musteri_adi ? ' · ' + UI.esc(satis.musteri_adi) : ''} · Toplam ${UI.tl(satis.toplam_tutar)}</p>
      <div class="tablo-kaydir">
        <table>
          <thead><tr><th>Ürün</th><th class="num">Satılan</th><th class="num">Birim İade</th><th class="num">İade Adedi</th></tr></thead>
          <tbody>${satirlar}</tbody>
        </table>
      </div>
      ${
        iadeEdilebilir.length
          ? `<div class="form-grid" style="margin-top:12px">
              <div><label>İade Nedeni</label><input id="iade-neden" placeholder="örn. Yanlış ürün, hekim değişikliği" /></div>
            </div>
            <label><input type="checkbox" id="iade-stoga" style="width:auto" checked /> Ürün sağlam ve ambalajı açılmamış — stoğa geri al</label>
            <p class="form-ipucu">${iadeYontemiMetni(satis.odeme_tipi)}</p>
            <div class="cart-total"><span>İade Tutarı</span><span id="iade-toplam">0,00 TL</span></div>`
          : '<div class="empty-state">Bu satışın iade edilebilir kalemi kalmadı.</div>'
      }
      <div class="modal-actions">
        <button class="secondary" data-action="kapat">Vazgeç</button>
        ${iadeEdilebilir.length ? '<button class="danger" data-action="iade">İadeyi Onayla</button>' : ''}
      </div>
    `);

    const toplamGuncelle = () => {
      let t = 0;
      modal.querySelectorAll('.iade-adet').forEach((inp) => {
        t += (Number(inp.value) || 0) * Number(inp.dataset.birim);
      });
      const el = modal.querySelector('#iade-toplam');
      if (el) el.textContent = UI.tl(t);
    };
    modal.querySelectorAll('.iade-adet').forEach((inp) => inp.addEventListener('input', toplamGuncelle));
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    const iadeBtn = modal.querySelector('[data-action="iade"]');
    if (iadeBtn) {
      iadeBtn.addEventListener('click', async () => {
        const kalemler = [];
        modal.querySelectorAll('.iade-adet').forEach((inp) => {
          const adet = Number(inp.value) || 0;
          if (adet > 0) kalemler.push({ satis_kalem_id: Number(inp.dataset.kalem), adet });
        });
        if (!kalemler.length) {
          UI.toast('İade adedi girin', 'error');
          return;
        }
        try {
          const iade = await Api.post('/api/iadeler', {
            satis_id: satis.id,
            kalemler,
            neden: modal.querySelector('#iade-neden').value || null,
            stoga_geri_al: modal.querySelector('#iade-stoga').checked
          });
          UI.toast(`İade #${iade.id} kaydedildi: ${UI.tl(iade.toplam_tutar)}`, 'success');
          UI.closeModal(modal);
          onTamamlandi();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="card">
          <h3>Fiş Numarası ile İade</h3>
          <form id="iade-ara-form" class="toolbar" style="margin:0">
            <input id="iade-satis-no" type="number" min="1" placeholder="Satış / fiş no" style="max-width:220px" required />
            <button type="submit">İade Başlat</button>
          </form>
        </div>
        <div class="card">
          <h3>Son Satışlar</h3>
          <table>
            <thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Ödeme</th><th class="num">Tutar</th><th></th></tr></thead>
            <tbody id="son-satislar"></tbody>
          </table>
        </div>
        <div class="card">
          <h3>İade Geçmişi</h3>
          <table>
            <thead><tr><th>İade No</th><th>Tarih</th><th>Satış</th><th>Ürünler</th><th class="num">Tutar</th><th>Stok</th><th>Neden</th><th>Kullanıcı</th></tr></thead>
            <tbody id="iade-gecmisi"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        const [satislar, iadeler] = await Promise.all([Api.get('/api/satislar'), Api.get('/api/iadeler')]);
        document.getElementById('son-satislar').innerHTML = satislar.length
          ? satislar
              .slice(0, 15)
              .map(
                (s) => `<tr>
                  <td>#${s.id}</td>
                  <td>${UI.tarih(s.tarih)}</td>
                  <td>${UI.esc(s.musteri_adi || '-')}</td>
                  <td>${ODEME_ETIKETI[s.odeme_tipi] || s.odeme_tipi}</td>
                  <td class="num">${UI.tl(s.toplam_tutar)}</td>
                  <td class="actions-col"><button class="secondary" data-iade-satis="${s.id}">İade</button></td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Satış yok</td></tr>';
        document.getElementById('iade-gecmisi').innerHTML = iadeler.length
          ? iadeler
              .map(
                (i) => `<tr>
                  <td>#${i.id}</td>
                  <td>${UI.tarih(i.tarih)}</td>
                  <td>#${i.satis_id}</td>
                  <td>${UI.esc(i.urunler || '-')}</td>
                  <td class="num">${UI.tl(i.toplam_tutar)}</td>
                  <td>${i.stoga_alindi ? '<span class="badge ok">Stoğa alındı</span>' : '<span class="badge warn">Stoğa alınmadı</span>'}</td>
                  <td>${UI.esc(i.neden || '-')}</td>
                  <td>${UI.esc(i.kullanici_adi || '-')}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="empty-state">Henüz iade yok</td></tr>';
      };

      document.getElementById('iade-ara-form').addEventListener('submit', (e) => {
        e.preventDefault();
        iadeFormuAc(Number(document.getElementById('iade-satis-no').value), yenile);
      });
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-iade-satis]');
        if (btn) iadeFormuAc(Number(btn.dataset.iadeSatis), yenile);
      });

      await yenile();
    }
  };

  Views.iadeler = view;
})();
