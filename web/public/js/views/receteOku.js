// Recete oku: fotograf (kamera/dosya) → tarayicida OCR (Tesseract.js, Turkce) → ilac eslestirme → satis sepeti.
// Fotograf sunucuya gonderilmez; yalnizca okunan metin eslestirme icin gider.
(function () {
  const OCR_KUTUPHANE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let ocrYukleniyor = null;
  const ocrYukle = () => {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!ocrYukleniyor) {
      ocrYukleniyor = new Promise((tamam, hata) => {
        const s = document.createElement('script');
        s.src = OCR_KUTUPHANE;
        s.onload = () => tamam(window.Tesseract);
        s.onerror = () => {
          ocrYukleniyor = null;
          hata(new Error('Okuma modülü yüklenemedi (ilk kullanımda internet gerekir). Metni elle yapıştırabilirsiniz.'));
        };
        document.head.appendChild(s);
      });
    }
    return ocrYukleniyor;
  };

  // Telefon fotograflari buyuk olur: uzun kenari 2000 px'e indirip gri tonlama ile OCR'i hizlandir
  async function goruntuHazirla(dosya) {
    const url = URL.createObjectURL(dosya);
    try {
      const img = await new Promise((tamam, hata) => {
        const i = new Image();
        i.onload = () => tamam(i);
        i.onerror = () => hata(new Error('Fotoğraf açılamadı'));
        i.src = url;
      });
      const oran = Math.min(1, 2000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * oran);
      c.height = Math.round(img.height * oran);
      const ctx = c.getContext('2d');
      ctx.filter = 'grayscale(1) contrast(1.3)';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const view = {
    async render(container) {
      let sonuc = null;
      container.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <label class="dugme"><input type="file" id="ro-foto" accept="image/*" capture="environment" hidden />📷 Reçete fotoğrafı çek / seç</label>
            <span id="ro-durum" class="form-ipucu">Fotoğraf yalnızca bu cihazda okunur, sunucuya gönderilmez.</span>
          </div>
          <img id="ro-onizleme" alt="" style="display:none;max-width:100%;max-height:260px;margin-top:10px;border-radius:10px;border:1px solid var(--border)" />
        </div>
        <div class="card" style="margin-bottom:14px">
          <label for="ro-metin">Okunan metin (düzeltebilir ya da e-reçete metnini yapıştırabilirsiniz)</label>
          <textarea id="ro-metin" rows="8" placeholder="Örnek:&#10;PAROL 500 MG 20 TABLET  3x1  2 kutu&#10;BELOC ZOK 50 MG 28 TABLET 1x1"></textarea>
          <div style="margin-top:8px"><button id="ro-eslestir">İlaçları bul</button></div>
        </div>
        <div id="ro-sonuc"></div>`;

      const durum = (m) => (document.getElementById('ro-durum').textContent = m);

      const ciz = () => {
        const hedef = document.getElementById('ro-sonuc');
        if (!sonuc) return (hedef.innerHTML = '');
        const ust = `${sonuc.recete_no ? `<span class="badge muted">e-Reçete ${UI.esc(sonuc.recete_no)}</span> ` : ''}${sonuc.tanilar
          .map((t) => `<button class="secondary" data-tani="${UI.esc(t)}" title="Katılım payı muafiyeti (SUT)">${UI.esc(t)}</button>`)
          .join(' ')}`;
        if (!sonuc.kalemler.length) {
          hedef.innerHTML = `<div class="card">${ust}<p class="empty-state">Metinde tanınan ilaç bulunamadı. Metni düzeltip tekrar deneyin ya da ürünleri kasada arayın.</p></div>`;
          return;
        }
        hedef.innerHTML = `<div class="card">
          ${ust ? `<div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">${ust}</div>` : ''}
          <table><thead><tr><th></th><th>Reçetedeki satır</th><th>Ürün</th><th class="num">Adet</th><th>Kullanım</th></tr></thead><tbody>
          ${sonuc.kalemler
            .map((k, i) => {
              const ilk = k.adaylar[0];
              return `<tr>
                <td><input type="checkbox" class="ro-sec" data-i="${i}" ${ilk.kaynak === 'katalog' ? 'checked' : ''} /></td>
                <td><small>${UI.esc(k.satir)}</small></td>
                <td><select class="ro-urun" data-i="${i}">${k.adaylar
                  .map((a, j) => `<option value="${j}">${UI.esc(a.ad)}${a.kaynak === 'katalog' ? ` — stok ${a.stok}` : ' — katalogda yok (TİTCK)'}</option>`)
                  .join('')}</select></td>
                <td class="num"><input type="number" class="ro-adet" data-i="${i}" min="1" max="20" value="${k.adet}" style="width:70px" /></td>
                <td>${UI.esc(k.kullanim || '-')}</td></tr>`;
            })
            .join('')}</tbody></table>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button id="ro-sepete">Seçilenleri satış sepetine gönder</button>
          <span class="form-ipucu">Katalogda olmayan ürünleri İlaç Kartı → "TİTCK listesinde ara" ile ekleyebilirsiniz. Eşleşmeyi mutlaka reçeteyle karşılaştırın.</span></div>
        </div>`;
      };

      const eslestir = async () => {
        const metin = document.getElementById('ro-metin').value;
        if (metin.trim().length < 3) return UI.toast('Önce fotoğraf okutun ya da metin yapıştırın', 'error');
        try {
          sonuc = await Api.post('/api/recete-oku', { metin });
          ciz();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      };

      document.getElementById('ro-foto').addEventListener('change', async (e) => {
        const dosya = e.target.files[0];
        if (!dosya) return;
        const onizleme = document.getElementById('ro-onizleme');
        onizleme.src = URL.createObjectURL(dosya);
        onizleme.style.display = 'block';
        try {
          durum('Okuma modülü hazırlanıyor…');
          const T = await ocrYukle();
          const tuval = await goruntuHazirla(dosya);
          const r = await T.recognize(tuval, 'tur', {
            logger: (m) => m.status === 'recognizing text' && durum(`Okunuyor… %${Math.round(m.progress * 100)}`)
          });
          document.getElementById('ro-metin').value = r.data.text;
          durum('Okundu. Metni kontrol edip "İlaçları bul"a basın.');
          await eslestir();
        } catch (err) {
          durum(err.message);
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('ro-eslestir').addEventListener('click', eslestir);

      container.addEventListener('click', (e) => {
        const tani = e.target.closest('[data-tani]');
        if (tani) {
          try {
            sessionStorage.setItem('eczam:sut-ara', tani.dataset.tani);
          } catch (err) {
            /* arama bos acilir */
          }
          location.hash = '#sut';
          return;
        }
        if (e.target.id !== 'ro-sepete') return;
        const idler = [];
        let atlanan = 0;
        container.querySelectorAll('.ro-sec:checked').forEach((cb) => {
          const i = Number(cb.dataset.i);
          const a = sonuc.kalemler[i].adaylar[Number(container.querySelector(`.ro-urun[data-i="${i}"]`).value)];
          const adet = Math.min(20, Math.max(1, Number(container.querySelector(`.ro-adet[data-i="${i}"]`).value) || 1));
          if (a.kaynak !== 'katalog') return atlanan++;
          for (let n = 0; n < adet; n++) idler.push(a.id);
        });
        if (atlanan) UI.toast(`${atlanan} ürün katalogda olmadığı için gönderilmedi`, 'error');
        if (!idler.length) return UI.toast('Sepete gönderilecek ürün seçin', 'error');
        EczamSecim.sepeteGonder(idler);
      });
    }
  };
  Views.receteOku = view;
})();
