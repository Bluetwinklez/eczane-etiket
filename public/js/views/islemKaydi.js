(function () {
  const YONTEM_ETIKET = { POST: 'Ekleme', PUT: 'Güncelleme', PATCH: 'Güncelleme', DELETE: 'Silme' };
  const OZEL_ETIKET = {
    '/api/auth/login': 'Giriş',
    '/api/auth/logout': 'Çıkış',
    '/api/auth/sifre-degistir': 'Şifre değişimi',
    '/api/yedekleme/import': 'Yedekten geri yükleme'
  };

  function islemEtiketi(r) {
    return OZEL_ETIKET[r.yol] || YONTEM_ETIKET[r.yontem] || r.yontem;
  }

  function sonucRozeti(kod) {
    if (kod < 300) return `<span class="badge ok">${kod}</span>`;
    if (kod === 401 || kod === 403 || kod === 429) return `<span class="badge danger">${kod}</span>`;
    return `<span class="badge warn">${kod}</span>`;
  }

  function filtreQuery(extra) {
    const p = new URLSearchParams();
    const deger = (id) => document.getElementById(id).value;
    if (deger('ik-kullanici')) p.set('kullanici_id', deger('ik-kullanici'));
    if (deger('ik-kaynak')) p.set('kaynak', deger('ik-kaynak'));
    if (deger('ik-baslangic')) p.set('baslangic', deger('ik-baslangic'));
    if (deger('ik-bitis')) p.set('bitis', deger('ik-bitis'));
    if (document.getElementById('ik-hatalar').checked) p.set('sadece_hatalar', '1');
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }

  const view = {
    async render(container) {
      const [kullanicilar, kaynaklar] = await Promise.all([
        Api.get('/api/kullanicilar'),
        Api.get('/api/islem-kayitlari/kaynaklar')
      ]);

      container.innerHTML = `
        <div class="card">
          <div class="form-grid">
            <div>
              <label>Kullanıcı</label>
              <select id="ik-kullanici">
                <option value="">Tümü</option>
                ${kullanicilar.map((k) => `<option value="${k.id}">${UI.esc(k.ad_soyad)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label>Modül</label>
              <select id="ik-kaynak">
                <option value="">Tümü</option>
                ${kaynaklar.map((k) => `<option value="${UI.esc(k)}">${UI.esc(k)}</option>`).join('')}
              </select>
            </div>
            <div><label>Başlangıç</label><input type="date" id="ik-baslangic" /></div>
            <div><label>Bitiş</label><input type="date" id="ik-bitis" /></div>
          </div>
          <div class="toolbar" style="margin-bottom:0">
            <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="ik-hatalar" style="width:auto" /> Sadece başarısız/yetkisiz işlemler</label>
            <div class="spacer"></div>
            <button id="ik-filtrele">Filtrele</button>
            <a id="ik-csv" download="islem-kaydi.csv"><button type="button" class="secondary">CSV İndir</button></a>
          </div>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Adres</th><th>Sonuç</th><th>Detay</th></tr></thead>
            <tbody id="ik-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        const rows = await Api.get('/api/islem-kayitlari?' + filtreQuery());
        document.getElementById('ik-csv').href = '/api/islem-kayitlari?' + filtreQuery({ format: 'csv', limit: 2000 });
        document.getElementById('ik-tbody').innerHTML = rows.length
          ? rows
              .map(
                (r) => `<tr>
                  <td style="white-space:nowrap">${UI.tarih(r.tarih)}</td>
                  <td>${UI.esc(r.kullanici_adi || '-')}</td>
                  <td>${islemEtiketi(r)}</td>
                  <td><code style="font-size:12px">${UI.esc(r.yol)}</code></td>
                  <td>${sonucRozeti(r.durum_kodu)}</td>
                  <td><span class="ik-detay" title="${UI.esc(r.detay || '')}">${UI.esc((r.detay || '').slice(0, 80))}</span></td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      document.getElementById('ik-filtrele').addEventListener('click', yenile);
      await yenile();
    }
  };

  Views.islemKaydi = view;
})();
