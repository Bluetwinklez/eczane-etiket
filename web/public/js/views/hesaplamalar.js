(function () {
  const tl = (n) => UI.tl(n);
  const sayi = (form, ad) => {
    const v = form.elements[ad] ? String(form.elements[ad].value).replace(',', '.') : '';
    return v === '' ? undefined : Number(v);
  };
  const sonucHtml = (r, satirlar) =>
    r.hata ? `<p class="form-ipucu">${UI.esc(r.hata)}</p>` : `<table><tbody>${satirlar.filter(Boolean).map(([a, d]) => `<tr><td style="color:var(--text-muted)">${a}</td><td><b>${d}</b></td></tr>`).join('')}</tbody></table>`;
  const f = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const aralik = (a, birim) => (a[0] === a[1] ? `${f(a[0])} ${birim}` : `${f(a[0])} – ${f(a[1])} ${birim}`);

  const KARTLAR = [
    {
      id: 'doz',
      baslik: 'Kiloya göre doz (çocuk şurubu)',
      form: () => `
        <div><label>Hazır ayar</label><select name="ayar">${Object.entries(Hesap.ON_AYARLAR).map(([k, v]) => `<option value="${k}">${UI.esc(v.ad)}</option>`).join('')}<option value="">Elle gir</option></select></div>
        <div><label>Kilo (kg)</label><input name="kilo" type="number" step="0.1" min="0" value="15" /></div>
        <div><label>Tek doz (mg/kg) en az</label><input name="minMgKg" type="number" step="0.1" /></div>
        <div><label>Tek doz (mg/kg) en çok</label><input name="maxMgKg" type="number" step="0.1" /></div>
        <div><label>Günlük en çok (mg/kg)</label><input name="gunlukMaxMgKg" type="number" step="0.1" /></div>
        <div><label>Yetişkin tek doz üst sınırı (mg)</label><input name="tekDozUst" type="number" /></div>
        <div><label>Şurup: … mg</label><input name="mg" type="number" step="0.1" /></div>
        <div><label>… ml içinde</label><input name="ml" type="number" step="0.1" /></div>`,
      bagla(form) {
        const doldur = () => {
          const a = Hesap.ON_AYARLAR[form.ayar.value];
          if (!a) return;
          for (const k of ['minMgKg', 'maxMgKg', 'gunlukMaxMgKg', 'mg', 'ml']) form.elements[k].value = a[k];
          form.tekDozUst.value = a.tekDozUst || '';
        };
        form.ayar.addEventListener('change', doldur);
        doldur();
      },
      hesapla(form) {
        const r = Hesap.kiloDozu({ kilo: sayi(form, 'kilo'), minMgKg: sayi(form, 'minMgKg'), maxMgKg: sayi(form, 'maxMgKg'), gunlukMaxMgKg: sayi(form, 'gunlukMaxMgKg'), mg: sayi(form, 'mg'), ml: sayi(form, 'ml'), tekDozUst: sayi(form, 'tekDozUst') });
        const a = Hesap.ON_AYARLAR[form.ayar.value];
        return sonucHtml(r, [
          ['Tek doz', r.tek_doz_mg && aralik(r.tek_doz_mg, 'mg')],
          r.tek_doz_ml && ['Tek doz (şurup)', aralik(r.tek_doz_ml, 'ml')],
          r.gunluk_max_mg && ['Günlük en çok', `${f(r.gunluk_max_mg)} mg`],
          a && ['Kullanım aralığı', UI.esc(a.aralik)],
          ...(r.uyarilar || []).map((u) => ['Uyarı', UI.esc(u)])
        ]);
      }
    },
    {
      id: 'kutu',
      baslik: 'Kutu ne zaman biter?',
      form: () => `
        <div><label>Kutudaki miktar (tablet / ml)</label><input name="kutuIcerik" type="number" value="28" /></div>
        <div><label>Kutu adedi</label><input name="kutuAdedi" type="number" value="1" min="1" /></div>
        <div><label>Kullanım</label><input name="kullanim" value="2x1" placeholder="2x1, 3x5, günde 2 kez 1" /></div>
        <div><label>Başlangıç</label><input name="baslangic" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>`,
      hesapla(form) {
        const r = Hesap.kutuBitis({ kutuIcerik: sayi(form, 'kutuIcerik'), kutuAdedi: sayi(form, 'kutuAdedi'), kullanim: form.kullanim.value, baslangic: form.baslangic.value || undefined });
        return sonucHtml(r, [
          ['Günlük kullanım', `${f(r.gunluk)}`],
          ['Yeter', `${r.gun} gün`],
          ['Tahmini bitiş', r.bitis && new Date(r.bitis + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })],
          r.artan ? ['Artan', `${f(r.artan)}`] : null
        ]);
      }
    },
    {
      id: 'sise',
      baslik: 'Şişe kaç gün yeter?',
      form: () => `
        <div><label>Şişe hacmi (ml)</label><input name="siseMl" type="number" value="150" /></div>
        <div><label>Tek doz (ml)</label><input name="tekDozMl" type="number" step="0.5" value="5" /></div>
        <div><label>Günde kaç kez</label><input name="gundeKez" type="number" value="3" /></div>
        <div><label>Tedavi süresi (gün, isteğe bağlı)</label><input name="tedaviGun" type="number" value="10" /></div>`,
      hesapla(form) {
        const r = Hesap.siseYeter({ siseMl: sayi(form, 'siseMl'), tekDozMl: sayi(form, 'tekDozMl'), gundeKez: sayi(form, 'gundeKez'), tedaviGun: sayi(form, 'tedaviGun') });
        return sonucHtml(r, [['Günlük', `${f(r.gunluk_ml)} ml`], ['Bir şişe yeter', `${f(r.yeter_gun)} gün`], r.gereken_sise ? ['Tedavi için gereken', `${r.gereken_sise} şişe`] : null]);
      }
    },
    {
      id: 'vki',
      baslik: 'Vücut kitle indeksi ve vücut yüzey alanı',
      form: () => `
        <div><label>Kilo (kg)</label><input name="kilo" type="number" step="0.1" value="70" /></div>
        <div><label>Boy (cm)</label><input name="boyCm" type="number" value="170" /></div>`,
      hesapla(form) {
        const r = Hesap.vki({ kilo: sayi(form, 'kilo'), boyCm: sayi(form, 'boyCm') });
        return sonucHtml(r, [['VKİ', `${f(r.vki)} kg/m² · ${r.sinif}`], ['Vücut yüzey alanı (Mosteller)', `${f(r.vya_m2)} m²`]]);
      }
    },
    {
      id: 'kkl',
      baslik: 'Kreatinin klirensi (Cockcroft-Gault)',
      form: () => `
        <div><label>Yaş</label><input name="yas" type="number" value="70" /></div>
        <div><label>Kilo (kg)</label><input name="kilo" type="number" value="65" /></div>
        <div><label>Serum kreatinin (mg/dl)</label><input name="kreatinin" type="number" step="0.01" value="1.1" /></div>
        <div><label><input type="checkbox" name="kadin" /> Kadın</label></div>`,
      hesapla(form) {
        const r = Hesap.kreatininKlirensi({ yas: sayi(form, 'yas'), kilo: sayi(form, 'kilo'), kreatinin: sayi(form, 'kreatinin'), kadin: form.kadin.checked });
        return sonucHtml(r, [['Klirens', `${f(r.klirens)} ml/dk`], ['Böbrek fonksiyonu', r.evre]]) + '<p class="form-ipucu">Böbrekten atılan ilaçlarda doz ayarı için KÜB\'deki klirens tablosuna bakın.</p>';
      }
    },
    {
      id: 'kar',
      baslik: 'Mal fazlası ile maliyet ve kâr',
      form: () => `
        <div><label>Alış birim fiyatı</label><input name="alis" type="number" step="0.01" value="110" /></div>
        <div><label>Adet</label><input name="adet" type="number" value="10" /></div>
        <div><label>Mal fazlası (MF)</label><input name="mf" type="number" value="1" /></div>
        <div><label>Satış fiyatı</label><input name="satis" type="number" step="0.01" value="150" /></div>
        <div><label>KDV %</label><input name="kdvOrani" type="number" value="10" /></div>
        <div><label><input type="checkbox" name="alisKdvDahil" checked /> Alış fiyatı KDV dahil</label></div>`,
      hesapla(form) {
        const r = Hesap.maliyetKar({ alis: sayi(form, 'alis'), adet: sayi(form, 'adet'), mf: sayi(form, 'mf'), satis: sayi(form, 'satis'), kdvOrani: sayi(form, 'kdvOrani') ?? 10, alisKdvDahil: form.alisKdvDahil.checked });
        return sonucHtml(r, [
          ['Gerçek birim maliyet', tl(r.birim_maliyet)],
          ['Birim maliyet (KDV hariç)', tl(r.birim_maliyet_kdv_haric)],
          ['MF kazancı', `%${f(r.mf_kazanci_yuzde)}`],
          r.kar != null ? ['Birim kâr (KDV hariç)', tl(r.kar)] : null,
          r.kar_marji_yuzde != null ? ['Kâr marjı', `%${f(r.kar_marji_yuzde)}`] : null
        ]);
      }
    }
  ];

  const view = {
    async render(container) {
      container.innerHTML = `
        <p class="form-ipucu" style="margin-top:0">Hesaplar yardımcıdır. Doz kararında ilacın KÜB'ü ve hekim/eczacı değerlendirmesi esastır; hazır ayarlardaki değerleri kendi kaynağınıza göre değiştirebilirsiniz.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">
          ${KARTLAR.map((k) => `<div class="card"><h3 style="margin-top:0">${k.baslik}</h3><form data-kart="${k.id}" onsubmit="return false"><div class="form-grid">${k.form()}</div></form><div class="hs-sonuc" data-sonuc="${k.id}" style="margin-top:10px"></div></div>`).join('')}
        </div>`;
      for (const k of KARTLAR) {
        const form = container.querySelector(`form[data-kart="${k.id}"]`);
        const hedef = container.querySelector(`[data-sonuc="${k.id}"]`);
        const guncelle = () => (hedef.innerHTML = k.hesapla(form));
        if (k.bagla) k.bagla(form);
        form.addEventListener('input', guncelle);
        form.addEventListener('change', guncelle);
        guncelle();
      }
    }
  };
  Views.hesaplamalar = view;
})();
