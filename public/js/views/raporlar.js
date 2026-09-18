(function () {
  const RAPORLAR = {
    satis: {
      baslik: 'Satış Raporu (Gün/Hafta/Ay)',
      periyot: true,
      tarih: true,
      kolonlar: [
        { alan: 'donem', baslik: 'Dönem' },
        { alan: 'satis_adedi', baslik: 'Satış Adedi' },
        { alan: 'toplam_ciro', baslik: 'Toplam Ciro', tl: true }
      ]
    },
    'en-cok-satan': {
      baslik: 'En Çok Satan İlaçlar',
      tarih: true,
      kolonlar: [
        { alan: 'ilac_adi', baslik: 'İlaç' },
        { alan: 'toplam_adet', baslik: 'Satılan Adet' },
        { alan: 'toplam_ciro', baslik: 'Toplam Ciro', tl: true }
      ]
    },
    'kritik-stok-skt': {
      baslik: 'Kritik Stok ve SKT Raporu',
      kolonlar: [
        { alan: 'ad', baslik: 'İlaç' },
        { alan: 'stok', baslik: 'Stok' },
        { alan: 'kritik_stok', baslik: 'Kritik Sınır' },
        { alan: 'skt', baslik: 'SKT' }
      ]
    },
    'kar-zarar': {
      baslik: 'Kâr-Zarar Raporu',
      tarih: true,
      kolonlar: [
        { alan: 'tarih', baslik: 'Tarih' },
        { alan: 'toplam_satis', baslik: 'Toplam Satış', tl: true },
        { alan: 'toplam_maliyet', baslik: 'Toplam Maliyet', tl: true },
        { alan: 'kar', baslik: 'Kâr', tl: true }
      ]
    },
    'recete-sgk': {
      baslik: 'Reçete/SGK İşlem Raporu',
      tarih: true,
      kolonlar: [
        { alan: 'id', baslik: 'Satış No' },
        { alan: 'tarih', baslik: 'Tarih' },
        { alan: 'musteri_adi', baslik: 'Müşteri' },
        { alan: 'toplam_tutar', baslik: 'Tutar', tl: true }
      ]
    }
  };

  function filtreleriOku() {
    return {
      periyot: document.getElementById('rapor-periyot')?.value,
      baslangic: document.getElementById('rapor-baslangic')?.value,
      bitis: document.getElementById('rapor-bitis')?.value
    };
  }

  function queryOlustur(extra) {
    const f = filtreleriOku();
    const params = new URLSearchParams();
    if (f.periyot) params.set('periyot', f.periyot);
    if (f.baslangic) params.set('baslangic', f.baslangic);
    if (f.bitis) params.set('bitis', f.bitis);
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  }

  async function raporGoster(tip) {
    const tanim = RAPORLAR[tip];
    const rows = await Api.get(`/api/raporlar/${tip}?${queryOlustur()}`);
    const tbody = document.getElementById('rapor-tbody');
    document.getElementById('rapor-thead').innerHTML =
      '<tr>' + tanim.kolonlar.map((k) => `<th${k.tl ? ' class="num"' : ''}>${k.baslik}</th>`).join('') + '</tr>';

    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              '<tr>' +
              tanim.kolonlar
                .map((k) => `<td${k.tl ? ' class="num"' : ''}>${k.tl ? UI.tl(r[k.alan]) : UI.esc(r[k.alan] ?? '-')}</td>`)
                .join('') +
              '</tr>'
          )
          .join('')
      : `<tr><td colspan="${tanim.kolonlar.length}" class="empty-state">Kayıt bulunamadı</td></tr>`;

    document.getElementById('rapor-csv').href = `/api/raporlar/${tip}?${queryOlustur({ format: 'csv' })}`;
    document.getElementById('rapor-pdf').href = `/api/raporlar/${tip}?${queryOlustur({ format: 'pdf' })}`;
  }

  function filtreAlanlariCiz(tip) {
    const tanim = RAPORLAR[tip];
    const alan = document.getElementById('rapor-filtreler');
    let html = '';
    if (tanim.periyot) {
      html += `
        <div>
          <label>Periyot</label>
          <select id="rapor-periyot">
            <option value="gunluk">Günlük</option>
            <option value="haftalik">Haftalık</option>
            <option value="aylik">Aylık</option>
          </select>
        </div>`;
    }
    if (tanim.tarih) {
      html += `
        <div><label>Başlangıç</label><input type="date" id="rapor-baslangic" /></div>
        <div><label>Bitiş</label><input type="date" id="rapor-bitis" /></div>`;
    }
    alan.innerHTML = html;
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="card">
          <div class="toolbar">
            <div>
              <label>Rapor Tipi</label>
              <select id="rapor-tip">
                ${Object.entries(RAPORLAR).map(([key, r]) => `<option value="${key}">${r.baslik}</option>`).join('')}
              </select>
            </div>
            <div class="form-grid" id="rapor-filtreler" style="margin:0"></div>
            <div class="spacer"></div>
            <button id="rapor-goruntule">Görüntüle</button>
            <a id="rapor-csv" class="secondary" style="text-decoration:none;display:inline-block" download><button type="button" class="secondary">CSV İndir</button></a>
            <a id="rapor-pdf" style="text-decoration:none;display:inline-block" download><button type="button" class="secondary">PDF İndir</button></a>
          </div>
          <table>
            <thead id="rapor-thead"></thead>
            <tbody id="rapor-tbody"></tbody>
          </table>
        </div>
      `;

      const tipSelect = document.getElementById('rapor-tip');
      filtreAlanlariCiz(tipSelect.value);
      await raporGoster(tipSelect.value);

      tipSelect.addEventListener('change', async () => {
        filtreAlanlariCiz(tipSelect.value);
        await raporGoster(tipSelect.value);
      });
      document.getElementById('rapor-goruntule').addEventListener('click', () => raporGoster(tipSelect.value));
    }
  };

  Views.raporlar = view;
})();
