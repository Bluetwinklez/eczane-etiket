const app = require('./app');
const { otomatikYedeklemeyiBaslat } = require('./yedek');
const { gunSonuZamanlayiciBaslat } = require('./gunSonuOzeti');

const { hataKaydet } = require('./hataGunlugu');

const PORT = process.env.PORT || 3000;

// Yakalanmayan hata: gunluge yazilip surec kapanir; Windows baslaticisi sunucuyu yeniden acar
process.on('uncaughtException', (err) => {
  hataKaydet('sunucu-coktu', err.message, { yigin: String(err.stack || '').split('\n').slice(0, 8).join(' | ') });
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  hataKaydet('sunucu-promise', err && err.message ? err.message : String(err), { yigin: String((err && err.stack) || '').split('\n').slice(0, 6).join(' | ') });
});

// ECZAM_DEMO=1: herkese acik demo sunucusu (ornek veri, sabit demo hesabi)
const demo = require('./demo').demoHazirla();
if (demo) console.log(`Demo modu acik (${demo.satis} ornek satis eklendi)`);

otomatikYedeklemeyiBaslat();
gunSonuZamanlayiciBaslat();

app.listen(PORT, () => {
  console.log(`Eczam Programi ${PORT} portunda calisiyor`);
});
