(function () {
  const DURUM = {
    eslesiyor: ['Eşleşiyor', 'ok'],
    its_fazla: ['İTS fazla', 'warn'],
    sistem_fazla: ['Sistem fazla', 'danger'],
    tanimsiz: ['Sistemde yok', 'muted']
  };
  const ISLEM_ROZET = { giris: 'ok', satis: 'muted', iade: 'warn' };

  function indir(ad, satirlar, kolonlar) {
    const csv = [kolonlar.map((k) => k[1]).join(';')]
      .concat(satirlar.map((s) => kolonlar.map((k) => String(s[k[0]] ?? '').replace(/;/g, ',')).join(';')))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = ad;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const view = {
    async render(container) {
      const yerel = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const bugun = new Date();
      let sekme = 'defter';
      let sonKarsilastirma = [];

      container.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <p class="form-ipucu" style="margin:0">Bu ekran İTS'ye <b>bildirim göndermez</b>. Okuttuğunuz karekodların kayıtlarını tutar, İTS ekranına girmeniz için dosya hazırlar ve İTS'den aldığınız stok listesini sistem stoğuyla karşılaştırır.</p>
        </div>
        <div class="toolbar" id="its-sekmeler">
          <button class="secondary" data-sekme="defter">Hareket defteri</button>
          <button class="secondary" data-sekme="esitleme">Stok eşitleme</button>
        </div>
        <div id="its-icerik"></div>`;

      const defterCiz = (hedef) => {
        hedef.innerHTML = `
          <div class="toolbar">
            <input id="its-bas" style="width:auto" type="date" value="${yerel(new Date(bugun.getFullYear(), bugun.getMonth(), 1))}" />
            <input id="its-bit" style="width:auto" type="date" value="${yerel(bugun)}" />
            <select id="its-tip" style="width:auto"><option value="">Tüm işlemler</option><option value="giris">Giriş</option><option value="satis">Satış</option><option value="iade">İade</option></select>
            <input id="its-seri" style="width:auto" placeholder="Seri no" />
            <button id="its-ara" class="secondary">Göster</button>
            <div class="spacer"></div>
            <a id="its-csv" style="text-decoration:none" download><button type="button" class="secondary">CSV</button></a>
            <a id="its-pdf" style="text-decoration:none" download><button type="button" class="secondary">PDF</button></a>
          </div>
          <div class="stat-row" id="its-ozet"></div>
          <div class="card"><table>
            <thead><tr><th>Tarih</th><th>İşlem</th><th>Ürün</th><th>Seri no</th><th>Parti</th><th>SKT</th><th>Belge</th></tr></thead>
            <tbody id="its-tbody"></tbody></table></div>`;
        const sorgu = () => {
          const p = new URLSearchParams({ baslangic: document.getElementById('its-bas').value, bitis: document.getElementById('its-bit').value });
          const tip = document.getElementById('its-tip').value;
          const seri = document.getElementById('its-seri').value.trim();
          if (tip) p.set('tip', tip);
          if (seri) p.set('seri_no', seri);
          return p.toString();
        };
        const yenile = async () => {
          document.getElementById('its-csv').href = `/api/its/hareketler?${sorgu()}&format=csv`;
          document.getElementById('its-pdf').href = `/api/its/hareketler?${sorgu()}&format=pdf`;
          try {
            const v = await Api.get(`/api/its/hareketler?${sorgu()}`);
            document.getElementById('its-ozet').innerHTML = `
              <div class="stat-tile c-mint"><div class="label">Giriş</div><div class="value">${v.sayim.giris}</div></div>
              <div class="stat-tile c-lilac"><div class="label">Satış</div><div class="value">${v.sayim.satis}</div></div>
              <div class="stat-tile c-amber"><div class="label">İade</div><div class="value">${v.sayim.iade}</div></div>`;
            document.getElementById('its-tbody').innerHTML = v.satirlar.length
              ? v.satirlar
                  .map(
                    (s) => `<tr><td>${UI.esc(s.tarih)}</td><td><span class="badge ${ISLEM_ROZET[s.tip]}">${s.islem}</span></td><td>${UI.esc(s.ilac_adi || s.gtin)}</td>
                      <td>${UI.esc(s.seri_no)}</td><td>${UI.esc(s.parti_no || '-')}</td><td>${UI.esc(s.skt || '-')}</td><td>${UI.esc(s.belge || '-')}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="7" class="empty-state">Kayıt yok. Satışta veya mal kabulde karekod okutunca burada görünür.</td></tr>';
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        };
        document.getElementById('its-ara').addEventListener('click', yenile);
        return yenile();
      };

      const esitlemeCiz = (hedef) => {
        hedef.innerHTML = `
          <div class="card">
            <h3>İTS stok listesi ile karşılaştır</h3>
            <p class="form-ipucu">İTS ekranından indirdiğiniz stok listesini (CSV / metin) yükleyin ya da yapıştırın. İlk kolon GTIN/barkod, varsa ikinci kolon adet olmalı; adet yoksa her satır bir kutu sayılır.</p>
            <input id="its-dosya" type="file" accept=".csv,.txt,text/csv,text/plain" />
            <textarea id="its-metin" rows="6" placeholder="GTIN;Adet&#10;08699504010012;12"></textarea>
            <div class="modal-actions"><button id="its-karsilastir">Karşılaştır</button></div>
          </div>
          <div class="stat-row" id="its-es-ozet"></div>
          <div id="its-es-sonuc"></div>`;
        document.getElementById('its-dosya').addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (f) document.getElementById('its-metin').value = await f.text();
        });
        document.getElementById('its-karsilastir').addEventListener('click', async () => {
          try {
            const v = await Api.post('/api/its/karsilastir', { metin: document.getElementById('its-metin').value });
            sonKarsilastirma = v.satirlar;
            const o = v.ozet;
            document.getElementById('its-es-ozet').innerHTML = `
              <div class="stat-tile c-mint"><div class="label">Eşleşen</div><div class="value">${o.eslesen}</div></div>
              <div class="stat-tile c-amber"><div class="label">İTS fazla</div><div class="value">${o.its_fazla}</div></div>
              <div class="stat-tile c-rose"><div class="label">Sistem fazla</div><div class="value">${o.sistem_fazla}</div></div>
              <div class="stat-tile"><div class="label">Sistemde yok</div><div class="value">${o.tanimsiz}</div></div>`;
            document.getElementById('its-es-sonuc').innerHTML = `
              <div class="toolbar"><div class="spacer"></div><button type="button" class="secondary" id="its-fark-indir">Farkları CSV indir</button></div>
              <div class="card"><table>
                <thead><tr><th>Ürün</th><th>GTIN</th><th class="num">İTS</th><th class="num">Sistem</th><th class="num">Fark</th><th>Durum</th></tr></thead>
                <tbody>${v.satirlar
                  .map(
                    (s) => `<tr><td>${UI.esc(s.ilac_adi)}</td><td>${UI.esc(s.gtin)}</td><td class="num">${s.its_adet}</td><td class="num">${s.sistem_adet}</td>
                      <td class="num">${s.fark > 0 ? '+' : ''}${s.fark}</td><td><span class="badge ${DURUM[s.durum][1]}">${DURUM[s.durum][0]}</span></td></tr>`
                  )
                  .join('')}</tbody></table></div>
              ${o.gecersiz_satir ? `<p class="form-ipucu">${o.gecersiz_satir} satır geçersiz olduğu için atlandı.</p>` : ''}`;
            document.getElementById('its-fark-indir').addEventListener('click', () =>
              indir(
                'its-stok-farklari.csv',
                sonKarsilastirma.filter((s) => s.durum !== 'eslesiyor').map((s) => ({ ...s, durum: DURUM[s.durum][0] })),
                [['ilac_adi', 'Ürün'], ['gtin', 'GTIN'], ['its_adet', 'İTS adet'], ['sistem_adet', 'Sistem adet'], ['fark', 'Fark'], ['durum', 'Durum']]
              )
            );
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      };

      const goster = async () => {
        document.querySelectorAll('#its-sekmeler button').forEach((b) => b.classList.toggle('active', b.dataset.sekme === sekme));
        const hedef = document.getElementById('its-icerik');
        if (sekme === 'defter') await defterCiz(hedef);
        else esitlemeCiz(hedef);
      };
      document.getElementById('its-sekmeler').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-sekme]');
        if (!b) return;
        sekme = b.dataset.sekme;
        goster();
      });
      await goster();
    }
  };

  Views.its = view;
})();
