// Sayfalar arasi urun secimi: "Sepete ekle" (kasa ekranina tasir) ve "Karsilastir" listesi (en fazla 4 urun).
// sessionStorage yoksa (gizli pencere vb.) yalnizca bellekte tutulur.
(function () {
  const bellek = {};
  const oku = (k) => {
    try {
      return JSON.parse(sessionStorage.getItem(k) || 'null');
    } catch (e) {
      return bellek[k] || null;
    }
  };
  const yaz = (k, v) => {
    bellek[k] = v;
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* bellekte kalir */
    }
  };
  window.EczamSecim = {
    sepeteGonder(idler) {
      const liste = (oku('eczam:sepete-ekle') || []).concat(idler.map(Number));
      yaz('eczam:sepete-ekle', liste);
      location.hash = '#satis';
    },
    sepetBekleyenleriAl() {
      const l = oku('eczam:sepete-ekle') || [];
      yaz('eczam:sepete-ekle', []);
      return l;
    },
    karsilastirmaListesi: () => oku('eczam:karsilastir') || [],
    karsilastirmayaEkle(idler) {
      const l = window.EczamSecim.karsilastirmaListesi();
      for (const id of idler.map(Number)) if (!l.includes(id)) l.push(id);
      const sonuc = l.slice(-4);
      yaz('eczam:karsilastir', sonuc);
      return sonuc;
    },
    karsilastirmadanCikar(id) {
      yaz('eczam:karsilastir', window.EczamSecim.karsilastirmaListesi().filter((x) => x !== Number(id)));
    }
  };
})();
