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
        { alan: 'toplam_iade', baslik: 'İade', tl: true },
        { alan: 'toplam_maliyet', baslik: 'Mal Maliyeti', tl: true },
        { alan: 'kar', baslik: 'Brüt Kâr', tl: true },
        { alan: 'toplam_gider', baslik: 'İşletme Gideri', tl: true },
        { alan: 'net_kar', baslik: 'Net Kâr', tl: true }
      ]
    },
    'recete-sgk': {
      baslik: 'Reçete/SGK İşlem Raporu',
      tarih: true,
      kolonlar: [
        { alan: 'id', baslik: 'Satış No' },
        { alan: 'tarih', baslik: 'Tarih' },
        { alan: 'musteri_adi', baslik: 'Müşteri' },
        { alan: 'recete_no', baslik: 'Reçete No' },
        { alan: 'recete_turu', baslik: 'Tür' },
        { alan: 'doktor_adi', baslik: 'Doktor' },
        { alan: 'toplam_tutar', baslik: 'Tutar', tl: true }
      ]
    },
    'kontrollu-ilac': {
      baslik: 'Kontrollü İlaç Defteri (kırmızı/yeşil reçete)',
      tarih: true,
      kolonlar: [
        { alan: 'tarih', baslik: 'Tarih' },
        { alan: 'ilac_adi', baslik: 'İlaç' },
        { alan: 'recete_rengi', baslik: 'Reçete' },
        { alan: 'giris', baslik: 'Giriş' },
        { alan: 'cikis', baslik: 'Çıkış' },
        { alan: 'bakiye', baslik: 'Bakiye' },
        { alan: 'recete_no', baslik: 'Reçete No' },
        { alan: 'doktor', baslik: 'Doktor' },
        { alan: 'hasta', baslik: 'Hasta' },
        { alan: 'hasta_tc', baslik: 'Hasta TC' },
        { alan: 'aciklama', baslik: 'Açıklama' }
      ]
    },
    'olu-stok': {
      baslik: 'Ölü Stok (90 gündür satılmayan)',
      kolonlar: [
        { alan: 'ad', baslik: 'Ürün' },
        { alan: 'kategori', baslik: 'Kategori' },
        { alan: 'stok', baslik: 'Stok' },
        { alan: 'son_satis', baslik: 'Son Satış' },
        { alan: 'en_yakin_skt', baslik: 'En Yakın SKT' },
        { alan: 'bagli_sermaye', baslik: 'Bağlı Sermaye', tl: true }
      ]
    },
    abc: {
      baslik: 'ABC Analizi (ciro payına göre)',
      tarih: true,
      kolonlar: [
        { alan: 'sinif', baslik: 'Sınıf' },
        { alan: 'ad', baslik: 'Ürün' },
        { alan: 'adet', baslik: 'Adet' },
        { alan: 'ciro', baslik: 'Ciro', tl: true },
        { alan: 'pay', baslik: 'Pay (%)' },
        { alan: 'kumulatif_pay', baslik: 'Kümülatif (%)' },
        { alan: 'brut_kar', baslik: 'Brüt Kâr', tl: true }
      ]
    },
    'tedarikci-fiyat': {
      baslik: 'Tedarikçi Fiyat Karşılaştırma',
      kolonlar: [
        { alan: 'ilac_adi', baslik: 'Ürün' },
        { alan: 'tedarikci', baslik: 'Tedarikçi' },
        { alan: 'son_maliyet', baslik: 'Son Birim Maliyet', tl: true },
        { alan: 'ortalama_maliyet', baslik: 'Ortalama', tl: true },
        { alan: 'fark_yuzde', baslik: 'En Ucuzdan Fark (%)' },
        { alan: 'en_ucuz', baslik: 'En Ucuz' },
        { alan: 'alim_sayisi', baslik: 'Alım Sayısı' },
        { alan: 'son_alim', baslik: 'Son Alım' }
      ]
    },
    iadeler: {
      baslik: 'İade Raporu',
      tarih: true,
      kolonlar: [
        { alan: 'id', baslik: 'İade No' },
        { alan: 'tarih', baslik: 'Tarih' },
        { alan: 'satis_id', baslik: 'Satış No' },
        { alan: 'urunler', baslik: 'Ürünler' },
        { alan: 'toplam_tutar', baslik: 'Tutar', tl: true },
        { alan: 'stoga_alindi', baslik: 'Stoğa Alındı' },
        { alan: 'neden', baslik: 'Neden' }
      ]
    },
    'kampanya-performansi': {
      baslik: 'Kampanya Performansı',
      tarih: true,
      kolonlar: [
        { alan: 'kampanya_adi', baslik: 'Kampanya' },
        { alan: 'satis_adedi', baslik: 'Satış Adedi' },
        { alan: 'toplam_adet', baslik: 'Ürün Adedi' },
        { alan: 'toplam_indirim', baslik: 'Verilen İndirim', tl: true },
        { alan: 'net_ciro', baslik: 'Net Ciro', tl: true },
        { alan: 'brut_kar', baslik: 'Brüt Kâr', tl: true }
      ]
    },
    'parti-skt': {
      baslik: 'Parti Bazlı SKT Raporu (180 gün)',
      kolonlar: [
        { alan: 'ilac_adi', baslik: 'Ürün' },
        { alan: 'parti_no', baslik: 'Parti No' },
        { alan: 'sube_adi', baslik: 'Şube' },
        { alan: 'skt', baslik: 'SKT' },
        { alan: 'kalan_gun', baslik: 'Kalan Gün' },
        { alan: 'miktar', baslik: 'Miktar' },
        { alan: 'alis_degeri', baslik: 'Alış Değeri', tl: true }
      ]
    },
    'stok-degeri': {
      baslik: 'Stok Değeri Raporu',
      kolonlar: [
        { alan: 'kategori', baslik: 'Kategori' },
        { alan: 'urun_cesidi', baslik: 'Ürün Çeşidi' },
        { alan: 'toplam_adet', baslik: 'Toplam Adet' },
        { alan: 'alis_degeri', baslik: 'Alış Değeri', tl: true },
        { alan: 'satis_degeri', baslik: 'Satış Değeri', tl: true }
      ]
    },
    'urun-tipi': {
      baslik: 'Ürün Tipi Bazında Satış',
      tarih: true,
      kolonlar: [
        { alan: 'urun_tipi_adi', baslik: 'Ürün Tipi' },
        { alan: 'toplam_adet', baslik: 'Satılan Adet' },
        { alan: 'toplam_ciro', baslik: 'Ciro', tl: true },
        { alan: 'ciro_payi', baslik: 'Ciro Payı (%)' },
        { alan: 'brut_kar', baslik: 'Brüt Kâr', tl: true }
      ]
    },
    'personel-performans': {
      baslik: 'Personel Satış Performansı',
      tarih: true,
      kolonlar: [
        { alan: 'personel', baslik: 'Personel' },
        { alan: 'rol', baslik: 'Rol' },
        { alan: 'satis_adedi', baslik: 'Satış Adedi' },
        { alan: 'toplam_ciro', baslik: 'Toplam Ciro', tl: true },
        { alan: 'ortalama_sepet', baslik: 'Ortalama Sepet', tl: true }
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
