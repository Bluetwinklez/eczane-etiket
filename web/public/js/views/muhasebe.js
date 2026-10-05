(function () {
  const SEKMELER = [
    ['ozet', 'Özet'],
    ['gunluk', 'Günlük kazanç'],
    ['faturalar', 'Alış faturaları'],
    ['kasa', 'Kasa raporu']
  ];
  const KATEGORI = { kira: 'Kira', fatura: 'Fatura', maas: 'Maaş', vergi: 'Vergi', tedarik: 'Tedarik (mal alımı)', diger: 'Diğer' };

  const TABLO = {
    gunluk: [
      ['tarih', 'Tarih'], ['satis_adedi', 'Satış', 'adet'], ['brut_hasilat', 'Brüt hasılat'], ['iade_tutari', 'İade'],
      ['net_hasilat', 'Net hasılat'], ['maliyet', 'Maliyet'], ['brut_kar', 'Brüt kâr'], ['gider', 'Gider'], ['net_kar', 'Net kâr']
    ],
    faturalar: [
      ['tarih', 'Tarih'], ['tur', 'Tür', 'metin'], ['firma_adi', 'Firma', 'metin'], ['belge_no', 'Belge no', 'metin'],
      ['vade_tarihi', 'Vade', 'metin'], ['tutar', 'Tutar'], ['kalan', 'Kalan'], ['durum', 'Durum', 'metin']
    ],
    kasa: [
      ['tarih', 'Tarih'], ['nakit', 'Nakit'], ['kart', 'Kart'], ['sgk', 'SGK'], ['veresiye', 'Veresiye'], ['tahsilat', 'Tahsilat'],
      ['iade', 'İade'], ['kasa_giris', 'Kasa giriş'], ['kasa_cikis', 'Kasa çıkış'], ['beklenen_nakit', 'Beklenen nakit'], ['kasa_farki', 'Kasa farkı']
    ]
  };

  function tabloHtml(kolonlar, satirlar) {
    const hucre = (v, k) => {
      if (k[2] === 'metin' || k[0] === 'tarih') return UI.esc(v == null || v === '' ? '-' : String(v));
      if (k[2] === 'adet') return v;
      return v == null ? '-' : UI.tl(v);
    };
    const sayisal = (k) => (k[2] === 'metin' || k[0] === 'tarih' ? '' : ' class="num"');
    return `<table>
      <thead><tr>${kolonlar.map((k) => `<th${sayisal(k)}>${k[1]}</th>`).join('')}</tr></thead>
      <tbody>${
        satirlar.length
          ? satirlar.map((s) => `<tr>${kolonlar.map((k) => `<td${sayisal(k)}>${hucre(s[k[0]], k)}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${kolonlar.length}" class="empty-state">Bu dönemde kayıt yok</td></tr>`
      }</tbody></table>`;
  }

  function ozetHtml(o) {
    const kat = Object.entries(o.kategoriler || {})
      .map(([k, v]) => `<tr><td>${KATEGORI[k] || k}</td><td class="num">${UI.tl(v)}</td></tr>`)
      .join('');
    const satir = (etiket, deger, kalin) => `<tr${kalin ? ' style="font-weight:600"' : ''}><td>${etiket}</td><td class="num">${UI.tl(deger)}</td></tr>`;
    return `
      <div class="stat-row">
        <div class="stat-tile c-mint"><div class="label">Net hasılat</div><div class="value">${UI.tl(o.net_hasilat)}</div></div>
        <div class="stat-tile c-rose"><div class="label">İşletme gideri</div><div class="value">${UI.tl(o.isletme_giderleri)}</div></div>
        <div class="stat-tile c-lilac"><div class="label">Net kâr (%${o.net_marj})</div><div class="value">${UI.tl(o.net_kar)}</div></div>
        <div class="stat-tile c-amber"><div class="label">Alış faturaları</div><div class="value">${UI.tl(o.alis_faturalari)}</div></div>
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
        <div class="card"><h3>Kazanç</h3><table><tbody>
          ${satir('Brüt hasılat (' + o.satis_adedi + ' satış)', o.brut_hasilat)}
          ${satir('− Müşteri iadeleri (' + o.iade_adedi + ')', o.iade_tutari)}
          ${satir('Net hasılat', o.net_hasilat, true)}
          ${satir('− Satılan malın maliyeti', o.maliyet)}
          ${satir('Brüt kâr (%' + o.brut_marj + ')', o.brut_kar, true)}
          ${satir('− İşletme giderleri', o.isletme_giderleri)}
          ${satir('Net kâr', o.net_kar, true)}
        </tbody></table></div>
        <div class="card"><h3>Giderler</h3><table><tbody>${kat || '<tr><td class="empty-state">Gider yok</td></tr>'}</tbody></table>
          <p class="hint" style="margin-top:8px">Mal alımı (tedarik) giderleri maliyette zaten sayıldığı için kâra ayrıca yansıtılmaz.</p></div>
        <div class="card"><h3>Alış ve borç</h3><table><tbody>
          ${satir('Alış faturaları (' + o.alis_fatura_adedi + ')', o.alis_faturalari)}
          ${satir('− Alış iadeleri', o.alis_iadeleri)}
          ${satir('Net alış', o.net_alis, true)}
          ${satir('Tedarikçiye yapılan ödemeler', o.tedarikci_odemeleri)}
          ${satir('Güncel tedarikçi borcu', o.tedarikci_borcu, true)}
          ${satir('Vadesi geçmiş borç', o.vadesi_gecmis_borc)}
          ${satir('Veresiye alacağı', o.veresiye_alacagi)}
        </tbody></table></div>
      </div>`;
  }

  const view = {
    async render(container) {
      const bugun = new Date();
      const yerel = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      let sekme = 'ozet';

      container.innerHTML = `
        <div class="toolbar">
          <input id="mh-bas" style="width:auto" type="date" value="${yerel(new Date(bugun.getFullYear(), bugun.getMonth(), 1))}" />
          <input id="mh-bit" style="width:auto" type="date" value="${yerel(bugun)}" />
          <button id="mh-filtre" class="secondary">Göster</button>
          <div class="spacer"></div>
          <a id="mh-csv" style="text-decoration:none" download><button type="button" class="secondary">CSV</button></a>
          <a id="mh-pdf" style="text-decoration:none" download><button type="button" class="secondary">PDF</button></a>
          <button id="mh-alis-iade">+ Alış iadesi</button>
        </div>
        <div class="toolbar" id="mh-sekmeler">
          ${SEKMELER.map(([k, e]) => `<button class="secondary" data-sekme="${k}">${e}</button>`).join('')}
        </div>
        <div id="mh-icerik"></div>`;

      const sorgu = () => `baslangic=${document.getElementById('mh-bas').value}&bitis=${document.getElementById('mh-bit').value}`;

      const yenile = async () => {
        document.querySelectorAll('#mh-sekmeler button').forEach((b) => b.classList.toggle('active', b.dataset.sekme === sekme));
        document.getElementById('mh-csv').href = `/api/muhasebe/${sekme}?${sorgu()}&format=csv`;
        document.getElementById('mh-pdf').href = `/api/muhasebe/${sekme}?${sorgu()}&format=pdf`;
        const hedef = document.getElementById('mh-icerik');
        try {
          const veri = await Api.get(`/api/muhasebe/${sekme}?${sorgu()}`);
          hedef.innerHTML = sekme === 'ozet' ? ozetHtml(veri) : `<div class="card">${tabloHtml(TABLO[sekme], veri)}</div>`;
        } catch (err) {
          hedef.innerHTML = `<div class="card empty-state">${UI.esc(err.message)}</div>`;
        }
      };

      document.getElementById('mh-sekmeler').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-sekme]');
        if (!b) return;
        sekme = b.dataset.sekme;
        yenile();
      });
      document.getElementById('mh-filtre').addEventListener('click', yenile);

      document.getElementById('mh-alis-iade').addEventListener('click', async () => {
        const tedarikciler = await Api.get('/api/tedarikciler');
        const modal = UI.openModal(`
          <h3>Alış iadesi</h3>
          <p class="hint">Depoya iade ettiğiniz mal veya iade faturası. Tedarikçi borcunuzdan düşer; ödeme sayılmaz.</p>
          <form id="mh-iade-form">
            <div class="form-grid">
              <div><label>Tedarikçi</label><select name="tedarikci_id" required>${tedarikciler.map((t) => `<option value="${t.id}">${UI.esc(t.firma_adi)}</option>`).join('')}</select></div>
              <div><label>Tutar (TL)</label><input name="tutar" type="number" step="0.01" min="0.01" required /></div>
              <div><label>Belge no</label><input name="belge_no" /></div>
              <div><label>Tarih</label><input name="belge_tarihi" type="date" value="${yerel(new Date())}" /></div>
            </div>
            <div><label>Açıklama</label><input name="aciklama" /></div>
            <div class="modal-actions">
              <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
              <button type="submit">Kaydet</button>
            </div>
          </form>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#mh-iade-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await Api.post('/api/muhasebe/alis-iadesi', {
              tedarikci_id: Number(fd.get('tedarikci_id')),
              tutar: Number(fd.get('tutar')),
              belge_no: fd.get('belge_no') || null,
              belge_tarihi: fd.get('belge_tarihi') || null,
              aciklama: fd.get('aciklama') || null
            });
            UI.toast('Alış iadesi kaydedildi', 'success');
            UI.closeModal(modal);
            yenile();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });

      await yenile();
    }
  };

  Views.muhasebe = view;
})();
