// Tarayicida olusan beklenmeyen hatalari yakalar: son 20 hata "Destek / Hata Bildir" raporuna eklenir
// ve sunucudaki hata gunlugune gonderilir (sayfa basina en fazla 10 gonderim).
(function () {
  const hatalar = [];
  let gonderilen = 0;
  function kaydet(mesaj, yigin) {
    const kayit = { zaman: new Date().toISOString(), sayfa: location.hash || '#anasayfa', mesaj: String(mesaj || '').slice(0, 500), yigin: String(yigin || '').split('\n').slice(0, 5).join(' | ') };
    hatalar.push(kayit);
    if (hatalar.length > 20) hatalar.shift();
    if (gonderilen >= 10 || location.pathname.endsWith('login.html')) return;
    gonderilen += 1;
    fetch('/api/sistem/istemci-hata', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kayit) }).catch(() => {});
  }
  window.addEventListener('error', (e) => kaydet(e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // Sunucunun dondurdugu bilinen uyarilar (dogrulama hatalari) zaten ekranda gosteriliyor; yalnizca kod hatalari kaydedilir
    if (r && r.message && !r.stack) return;
    kaydet(r && r.message ? r.message : String(r), r && r.stack);
  });
  window.EczamHatalar = { liste: () => hatalar.slice().reverse(), kaydet };
})();
