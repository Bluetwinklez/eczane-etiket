// Eczam Mobil — islem ekranlari (akilli oneriler, hizli satis, musteri/veresiye, mal kabul, siparisler).
// mobil.js'ten ONCE yuklenir ve window.EczamEklenti(M) ile ekranlari kaydeder; M, cekirdegin yardimcilarini verir.
window.EczamEklenti = (M) => {
  'use strict';
  const { $, esc, tl, svg, get, post, put, toast, sayfaAc, cerceve, hataKutusu, cevrimdisiNot, oturum, uyg, urunKarti, barkodCoz, kameraBaslat } = M;
  const yonetici = () => ['admin', 'eczaci'].includes(oturum.kullanici.rol);
  const bos = (m) => `<p class="alt-yazi" style="margin:8px 0">${m}</p>`;
  const baslik = (m) => `<h3 style="font-family:var(--font-baslik);margin:18px 0 4px">${m}</h3>`;
  const tarihKisa = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—');
  const hataMesaji = (e) => (e.cevrimdisi ? 'Bu işlem için internet bağlantısı gerekir.' : e.message);
  let kameraDur = null;
  const kamerayiKapat = () => {
    if (kameraDur) kameraDur();
    kameraDur = null;
  };
  M.ekranTemizle.push(kamerayiKapat);

  // Urun arama kutusu + sonuc listesi (satis ve mal kabul ortak)
  function urunAraKutusu(kapsayici, secildi, { kamera = true } = {}) {
    kapsayici.innerHTML = `<div style="display:flex;gap:10px;margin-bottom:10px">
        <input class="alan" id="ua-ara" inputmode="search" placeholder="Ürün adı veya barkod" aria-label="Ürün ara" autocomplete="off" />
        ${kamera ? `<button class="yuvarlak" type="button" id="ua-kamera" style="background:var(--mavi);width:56px;height:56px;flex:none" aria-label="Kamerayı aç/kapat">${svg('tara')}</button>` : ''}
      </div>
      <div class="kamera kapali" id="ua-kutu" hidden></div>
      <div id="ua-sonuc"></div>`;
    const sonuc = $('#ua-sonuc', kapsayici);
    let zamanlayici;
    const ara = async (metin) => {
      const q = metin.trim();
      if (q.length < 2) return (sonuc.innerHTML = '');
      try {
        const liste = await get('/api/ilaclar?q=' + encodeURIComponent(q), { onbellek: true });
        const tam = liste.find((i) => i.barkod === q);
        if (tam) return secildi(tam), (sonuc.innerHTML = '');
        sonuc.innerHTML = liste.length
          ? liste
              .slice(0, 6)
              .map((i) => `<button class="satir" data-id="${i.id}" type="button" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">${esc(i.ad)}<small>${tl(i.satis_fiyati)} · stok ${i.stok}</small></div><span class="rozet">Ekle</span></button>`)
              .join('')
          : bos('Ürün bulunamadı');
        sonuc.querySelectorAll('[data-id]').forEach((b) =>
          b.addEventListener('click', () => {
            secildi(liste.find((i) => i.id === Number(b.dataset.id)));
            $('#ua-ara', kapsayici).value = '';
            sonuc.innerHTML = '';
          })
        );
      } catch (e) {
        sonuc.innerHTML = hataKutusu(e);
      }
    };
    $('#ua-ara', kapsayici).addEventListener('input', (e) => {
      clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => ara(e.target.value), 250);
    });
    $('#ua-ara', kapsayici).addEventListener('keydown', (e) => e.key === 'Enter' && (clearTimeout(zamanlayici), ara(e.target.value)));

    const kamKutu = $('#ua-kutu', kapsayici);
    let sonOkunan = '';
    let sonZaman = 0;
    const kamBtn = $('#ua-kamera', kapsayici);
    if (kamBtn)
      kamBtn.addEventListener('click', async () => {
        if (kameraDur) {
          kamerayiKapat();
          kamKutu.hidden = true;
          return;
        }
        kamKutu.hidden = false;
        kameraDur = await kameraBaslat(kamKutu, async (metin) => {
          const simdi = Date.now();
          if (metin === sonOkunan && simdi - sonZaman < 2500) return;
          sonOkunan = metin;
          sonZaman = simdi;
          if (navigator.vibrate) navigator.vibrate(40);
          try {
            const { ilac } = await barkodCoz(metin);
            if (ilac) secildi(ilac);
            else toast('Ürün bulunamadı');
          } catch (e) {
            toast(e.message);
          }
        });
      });
  }

  // ---------- Akilli oneriler ----------
  async function oneriEkrani() {
    cerceve('Akıllı Öneriler', 'ozet', '<div class="yukleniyor">Yükleniyor…</div>', { geri: true });
    let o;
    try {
      o = await get('/api/oneriler', { onbellek: true });
    } catch (e) {
      return cerceve('Akıllı Öneriler', 'ozet', hataKutusu(e), { geri: true });
    }
    const gs = o.gun_sonu;
    const fark = gs.dun_ciro > 0 ? Math.round(((gs.ciro - gs.dun_ciro) / gs.dun_ciro) * 100) : null;
    const durum = { bitti: ['Bitti', 'kirmizi'], yarin_biter: ['Yarın biter', 'kirmizi'], yakinda: ['Yakında', 'sari'] };
    cerceve(
      'Akıllı Öneriler',
      'ozet',
      `${cevrimdisiNot(o)}
      <div class="kart bg-yesil"><h2>Bugünün özeti</h2><div class="tutar">${tl(gs.ciro)}</div>
        <div class="fark">${gs.satis_adedi} satış · tahmini kâr ${tl(gs.kar)}${fark === null ? '' : ` · ${fark >= 0 ? '▲' : '▼'} %${Math.abs(fark)} dünden`}</div></div>
      ${gs.en_cok_satan ? `<p class="alt-yazi">En çok satan: <b>${esc(gs.en_cok_satan.ad)}</b> (${gs.en_cok_satan.adet} adet)</p>` : ''}
      ${baslik(`Stoğu bitiyor${o.bitmek_uzere_toplam > o.bitmek_uzere.length ? ` (${o.bitmek_uzere_toplam})` : ''}`)}
      ${
        o.bitmek_uzere.length
          ? o.bitmek_uzere
              .map((b) => `<div class="satir"><div class="ad">${esc(b.ad)}<small>Stok ${b.stok} · günde ~${b.gunluk_ortalama} · önerilen sipariş ${b.onerilen_adet}</small></div><span class="rozet ${durum[b.durum][1]}">${durum[b.durum][0]}${b.durum === 'yakinda' ? ` · ${b.yetecek_gun} gün` : ''}</span></div>`)
              .join('')
          : bos('Stoklar rahat görünüyor 👍')
      }
      ${yonetici() && o.bitmek_uzere.length ? '<a class="hap siyah" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="#/siparisler">Siparişlere git</a>' : ''}
      ${baslik('SKT için öneri')}
      ${
        o.skt_indirim.length
          ? o.skt_indirim
              .map((x) =>
                x.tur === 'dolmus'
                  ? `<div class="satir"><div class="ad">${esc(x.ad)}<small>${x.parti_no ? 'Parti ' + esc(x.parti_no) : 'Partisiz'} · ${x.miktar} adet · SKT ${tarihKisa(x.skt)}</small></div><span class="rozet kirmizi">Süresi geçti</span></div>`
                  : `<div class="satir"><div class="ad">${esc(x.ad)}<small>${x.fazla} adet ${x.kalan_gun} gün içinde satılamayabilir · olası zarar ${tl(x.tahmini_zarar)}</small></div>${
                      x.kampanya_var
                        ? '<span class="rozet yesil">Kampanya aktif</span>'
                        : yonetici() && !x.receteli
                          ? `<button class="rozet sari" type="button" data-kampanya="${x.ilac_id}" data-yuzde="${x.onerilen_indirim}" data-skt="${esc(x.skt)}" data-ad="${esc(x.ad)}" style="cursor:pointer">Kampanya başlat · %${x.onerilen_indirim}</button>`
                          : `<span class="rozet sari">%${x.onerilen_indirim} indirim</span>`
                    }</div>`
              )
              .join('')
          : bos('Yaklaşan riskli parti yok')
      }
      ${o.olu_stok.adet ? `${baslik('Ölü stok')}<p class="alt-yazi">${o.olu_stok.adet} ürün ${o.olu_stok.gun} gündür satılmadı. Bağlı sermaye: <b>${tl(o.olu_stok.bagli_sermaye)}</b></p>${o.olu_stok.ilk.map((u) => `<div class="satir"><div class="ad">${esc(u.ad)}<small>Stok ${u.stok}</small></div><span class="rozet">${tl(u.bagli_sermaye)}</span></div>`).join('')}` : ''}`,
      { geri: true }
    );
    uyg.querySelectorAll('[data-kampanya]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm(`${b.dataset.ad}: %${b.dataset.yuzde} indirim kampanyası ${tarihKisa(b.dataset.skt)} tarihine kadar başlatılsın mı?`)) return;
        b.disabled = true;
        try {
          await post('/api/kampanyalar', {
            ad: `SKT indirimi: ${b.dataset.ad}`,
            tip: 'yuzde',
            hedef_tip: 'urun',
            hedef_deger: b.dataset.kampanya,
            indirim_yuzdesi: Number(b.dataset.yuzde),
            bitis: b.dataset.skt
          });
          toast('Kampanya başlatıldı');
          oneriEkrani();
        } catch (e) {
          b.disabled = false;
          toast(hataMesaji(e));
        }
      })
    );
  }

  // ---------- Hizli satis ----------
  const sepet = new Map(); // ilac_id -> { ilac, adet }
  let sepetOdeme = 'nakit';
  let sepetMusteri = null;
  const ODEMELER = [['nakit', 'Nakit'], ['kredi_karti', 'Kart'], ['veresiye', 'Veresiye']];
  const sepetToplam = () => [...sepet.values()].reduce((t, k) => t + k.ilac.satis_fiyati * k.adet, 0);

  function hizliSatisEkrani() {
    cerceve(
      'Hızlı Satış',
      'satis',
      `<div id="hs-ara"></div>
       <div id="hs-sepet"></div>
       <div id="hs-alt"></div>`,
      { geri: true }
    );
    urunAraKutusu($('#hs-ara'), (ilac) => {
      const k = sepet.get(ilac.id);
      if (k) k.adet += 1;
      else sepet.set(ilac.id, { ilac, adet: 1 });
      if (ilac.stok <= 0) toast(`${ilac.ad}: stokta yok görünüyor`);
      else toast(`${ilac.ad} eklendi`);
      sepetCiz();
    });
    sepetCiz();
  }

  function sepetCiz() {
    const kutu = $('#hs-sepet');
    const alt = $('#hs-alt');
    if (!kutu) return;
    const kalemler = [...sepet.values()];
    kutu.innerHTML = kalemler.length
      ? `<div class="kart bg-krem" style="padding:12px 16px">${kalemler
          .map(
            (k) => `<div class="satir"><div class="ad">${esc(k.ilac.ad)}<small>${tl(k.ilac.satis_fiyati)} × ${k.adet}${k.ilac.receteli ? ' · reçeteli' : ''}</small></div>
              <button class="yuvarlak" data-eksi="${k.ilac.id}" style="width:40px;height:40px;background:var(--beyaz)" aria-label="Azalt">−</button>
              <b>${k.adet}</b>
              <button class="yuvarlak" data-arti="${k.ilac.id}" style="width:40px;height:40px;background:var(--yesil)" aria-label="Artır">+</button></div>`
          )
          .join('')}</div>`
      : bos('Sepet boş. Ürün arayın ya da barkod okutun.');
    kutu.querySelectorAll('[data-arti]').forEach((b) => (b.onclick = () => ((sepet.get(Number(b.dataset.arti)).adet += 1), sepetCiz())));
    kutu.querySelectorAll('[data-eksi]').forEach(
      (b) =>
        (b.onclick = () => {
          const k = sepet.get(Number(b.dataset.eksi));
          if (--k.adet <= 0) sepet.delete(k.ilac.id);
          sepetCiz();
        })
    );
    alt.innerHTML = kalemler.length
      ? `<div class="cipler">${ODEMELER.map(([k, a]) => `<button class="hap ${sepetOdeme === k ? 'secili' : ''}" data-odeme="${k}">${a}</button>`).join('')}</div>
         <div class="satir" style="border-top:none"><div class="ad">Müşteri<small>${sepetMusteri ? esc(sepetMusteri.ad_soyad) : sepetOdeme === 'veresiye' ? 'Veresiye için müşteri seçin' : 'Perakende'}</small></div>
           <button class="hap" id="hs-musteri" type="button">${sepetMusteri ? 'Değiştir' : 'Seç'}</button></div>
         <div class="kart bg-yesil" style="margin-top:8px"><h2>Tahmini toplam</h2><div class="tutar">${tl(sepetToplam())}</div><div class="fark">Kampanya ve indirimler satışta uygulanır</div></div>
         <button class="hap siyah" id="hs-tamamla" style="margin-top:12px">Satışı tamamla</button>
         <button class="hap" id="hs-temizle" style="margin-top:10px;width:100%">Sepeti boşalt</button>`
      : '';
    alt.querySelectorAll('[data-odeme]').forEach(
      (b) =>
        (b.onclick = () => {
          sepetOdeme = b.dataset.odeme;
          sepetCiz();
        })
    );
    const mus = $('#hs-musteri');
    if (mus) mus.onclick = () => musteriSec((m) => ((sepetMusteri = m), sepetCiz()));
    const tem = $('#hs-temizle');
    if (tem)
      tem.onclick = () => {
        sepet.clear();
        sepetMusteri = null;
        sepetCiz();
      };
    const tam = $('#hs-tamamla');
    if (tam)
      tam.onclick = async () => {
        if (sepetOdeme === 'veresiye' && !sepetMusteri) return toast('Veresiye için müşteri seçin');
        tam.disabled = true;
        try {
          const s = await post('/api/satislar', {
            kalemler: kalemler.map((k) => ({ ilac_id: k.ilac.id, adet: k.adet })),
            odeme_tipi: sepetOdeme,
            musteri_id: sepetMusteri ? sepetMusteri.id : undefined
          });
          sepet.clear();
          sepetMusteri = null;
          const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);font-size:26px;margin:0 0 6px">Satış tamamlandı ✓</h2>
            <div class="kart bg-yesil"><h2>Toplam</h2><div class="tutar">${tl(s.toplam_tutar)}</div><div class="fark">Fiş no #${s.id}</div></div>
            ${(s.uyarilar || []).map((u) => `<div class="hata-kutu" style="background:var(--sari)">${esc(u.mesaj || u)}</div>`).join('')}
            <button class="hap siyah" id="hs-yeni" style="margin-top:14px">Yeni satış</button>`);
          $('#hs-yeni', perde).onclick = () => (perde.remove(), sepetCiz());
          sepetCiz();
        } catch (e) {
          tam.disabled = false;
          const ipucu = /reçete|recete/i.test(e.message) ? ' Reçeteli ürünler için bilgisayardaki satış ekranını kullanın.' : '';
          toast(hataMesaji(e) + ipucu);
        }
      };
  }

  // Musteri secici (satis ve diger ekranlar)
  function musteriSec(secildi) {
    const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);margin:0 0 10px">Müşteri seç</h2>
      <input class="alan" id="ms-ara" placeholder="Ad veya telefon" autocomplete="off" aria-label="Müşteri ara" />
      <div id="ms-liste" style="margin-top:8px"></div>
      <button class="hap" id="ms-kapat" style="width:100%;margin-top:12px">Kapat</button>`);
    let z;
    const yukle = async () => {
      const q = $('#ms-ara', perde).value.trim();
      try {
        const liste = (await get('/api/musteriler' + (q ? '?q=' + encodeURIComponent(q) : ''), { onbellek: true })).slice(0, 8);
        $('#ms-liste', perde).innerHTML = liste.length
          ? liste.map((m) => `<button class="satir" data-id="${m.id}" type="button" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">${esc(m.ad_soyad)}<small>${esc(m.telefon || '—')}</small></div></button>`).join('')
          : bos('Müşteri bulunamadı');
        $('#ms-liste', perde).querySelectorAll('[data-id]').forEach(
          (b) =>
            (b.onclick = () => {
              secildi(liste.find((m) => m.id === Number(b.dataset.id)));
              perde.remove();
            })
        );
      } catch (e) {
        $('#ms-liste', perde).innerHTML = hataKutusu(e);
      }
    };
    $('#ms-ara', perde).addEventListener('input', () => (clearTimeout(z), (z = setTimeout(yukle, 250))));
    $('#ms-kapat', perde).onclick = () => perde.remove();
    yukle();
  }

  // ---------- Musteriler ve veresiye ----------
  let musteriSekme = 'hepsi';
  async function musterilerEkrani() {
    cerceve(
      'Müşteriler',
      'bildirim',
      `<div class="cipler">${[['hepsi', 'Tümü'], ['borclu', 'Veresiye borcu']].map(([k, a]) => `<button class="hap ${musteriSekme === k ? 'secili' : ''}" data-sekme="${k}">${a}</button>`).join('')}</div>
       <input class="alan" id="m-ara" placeholder="Ad veya telefon ara" aria-label="Müşteri ara" autocomplete="off" />
       <div id="m-liste" style="margin-top:10px"><div class="yukleniyor">Yükleniyor…</div></div>`,
      { geri: true }
    );
    uyg.querySelectorAll('[data-sekme]').forEach((b) => (b.onclick = () => ((musteriSekme = b.dataset.sekme), musterilerEkrani())));
    const liste = $('#m-liste');
    const ciz = async () => {
      const q = $('#m-ara').value.trim();
      try {
        if (musteriSekme === 'borclu') {
          const yanit = await get('/api/veresiye', { onbellek: true });
          const f = yanit.musteriler.filter((m) => !q || m.ad_soyad.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')));
          const toplam = f.reduce((t, m) => t + Math.max(0, m.bakiye || 0), 0);
          liste.innerHTML =
            `${cevrimdisiNot(yanit)}<div class="kart bg-mercan" style="padding:14px 16px"><h2>Toplam alacak</h2><div class="tutar">${tl(toplam)}</div><div class="fark">${f.length} müşteri</div></div>` +
            (f.length
              ? f.filter((m) => m.bakiye > 0.001).map((m) => `<button class="satir" data-id="${m.id}" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">${esc(m.ad_soyad)}<small>${esc(m.telefon || '—')}${m.bekleyen_gun ? ` · ${m.bekleyen_gun} gündür bekliyor` : ''}</small></div><span class="rozet kirmizi">${tl(m.bakiye)}</span></button>`).join('')
              : bos('Veresiye borcu olan müşteri yok 🎉'));
        } else {
          const m = await get('/api/musteriler' + (q ? '?q=' + encodeURIComponent(q) : ''), { onbellek: true });
          liste.innerHTML =
            cevrimdisiNot(m) +
            (m.length
              ? m.slice(0, 40).map((x) => `<button class="satir" data-id="${x.id}" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">${esc(x.ad_soyad)}<small>${esc(x.telefon || '—')}</small></div>${x.puan ? `<span class="rozet">${x.puan} puan</span>` : ''}</button>`).join('')
              : bos('Müşteri bulunamadı'));
        }
        liste.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => musteriKarti(Number(b.dataset.id))));
      } catch (e) {
        liste.innerHTML = hataKutusu(e);
      }
    };
    let z;
    $('#m-ara').addEventListener('input', () => (clearTimeout(z), (z = setTimeout(ciz, 250))));
    ciz();
  }

  async function musteriKarti(id) {
    const perde = sayfaAc('<div class="yukleniyor">Yükleniyor…</div>');
    try {
      const [m, v] = await Promise.all([get('/api/musteriler/' + id, { onbellek: true }), get('/api/veresiye/' + id, { onbellek: true }).catch(() => null)]);
      const saglik = [m.kronik_hastaliklar && 'Kronik: ' + m.kronik_hastaliklar, m.alerjiler && 'Alerji: ' + m.alerjiler, m.gebelik_durumu && m.gebelik_durumu !== 'yok' && 'Gebelik/emzirme'].filter(Boolean);
      const bakiye = v ? v.bakiye : 0;
      $('.sayfa', perde).innerHTML = `<div class="tutamak"></div>
        <h2 style="font-family:var(--font-baslik);font-size:26px;margin:0 0 4px">${esc(m.ad_soyad)}</h2>
        <p class="alt-yazi" style="margin-bottom:12px">${m.telefon ? `<a href="tel:${esc(m.telefon)}" style="color:inherit;font-weight:700">${esc(m.telefon)}</a>` : 'Telefon yok'}</p>
        ${saglik.length ? `<div class="hata-kutu" style="background:var(--sari)">⚠ ${saglik.map(esc).join(' · ')}</div>` : ''}
        <div class="kart-ikili" style="margin-bottom:12px">
          <div class="kart ${bakiye > 0 ? 'bg-mercan' : 'bg-yesil'}"><h2>Veresiye</h2><div class="tutar" style="font-size:22px">${tl(bakiye)}</div></div>
          <div class="kart bg-sari"><h2>Puan</h2><div class="tutar">${m.puan ?? 0}</div></div>
        </div>
        ${
          v && v.hareketler.length
            ? `<h3 style="font-family:var(--font-baslik);margin:10px 0 4px">Son hareketler</h3>${v.hareketler
                .slice(0, 5)
                .map((h) => `<div class="satir"><div class="ad">${h.tip === 'borc' ? 'Borç' : 'Tahsilat'}<small>${tarihKisa(h.tarih)} · ${esc(h.aciklama || '')}</small></div><span class="rozet ${h.tip === 'borc' ? 'kirmizi' : 'yesil'}">${tl(h.tutar)}</span></div>`)
                .join('')}`
            : ''
        }
        <div style="display:grid;gap:10px;margin-top:16px">
          ${bakiye > 0 ? '<button class="hap siyah" id="mk-tahsilat">Tahsilat al</button>' : ''}
          <button class="hap" id="mk-satis">Bu müşteriye satış yap</button>
          <button class="hap" id="mk-kapat">Kapat</button>
        </div>`;
      $('#mk-kapat', perde).onclick = () => perde.remove();
      $('#mk-satis', perde).onclick = () => {
        sepetMusteri = { id: m.id, ad_soyad: m.ad_soyad };
        perde.remove();
        location.hash = '#/hizli-satis';
      };
      const t = $('#mk-tahsilat', perde);
      if (t)
        t.onclick = async () => {
          const girilen = window.prompt(`Tahsil edilen tutar (borç: ${tl(bakiye)}):`, String(bakiye));
          if (!girilen) return;
          const tutar = Number(String(girilen).replace(',', '.'));
          if (!(tutar > 0)) return toast('Geçerli bir tutar girin');
          try {
            const r = await post(`/api/veresiye/${id}/tahsilat`, { tutar, odeme_tipi: 'nakit' });
            toast(`Tahsil edildi. Kalan borç: ${tl(r.bakiye)}`);
            perde.remove();
            musteriKarti(id);
          } catch (e) {
            toast(hataMesaji(e));
          }
        };
    } catch (e) {
      $('.sayfa', perde).innerHTML = `${hataKutusu(e)}<button class="hap" id="mk-kapat" style="width:100%;margin-top:12px">Kapat</button>`;
      $('#mk-kapat', perde).onclick = () => perde.remove();
    }
  }

  // ---------- Siparisler ----------
  const SIPARIS_DURUM = { beklemede: ['Beklemede', 'sari'], gonderildi: ['Gönderildi', 'sari'], teslim_alindi: ['Teslim alındı', 'yesil'], iptal: ['İptal', 'kirmizi'], kismi: ['Kısmi', 'sari'] };
  let siparisSekme = 'acik';
  async function siparislerEkrani() {
    if (!yonetici()) return cerceve('Siparişler', 'urunler', hataKutusu({ message: 'Bu ekran eczacı ve yöneticiler içindir.' }), { geri: true });
    cerceve(
      'Siparişler',
      'urunler',
      `<div class="cipler">${[['acik', 'Açık'], ['tumu', 'Tümü']].map(([k, a]) => `<button class="hap ${siparisSekme === k ? 'secili' : ''}" data-sekme="${k}">${a}</button>`).join('')}</div>
       <div id="sp-liste"><div class="yukleniyor">Yükleniyor…</div></div>`,
      { geri: true }
    );
    uyg.querySelectorAll('[data-sekme]').forEach((b) => (b.onclick = () => ((siparisSekme = b.dataset.sekme), siparislerEkrani())));
    const liste = $('#sp-liste');
    try {
      let s = await get('/api/siparisler', { onbellek: true });
      if (siparisSekme === 'acik') s = s.filter((x) => ['beklemede', 'gonderildi', 'kismi'].includes(x.durum));
      liste.innerHTML =
        cevrimdisiNot(s) +
        (s.length
          ? s
              .slice(0, 40)
              .map((x) => {
                const d = SIPARIS_DURUM[x.durum] || [x.durum, ''];
                return `<button class="satir" data-id="${x.id}" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">#${x.id} · ${esc(x.tedarikci_adi || '—')}<small>${tarihKisa(x.olusturma_tarihi)} · ${x.kalem_sayisi} kalem</small></div><span class="rozet ${d[1]}">${d[0]}</span></button>`;
              })
              .join('')
          : bos('Sipariş yok'));
      liste.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => siparisKarti(Number(b.dataset.id))));
    } catch (e) {
      liste.innerHTML = hataKutusu(e);
    }
  }

  async function siparisKarti(id) {
    const perde = sayfaAc('<div class="yukleniyor">Yükleniyor…</div>');
    try {
      const s = await get('/api/siparisler/' + id);
      const d = SIPARIS_DURUM[s.durum] || [s.durum, ''];
      const acik = ['beklemede', 'gonderildi'].includes(s.durum);
      $('.sayfa', perde).innerHTML = `<div class="tutamak"></div>
        <h2 style="font-family:var(--font-baslik);font-size:24px;margin:0 0 6px">Sipariş #${s.id}</h2>
        <p class="alt-yazi" style="margin-bottom:10px"><span class="rozet ${d[1]}">${d[0]}</span> ${tarihKisa(s.olusturma_tarihi)}${s.notlar ? ' · ' + esc(s.notlar) : ''}</p>
        ${s.kalemler.map((k) => `<div class="satir"><div class="ad">${esc(k.ilac_adi)}<small>${tl(k.tahmini_birim_fiyat)}</small></div><span class="rozet">${k.istenen_adet} adet</span></div>`).join('')}
        <div style="display:grid;gap:10px;margin-top:16px">
          ${acik ? `<a class="hap siyah" style="text-align:center;text-decoration:none" href="#/mal-kabul?siparis=${s.id}">Mal kabul yap (teslim al)</a>` : ''}
          ${s.durum === 'beklemede' ? '<button class="hap" id="sp-gonder">Gönderildi olarak işaretle</button>' : ''}
          <button class="hap" id="sp-kapat">Kapat</button>
        </div>`;
      $('#sp-kapat', perde).onclick = () => perde.remove();
      const g = $('#sp-gonder', perde);
      if (g)
        g.onclick = async () => {
          try {
            await put(`/api/siparisler/${id}/durum`, { durum: 'gonderildi' });
            toast('Gönderildi olarak işaretlendi');
            perde.remove();
            siparislerEkrani();
          } catch (e) {
            toast(hataMesaji(e));
          }
        };
    } catch (e) {
      $('.sayfa', perde).innerHTML = `${hataKutusu(e)}<button class="hap" id="sp-kapat" style="width:100%;margin-top:12px">Kapat</button>`;
      $('#sp-kapat', perde).onclick = () => perde.remove();
    }
  }

  // ---------- Mal kabul ----------
  let kabul = { siparis: null, kalemler: new Map(), fatura: '' }; // kalemler: ilac_id -> { ilac, adet, skt, parti }
  async function malKabulEkrani(sorgu) {
    if (!yonetici()) return cerceve('Mal Kabul', 'urunler', hataKutusu({ message: 'Bu ekran eczacı ve yöneticiler içindir.' }), { geri: true });
    cerceve('Mal Kabul', 'urunler', '<div class="yukleniyor">Yükleniyor…</div>', { geri: true });
    const sid = Number(sorgu && sorgu.get('siparis')) || null;
    if (sid && (!kabul.siparis || kabul.siparis.id !== sid)) {
      try {
        const s = await get('/api/siparisler/' + sid);
        kabul = { siparis: s, kalemler: new Map(), fatura: '' };
        for (const k of s.kalemler) {
          const ilac = k.ilac_id ? { id: k.ilac_id, ad: k.ilac_adi, alis_fiyati: k.tahmini_birim_fiyat } : null;
          if (ilac) kabul.kalemler.set(ilac.id, { ilac, adet: k.istenen_adet, skt: '', parti: '' });
        }
      } catch (e) {
        return cerceve('Mal Kabul', 'urunler', hataKutusu(e), { geri: true });
      }
    }
    cerceve(
      'Mal Kabul',
      'urunler',
      `${kabul.siparis ? `<div class="hata-kutu" style="background:var(--yesil)">Sipariş #${kabul.siparis.id} teslim alınıyor. Gelen adetleri kontrol edin.</div>` : '<p class="alt-yazi">Gelen ürünü barkodla okutun ya da arayın; adet, SKT ve parti girin.</p>'}
       <div id="mk-ara"></div><div id="mk-liste"></div><div id="mk-alt"></div>`,
      { geri: true }
    );
    urunAraKutusu($('#mk-ara'), (ilac) => {
      const k = kabul.kalemler.get(ilac.id);
      if (k) k.adet += 1;
      else kabul.kalemler.set(ilac.id, { ilac, adet: 1, skt: '', parti: '' });
      kabulCiz();
    });
    kabulCiz();
  }

  function kabulCiz() {
    const liste = $('#mk-liste');
    const alt = $('#mk-alt');
    if (!liste) return;
    const kalemler = [...kabul.kalemler.values()];
    liste.innerHTML = kalemler.length
      ? kalemler
          .map(
            (k) => `<div class="kart bg-krem" style="padding:12px 16px" data-satir="${k.ilac.id}">
              <div class="satir" style="border-top:none;padding:0 0 8px"><div class="ad">${esc(k.ilac.ad)}</div>
                <button class="yuvarlak" data-eksi="${k.ilac.id}" style="width:40px;height:40px;background:var(--beyaz)" aria-label="Azalt">−</button>
                <b>${k.adet}</b>
                <button class="yuvarlak" data-arti="${k.ilac.id}" style="width:40px;height:40px;background:var(--yesil)" aria-label="Artır">+</button></div>
              <div style="display:flex;gap:8px">
                <input class="alan" data-parti="${k.ilac.id}" placeholder="Parti no" value="${esc(k.parti)}" style="padding:10px 14px;font-size:14px" aria-label="Parti no" />
                <input class="alan" data-skt="${k.ilac.id}" type="date" value="${esc(k.skt)}" style="padding:10px 14px;font-size:14px" aria-label="Son kullanma tarihi" />
              </div></div>`
          )
          .join('')
      : bos('Henüz ürün eklenmedi.');
    liste.querySelectorAll('[data-arti]').forEach((b) => (b.onclick = () => ((kabul.kalemler.get(Number(b.dataset.arti)).adet += 1), kabulCiz())));
    liste.querySelectorAll('[data-eksi]').forEach(
      (b) =>
        (b.onclick = () => {
          const k = kabul.kalemler.get(Number(b.dataset.eksi));
          if (--k.adet <= 0) kabul.kalemler.delete(k.ilac.id);
          kabulCiz();
        })
    );
    liste.querySelectorAll('[data-parti]').forEach((i) => i.addEventListener('input', () => (kabul.kalemler.get(Number(i.dataset.parti)).parti = i.value)));
    liste.querySelectorAll('[data-skt]').forEach((i) => i.addEventListener('input', () => (kabul.kalemler.get(Number(i.dataset.skt)).skt = i.value)));
    const toplamAdet = kalemler.reduce((t, k) => t + k.adet, 0);
    alt.innerHTML = kalemler.length
      ? `<label class="etiket" for="mk-fatura" style="margin-top:6px">Fatura no (isteğe bağlı)</label>
         <input class="alan" id="mk-fatura" value="${esc(kabul.fatura)}" autocomplete="off" />
         <button class="hap siyah" id="mk-kaydet" style="margin-top:14px">Stoğa gir (${kalemler.length} ürün · ${toplamAdet} adet)</button>
         <button class="hap" id="mk-iptal" style="margin-top:10px;width:100%">Vazgeç</button>`
      : '';
    const f = $('#mk-fatura');
    if (f) f.addEventListener('input', () => (kabul.fatura = f.value));
    const ip = $('#mk-iptal');
    if (ip)
      ip.onclick = () => {
        kabul = { siparis: null, kalemler: new Map(), fatura: '' };
        location.hash = '#/siparisler';
      };
    const kayit = $('#mk-kaydet');
    if (kayit)
      kayit.onclick = async () => {
        kayit.disabled = true;
        try {
          const r = await post('/api/mal-kabul', {
            siparis_id: kabul.siparis ? kabul.siparis.id : undefined,
            fatura_no: kabul.fatura || undefined,
            alis_fiyati_guncelle: false,
            kalemler: kalemler.map((k) => ({ ilac_id: k.ilac.id, adet: k.adet, mf: 0, alis_fiyati: Number(k.ilac.alis_fiyati) || 0, parti_no: k.parti || undefined, skt: k.skt || undefined }))
          });
          kabul = { siparis: null, kalemler: new Map(), fatura: '' };
          const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);font-size:26px;margin:0 0 6px">Stoğa girildi ✓</h2>
            <p class="alt-yazi">Mal kabul #${r.id} kaydedildi. ${toplamAdet} adet stoğa eklendi.</p>
            <button class="hap siyah" id="mk-tamam" style="margin-top:12px">Tamam</button>`);
          $('#mk-tamam', perde).onclick = () => (perde.remove(), (location.hash = '#/siparisler'));
        } catch (e) {
          kayit.disabled = false;
          toast(hataMesaji(e));
        }
      };
  }

  // ---------- Gorevler (yapilacaklar) ----------
  const ONCELIK = { yuksek: ['Yüksek', 'kirmizi'], orta: ['Orta', 'sari'], dusuk: ['Düşük', 'yesil'] };
  async function gorevlerEkrani() {
    cerceve('Görevler', 'bildirim', '<div class="yukleniyor">Yükleniyor…</div>', { geri: true });
    let liste;
    try {
      liste = await get('/api/gorevler', { onbellek: true });
    } catch (e) {
      return cerceve('Görevler', 'bildirim', hataKutusu(e), { geri: true });
    }
    const bekleyen = liste.filter((g) => g.durum === 'bekliyor');
    const biten = liste.filter((g) => g.durum === 'tamamlandi').slice(0, 5);
    const satir = (g) => `<div class="satir"><button class="yuvarlak" data-tamam="${g.id}" data-durum="${g.durum}" style="width:40px;height:40px;flex:none;background:${g.durum === 'tamamlandi' ? 'var(--yesil)' : 'var(--beyaz)'}" aria-label="${g.durum === 'tamamlandi' ? 'Geri al' : 'Tamamla'}">${g.durum === 'tamamlandi' ? '✓' : ''}</button>
      <div class="ad" style="${g.durum === 'tamamlandi' ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(g.baslik)}<small>${g.atanan_adi ? esc(g.atanan_adi) : 'Herkes'}${g.aciklama ? ' · ' + esc(g.aciklama) : ''}</small></div>
      ${g.durum === 'bekliyor' ? `<span class="rozet ${(ONCELIK[g.oncelik] || ONCELIK.orta)[1]}">${(ONCELIK[g.oncelik] || ONCELIK.orta)[0]}</span>` : ''}</div>`;
    cerceve(
      'Görevler',
      'bildirim',
      `${cevrimdisiNot(liste)}
       <button class="hap siyah" id="g-yeni" style="margin-bottom:12px">+ Yeni görev</button>
       <div class="kart bg-krem" style="padding:8px 16px">${bekleyen.length ? bekleyen.map(satir).join('') : bos('Bekleyen görev yok 🎉')}</div>
       ${biten.length ? `${baslik('Son tamamlananlar')}<div class="kart bg-krem" style="padding:8px 16px">${biten.map(satir).join('')}</div>` : ''}`,
      { geri: true }
    );
    uyg.querySelectorAll('[data-tamam]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await put('/api/gorevler/' + b.dataset.tamam, { durum: b.dataset.durum === 'bekliyor' ? 'tamamlandi' : 'bekliyor' });
            gorevlerEkrani();
          } catch (e) {
            b.disabled = false;
            toast(hataMesaji(e));
          }
        })
    );
    $('#g-yeni').onclick = () => {
      const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);margin:0 0 10px">Yeni görev</h2>
        <form id="g-form">
          <label class="etiket" for="g-baslik">Başlık</label><input class="alan" id="g-baslik" maxlength="120" required autocomplete="off" />
          <label class="etiket" for="g-aciklama" style="margin-top:12px">Not (isteğe bağlı)</label><input class="alan" id="g-aciklama" autocomplete="off" />
          <div class="cipler" style="margin-top:12px" role="group" aria-label="Öncelik">${[['yuksek', 'Yüksek'], ['orta', 'Orta'], ['dusuk', 'Düşük']].map(([k, a]) => `<button type="button" class="hap ${k === 'orta' ? 'secili' : ''}" data-oncelik="${k}">${a}</button>`).join('')}</div>
          <button class="hap siyah" type="submit" style="margin-top:8px">Kaydet</button>
        </form>`);
      let oncelik = 'orta';
      perde.querySelectorAll('[data-oncelik]').forEach(
        (b) =>
          (b.onclick = () => {
            oncelik = b.dataset.oncelik;
            perde.querySelectorAll('[data-oncelik]').forEach((x) => x.classList.toggle('secili', x === b));
          })
      );
      $('#g-form', perde).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await post('/api/gorevler', { baslik: $('#g-baslik', perde).value, aciklama: $('#g-aciklama', perde).value || undefined, oncelik });
          perde.remove();
          toast('Görev eklendi');
          gorevlerEkrani();
        } catch (err) {
          toast(hataMesaji(err));
        }
      });
    };
  }

  // ---------- Gunun kasasi (salt okunur) ----------
  async function kasaEkrani() {
    cerceve('Günün Kasası', 'satis', '<div class="yukleniyor">Yükleniyor…</div>', { geri: true });
    let k;
    try {
      k = await get('/api/kasa-kapanislari/ozet', { onbellek: true });
    } catch (e) {
      return cerceve('Günün Kasası', 'satis', hataKutusu(e), { geri: true });
    }
    const satirlar = [
      ['Nakit', k.nakit], ['Kart', k.kart], ['SGK', k.sgk], ['Veresiye', k.veresiye]
    ];
    cerceve(
      'Günün Kasası',
      'satis',
      `${cevrimdisiNot(k)}
       <div class="kart bg-yesil"><h2>Günün cirosu</h2><div class="tutar">${tl(k.toplam)}</div>
         <div class="fark">${k.zaten_kapatildi ? 'Kasa kapatıldı ✓' : 'Kasa henüz kapatılmadı'}</div></div>
       <div class="kart bg-krem" style="padding:8px 16px">${satirlar.map(([a, v]) => `<div class="satir"><div class="ad">${a}</div><span class="rozet">${tl(v)}</span></div>`).join('')}
         ${k.tahsilat ? `<div class="satir"><div class="ad">Veresiye tahsilatı<small>Nakit/kart toplamına dahil</small></div><span class="rozet yesil">${tl(k.tahsilat)}</span></div>` : ''}
         ${k.iade ? `<div class="satir"><div class="ad">İadeler</div><span class="rozet kirmizi">${tl(k.iade)}</span></div>` : ''}</div>
       <p class="alt-yazi">Kasa kapanışı bilgisayardan yapılır.</p>`,
      { geri: true }
    );
  }

  return {
    oneri: oneriEkrani,
    'hizli-satis': () => hizliSatisEkrani(),
    musteriler: musterilerEkrani,
    siparisler: siparislerEkrani,
    'mal-kabul': malKabulEkrani,
    gorevler: gorevlerEkrani,
    kasa: kasaEkrani
  };
};
