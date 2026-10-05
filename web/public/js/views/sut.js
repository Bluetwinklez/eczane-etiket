// SUT / ICD-10: SGK EK-4 listelerini yukleme ve tani kodundan katilim payi muafiyeti arama
(function () {
  const sayi = (n) => Number(n || 0).toLocaleString('tr-TR');

  // Ilac karti SUT sekmesi de ayni ozet cizimini kullanir
  function ilacOzetiHtml(d) {
    const yuklu = d.durum.ek4a || d.durum.ek4d_grup;
    if (!yuklu) {
      return `<div class="card form-ipucu">SGK SUT listeleri yüklü değil. <a href="#sut">SUT / ICD-10</a> sayfasından SGK'nın güncel SUT dosyasını yükleyin; ödeme listesi, kamu iskontosu, muafiyet ve rapor şartları burada görünür.</div>`;
    }
    const a = d.ek4a;
    let html = `<h4 style="margin:0 0 6px">SGK ödeme listesi (EK-4/A)</h4>`;
    if (!d.durum.ek4a) html += '<p class="form-ipucu">EK-4/A listesi yüklenmemiş.</p>';
    else if (!a) html += `<div class="card"><span class="badge warn">Listede yok</span> Bu barkod EK-4/A'da bulunamadı; SGK bedelini ödemez (elden satış). Barkod değişmiş olabilir, kontrol edin.</div>`;
    else {
      const isk = d.iskonto;
      html += `<table><tbody>
        <tr><th style="width:200px">Durum</th><td>${a.aktif ? '<span class="badge ok">Ödenir</span>' : `<span class="badge danger">Pasif</span> ${UI.esc(a.pasif_tarihi || '')}`} ${a.durum ? `· ${UI.esc(a.durum)}` : ''}</td></tr>
        <tr><th>Kamu no</th><td>${UI.esc(a.kamu_no || '-')}</td></tr>
        <tr><th>Eşdeğer grubu</th><td>${UI.esc(a.esdeger_grup || '-')}${a.referans_grup ? ` · Terapötik referans: ${UI.esc(a.referans_grup)}` : ''}</td></tr>
        ${a.giris_tarihi ? `<tr><th>Listeye giriş</th><td>${UI.esc(a.giris_tarihi)}</td></tr>` : ''}
        <tr><th>Kamu kurum iskontosu</th><td>${
          isk && isk.oran != null
            ? `<b>%${isk.oran}</b> <small class="form-ipucu">(DSF ${UI.tl(d.ilac.depocu_fiyati)} → ${UI.esc(isk.bantlar[isk.secili].etiket)} bandı)</small>`
            : isk
              ? `${isk.bantlar.map((b) => `${UI.esc(b.etiket)}: <b>%${b.oran ?? '-'}</b>`).join(' · ')}<br><small class="form-ipucu">Depocu satış fiyatı (DSF) girilirse bant otomatik seçilir.</small>`
              : '-'
        }</td></tr>
        ${a.ozel_iskonto ? `<tr><th>Özel iskonto</th><td>${UI.esc(a.ozel_iskonto)}</td></tr>` : ''}
        ${a.eczaci_iskonto ? `<tr><th>Eczacı iskontosu</th><td>${UI.esc(a.eczaci_iskonto)}</td></tr>` : ''}
      </tbody></table>`;
      if (d.esdegerler.length) {
        html += `<details style="margin-top:8px"><summary>Aynı eşdeğer gruptaki ${d.esdegerler.length} ürün</summary>
          <table><thead><tr><th>Ürün</th><th>Durum</th><th class="num">Stok</th><th></th></tr></thead><tbody>
          ${d.esdegerler.map((e) => `<tr><td>${UI.esc(e.ad)}</td><td>${e.pasif_tarihi ? '<span class="badge danger">Pasif</span>' : UI.esc(e.durum || '')}</td><td class="num">${e.ilac_id ? e.stok : '<span class="form-ipucu">katalogda yok</span>'}</td><td>${e.ilac_id ? `<button class="secondary" data-kart="${e.ilac_id}">Kart</button>` : ''}</td></tr>`).join('')}
          </tbody></table></details>`;
      }
    }

    html += `<h4 style="margin:16px 0 6px">Katılım payından muafiyet (EK-4/D)</h4>`;
    if (!d.durum.ek4d_grup) html += '<p class="form-ipucu">EK-4/D listesi yüklenmemiş.</p>';
    else if (!d.muafiyet.length) html += `<p class="form-ipucu">Etken madde${d.ilac.atc_kodu ? ' / ATC sınıfı' : ''} EK-4/D'de bulunamadı. ${d.ilac.etken_madde ? '' : 'Ürünün etken maddesi girilmemiş.'}</p>`;
    else {
      html += `<table><thead><tr><th>Hastalık</th><th>EK-4/D maddesi</th><th>ICD-10</th></tr></thead><tbody>
        ${d.muafiyet
          .map(
            (m) => `<tr><td><b>${UI.esc(m.kod || '')}</b> ${UI.esc(m.baslik)}<br><small class="form-ipucu">${UI.esc(m.ana || '')}</small></td>
              <td>${UI.esc(m.madde.ad)} ${m.madde.eslesme === 'sinif' ? '<span class="badge muted" title="ATC sınıfına göre eşleşti">sınıf</span>' : '<span class="badge ok">etken madde</span>'}
                ${m.madde.endikasyon ? '<span class="badge warn" title="(*) Endikasyon uyumu aranır">endikasyon*</span>' : ''}
                ${m.madde.kosul ? `<br><small>${UI.esc(m.madde.kosul)}</small>` : ''}</td>
              <td><small>${m.icd.map((i) => UI.esc(i.kod)).join(', ')}${m.icd_sayisi > m.icd.length ? ` +${m.icd_sayisi - m.icd.length}` : ''}</small></td></tr>`
          )
          .join('')}</tbody></table>
        <p class="form-ipucu">Muafiyet için reçetede/raporda bu ICD-10 kodlarından biri bulunmalıdır. "sınıf" eşleşmeleri ATC grubuna göredir; ilacın o gruba girdiğini doğrulayın.</p>`;
    }

    if (d.ek4e.length) {
      html += `<h4 style="margin:16px 0 6px">Reçeteleme kuralı (EK-4/E)</h4>
        <table><tbody>${d.ek4e.map((k) => `<tr><td style="width:40%">${UI.esc(k.baslik)}<br><small class="form-ipucu">${UI.esc(k.grup || '')}</small></td><td><b>${UI.esc(k.metin)}</b></td></tr>`).join('')}</tbody></table>
        ${d.ek4e_aciklama ? `<details style="margin-top:6px"><summary>Kısaltmaların açıklaması (KY, UH-P, EHU, A-72…)</summary><div style="white-space:pre-wrap;font-size:.9em">${UI.esc(d.ek4e_aciklama)}</div></details>` : ''}`;
    }
    if (d.ek4f.length) {
      html += `<h4 style="margin:16px 0 6px">Sağlık raporu ile verilebilir (EK-4/F)</h4>
        ${d.ek4f.map((k) => `<div class="card" style="white-space:pre-wrap;margin-bottom:6px">${UI.esc(k.metin)}</div>`).join('')}`;
    }
    html += `<p class="form-ipucu" style="margin-top:12px">Kaynak: SGK SUT EK-4 listeleri${d.durum.liste_tarihi ? ` (${UI.esc(d.durum.liste_tarihi)})` : ''}. Otomatik eşleştirme yardımcıdır; kesin karar için güncel SUT ve Medula esastır.</p>`;
    return html;
  }

  function grupHtml(g) {
    const eslesen = new Set((g.icd_eslesen || []).map((x) => x.kod));
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">${g.kod ? `<span style="color:var(--text-muted)">${UI.esc(g.kod)}</span> ` : ''}${UI.esc(g.baslik)}</h3>
        <small class="form-ipucu">${UI.esc(g.ana || '')}</small>
      </div>
      <div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:4px">
        ${g.icd.map((i) => `<span class="badge ${eslesen.has(i.kod) ? 'ok' : 'muted'}" title="${UI.esc(i.ad || '')}">${UI.esc(i.kod)}</span>`).join('')}
        ${g.icd_sayisi > g.icd.length ? `<span class="form-ipucu">+${g.icd_sayisi - g.icd.length} kod</span>` : ''}
      </div>
      ${g.icd_eslesen && g.icd_eslesen.length ? `<p style="margin:0 0 8px"><b>${UI.esc(g.icd_eslesen.map((x) => `${x.kod} ${x.ad || ''}`).join(' · '))}</b></p>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
        <div>
          <h4 style="margin:0 0 6px">Muaf ilaçlar ${g.ortak_not ? `<small class="form-ipucu">(${UI.esc(g.ortak_not)})</small>` : ''}</h4>
          ${g.ilaclar.length ? `<ul style="margin:0;padding-left:18px">${g.ilaclar.map((m) => `<li>${UI.esc(m.ad)}${m.endikasyon ? ' <span class="badge warn" title="(*) Endikasyon uyumu aranır">*</span>' : ''}${m.kosul ? `<br><small class="form-ipucu">${UI.esc(m.kosul)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="form-ipucu">Madde ayrıştırılamadı; resmi listeye bakın.</p>'}
        </div>
        <div>
          <h4 style="margin:0 0 6px">Kataloğunuzdaki uygun ürünler</h4>
          ${
            g.katalog.length
              ? `<table><thead><tr><th>Ürün</th><th>Madde</th><th class="num">Stok</th></tr></thead><tbody>
                ${g.katalog.map((k) => `<tr data-kart="${k.id}" style="cursor:pointer"><td>${UI.esc(k.ad)}</td><td><small>${UI.esc(k.madde)}</small></td><td class="num">${k.stok > 0 ? k.stok : '<span class="badge danger">0</span>'}</td></tr>`).join('')}
                </tbody></table>`
              : '<p class="form-ipucu">Eşleşen ürün yok (etken madde veya ATC kodu girilmiş ürünler eşleşir).</p>'
          }
        </div>
      </div>
    </div>`;
  }

  const view = {
    async render(container, ctx) {
      const yazma = ['admin', 'eczaci'].includes(ctx.user.rol);
      container.innerHTML = `
        <div class="card" id="sut-durum" style="margin-bottom:14px"></div>
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="sut-ara" placeholder="ICD-10 kodu (I10, E11.9, J45) veya hastalık adı (hipertansiyon, astım…)" style="flex:1 1 320px" />
            <button id="sut-ara-btn">Ara</button>
          </div>
          <p class="form-ipucu" style="margin:8px 0 0">Tanı kodunu yazın: hangi ilaçların katılım payından muaf olduğu ve stoğunuzdaki uygun ürünler listelenir. Ana kod yazılmışsa alt kodlar dahildir (EK-4/D Not 3).</p>
        </div>
        <div id="sut-sonuc"></div>`;

      const durumCiz = async () => {
        const d = await Api.get('/api/sgk/durum');
        const yuklu = d.ek4a || d.ek4d_grup;
        const dugmeler = yazma
          ? ` <button class="secondary" id="sut-indir">${yuklu ? 'SGK’dan güncelle' : 'SGK’dan indir'}</button>
              <label class="secondary" style="display:inline-block;cursor:pointer"><input type="file" id="sut-dosya" accept=".zip,.xlsx,.doc,.docx" hidden />Dosya yükle</label>`
          : '';
        document.getElementById('sut-durum').innerHTML = yuklu
          ? `<b>SGK SUT listeleri</b>${d.liste_tarihi ? ` (${UI.esc(d.liste_tarihi)})` : ''}: EK-4/A ${sayi(d.ek4a)} ilaç · EK-4/D ${sayi(d.ek4d_grup)} hastalık, ${sayi(d.ek4d_icd)} ICD-10 kodu · EK-4/E ${sayi(d.ek4e)} kural · EK-4/F ${sayi(d.ek4f)} madde
             <small class="form-ipucu">· yüklenme ${UI.esc(d.yuklenme || '-')}</small>${dugmeler}`
          : `<b>SGK SUT listeleri yüklü değil.</b> SGK'nın "Güncel 2013 SUT" zip dosyasını (sgk.gov.tr → Duyurular) ya da EK-4A (.xlsx), EK-4D/EK-4F (.doc), EK-4E (.docx) dosyalarını yükleyin.${dugmeler}`;
        const indir = document.getElementById('sut-indir');
        if (indir) {
          indir.addEventListener('click', async () => {
            indir.disabled = true;
            indir.textContent = 'İndiriliyor… (33 MB, 1-2 dakika sürebilir)';
            try {
              bitti(await Api.post('/api/sgk/indir', {}));
            } catch (err) {
              UI.toast(err.message, 'error');
              durumCiz();
            }
          });
        }
        const dosya = document.getElementById('sut-dosya');
        if (dosya) {
          dosya.addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            UI.toast('Dosya işleniyor…');
            try {
              const yanit = await fetch('/api/sgk/yukle?ad=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
              const v = await yanit.json();
              if (!yanit.ok) throw new Error(v.error || 'Yüklenemedi');
              bitti(v);
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          });
        }
      };
      const ADLAR = { ek4a: 'EK-4/A', ek4d: 'EK-4/D', ek4e: 'EK-4/E', ek4f: 'EK-4/F' };
      const bitti = (v) => {
        UI.toast(`Yüklendi: ${v.yuklenen.map((k) => ADLAR[k]).join(', ')}${v.sgk_isaretlenen ? ` · ${v.sgk_isaretlenen} ürün SGK kapsamında işaretlendi` : ''}`, 'success');
        durumCiz();
      };

      const ara = async () => {
        const q = document.getElementById('sut-ara').value.trim();
        const hedef = document.getElementById('sut-sonuc');
        if (q.length < 2) return (hedef.innerHTML = '');
        hedef.innerHTML = '<p class="form-ipucu">Aranıyor…</p>';
        try {
          const r = await Api.get('/api/sgk/icd?q=' + encodeURIComponent(q));
          hedef.innerHTML = r.gruplar.length
            ? r.gruplar.map(grupHtml).join('')
            : `<div class="card empty-state">"${UI.esc(q)}" için EK-4/D'de muafiyet grubu bulunamadı. Bu tanıda ilaçlar normal katılım payıyla verilir.</div>`;
        } catch (err) {
          hedef.innerHTML = `<div class="card empty-state">${UI.esc(err.message)}</div>`;
        }
      };
      document.getElementById('sut-ara-btn').addEventListener('click', ara);
      document.getElementById('sut-ara').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ara();
      });
      container.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kart]');
        if (k) window.IlacKartiAc(Number(k.dataset.kart));
      });
      await durumCiz();
      const onceden = sessionStorage.getItem('eczam:sut-ara');
      if (onceden) {
        sessionStorage.removeItem('eczam:sut-ara');
        document.getElementById('sut-ara').value = onceden;
        ara();
      }
    }
  };
  Views.sut = view;
  window.SutOzetiHtml = ilacOzetiHtml;
})();
