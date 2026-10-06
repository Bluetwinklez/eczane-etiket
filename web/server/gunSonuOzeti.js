// Gun sonu ozeti: gunun cirosu, kar, kasa kirilimi, en cok satanlar ve dikkat gerektiren isler.
// Ayarlanan saatte e-postayla gonderilir (SMTP ayarli degilse "simule" olarak kaydedilir).
const nodemailer = require('nodemailer');
const { db, ayarOku, ayarYaz } = require('./db');
const { yerelSimdi, sqlSaatFarki } = require('./zaman');
const { smtpYapilandirilmisMi } = require('./bildirim');

const AYAR = 'gun_sonu_eposta';
const VARSAYILAN = { aktif: false, adres: '', saat: '21:00', son_gonderim: null, son_durum: null };
const y2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const tl = (n) => `${y2(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ayarlariOku() {
  try {
    return { ...VARSAYILAN, ...JSON.parse(ayarOku(AYAR) || '{}') };
  } catch {
    return { ...VARSAYILAN };
  }
}
function ayarlariYaz(yeni) {
  const a = { ...ayarlariOku(), ...yeni };
  ayarYaz(AYAR, JSON.stringify(a));
  return a;
}

function ozetOlustur(subeId, tarih) {
  // Dongusel bagimliligi onlemek icin route modulleri burada yuklenir
  const { ozetHesapla, kasaHesapla } = require('./routes/muhasebe');
  const { bildirimOgeleri } = require('./routes/bildirimMerkezi');
  const sube = db.prepare('SELECT id, ad FROM subeler WHERE id = ?').get(subeId) || { id: subeId, ad: '' };
  const m = ozetHesapla(subeId, tarih, tarih);
  const kasa = kasaHesapla(subeId, tarih, tarih).find((r) => r.tarih === tarih) || {};
  const fark = sqlSaatFarki();
  const dun = db
    .prepare(`SELECT COALESCE(SUM(toplam_tutar), 0) AS ciro FROM satislar WHERE sube_id = ? AND date(tarih, ?) = date(?, '-1 day')`)
    .get(subeId, fark, tarih).ciro;
  const enCok = db
    .prepare(
      `SELECT sk.ilac_adi AS ad, SUM(sk.adet) AS adet, SUM(sk.ara_toplam) AS tutar FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
       WHERE sa.sube_id = ? AND date(sa.tarih, ?) = ? GROUP BY sk.ilac_id ORDER BY adet DESC, tutar DESC LIMIT 5`
    )
    .all(subeId, fark, tarih);
  const dikkat = bildirimOgeleri({ sube_id: subeId, rol: 'admin' }).ogeler.filter((o) => ['danger', 'warn'].includes(o.seviye));
  return {
    tarih,
    sube: sube.ad,
    satis_adedi: m.satis_adedi,
    brut_hasilat: m.brut_hasilat,
    iade_tutari: m.iade_tutari,
    net_hasilat: m.net_hasilat,
    brut_kar: m.brut_kar,
    brut_marj: m.brut_marj,
    giderler: m.isletme_giderleri,
    net_kar: m.net_kar,
    dun_ciro: y2(dun),
    kasa: { nakit: y2(kasa.nakit), kart: y2(kasa.kart), sgk: y2(kasa.sgk), veresiye: y2(kasa.veresiye), tahsilat: y2(kasa.tahsilat) },
    en_cok_satanlar: enCok,
    dikkat: dikkat.map(({ baslik, sayi, seviye }) => ({ baslik, sayi, seviye }))
  };
}

function epostaIcerigi(o) {
  const tarihTr = o.tarih.split('-').reverse().join('.');
  const degisim = o.dun_ciro > 0 ? Math.round(((o.brut_hasilat - o.dun_ciro) / o.dun_ciro) * 1000) / 10 : null;
  const konu = `Eczam gün sonu ${tarihTr}${o.sube ? ' · ' + o.sube : ''}: ${tl(o.net_hasilat)} hasılat, ${o.satis_adedi} satış`;
  const satirlar = [
    `${o.sube || 'Eczane'} — ${tarihTr} gün sonu özeti`,
    '',
    `Satış: ${o.satis_adedi} adet`,
    `Hasılat: ${tl(o.brut_hasilat)}${degisim != null ? ` (düne göre ${degisim > 0 ? '+' : ''}${degisim.toLocaleString('tr-TR')}%)` : ''}`,
    `İade: ${tl(o.iade_tutari)}  ·  Net hasılat: ${tl(o.net_hasilat)}`,
    `Brüt kâr: ${tl(o.brut_kar)} (%${o.brut_marj.toLocaleString('tr-TR')})  ·  Gider: ${tl(o.giderler)}  ·  Net kâr: ${tl(o.net_kar)}`,
    `Kasa: nakit ${tl(o.kasa.nakit)}, kart ${tl(o.kasa.kart)}, SGK ${tl(o.kasa.sgk)}, veresiye ${tl(o.kasa.veresiye)}, tahsilat ${tl(o.kasa.tahsilat)}`,
    '',
    'En çok satanlar:',
    ...(o.en_cok_satanlar.length ? o.en_cok_satanlar.map((u, i) => `  ${i + 1}. ${u.ad} — ${u.adet} adet`) : ['  (satış yok)']),
    '',
    'Dikkat gerektirenler:',
    ...(o.dikkat.length ? o.dikkat.map((d) => `  • ${d.baslik}: ${d.sayi}`) : ['  Her şey yolunda.'])
  ];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
    <h2 style="margin:0 0 4px">${esc(o.sube || 'Eczane')} — ${esc(tarihTr)}</h2>
    <p style="margin:0 0 12px;color:#555">Gün sonu özeti</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td>Satış</td><td><b>${o.satis_adedi}</b></td></tr>
      <tr><td>Hasılat</td><td><b>${esc(tl(o.brut_hasilat))}</b>${degisim != null ? ` <span style="color:${degisim >= 0 ? '#187a34' : '#b42318'}">(düne göre ${degisim > 0 ? '+' : ''}${esc(degisim.toLocaleString('tr-TR'))}%)</span>` : ''}</td></tr>
      <tr><td>İade</td><td>${esc(tl(o.iade_tutari))}</td></tr>
      <tr><td>Net hasılat</td><td><b>${esc(tl(o.net_hasilat))}</b></td></tr>
      <tr><td>Brüt kâr</td><td>${esc(tl(o.brut_kar))} (%${esc(o.brut_marj.toLocaleString('tr-TR'))})</td></tr>
      <tr><td>Gider / Net kâr</td><td>${esc(tl(o.giderler))} / <b>${esc(tl(o.net_kar))}</b></td></tr>
      <tr><td>Kasa</td><td>Nakit ${esc(tl(o.kasa.nakit))} · Kart ${esc(tl(o.kasa.kart))} · SGK ${esc(tl(o.kasa.sgk))} · Veresiye ${esc(tl(o.kasa.veresiye))}</td></tr>
    </table>
    <h3>En çok satanlar</h3>
    <ol>${o.en_cok_satanlar.map((u) => `<li>${esc(u.ad)} — ${u.adet} adet</li>`).join('') || '<li>Satış yok</li>'}</ol>
    <h3>Dikkat gerektirenler</h3>
    <ul>${o.dikkat.map((d) => `<li style="color:${d.seviye === 'danger' ? '#b42318' : '#8a5a00'}">${esc(d.baslik)}: <b>${d.sayi}</b></li>`).join('') || '<li>Her şey yolunda.</li>'}</ul>
  </div>`;
  return { konu, metin: satirlar.join('\n'), html };
}

async function gonder(adres, icerik, transporter) {
  if (!adres) return { durum: 'hata', mesaj: 'E-posta adresi girilmemiş' };
  if (!transporter && !smtpYapilandirilmisMi()) return { durum: 'simule', mesaj: 'SMTP ayarlı değil; e-posta gönderilmedi (önizleme sistemde görülebilir)' };
  try {
    const t =
      transporter ||
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER || 'eczam@localhost', to: adres, subject: icerik.konu, text: icerik.metin, html: icerik.html });
    return { durum: 'gonderildi' };
  } catch (err) {
    return { durum: 'hata', mesaj: String(err.message).slice(0, 300) };
  }
}

// Ayarlanan saat geldiyse ve bugun gonderilmediyse her sube icin gonderir
async function zamaniGeldiyseGonder(simdi = yerelSimdi(), transporter) {
  const a = ayarlariOku();
  if (!a.aktif || !a.adres) return null;
  const bugun = simdi.toISOString().slice(0, 10);
  const saat = simdi.toISOString().slice(11, 16);
  if (a.son_gonderim === bugun || saat < a.saat) return null;
  const sonuclar = [];
  for (const s of db.prepare('SELECT id FROM subeler ORDER BY id').all()) {
    sonuclar.push(await gonder(a.adres, epostaIcerigi(ozetOlustur(s.id, bugun)), transporter));
  }
  const durum = sonuclar.every((r) => r.durum === 'gonderildi') ? 'gonderildi' : sonuclar.find((r) => r.durum !== 'gonderildi').durum;
  ayarlariYaz({ son_gonderim: bugun, son_durum: durum });
  return sonuclar;
}

function gunSonuZamanlayiciBaslat() {
  if (process.env.ECZANEM_GUN_SONU === '0') return null;
  const z = setInterval(() => zamaniGeldiyseGonder().catch((err) => console.error('Gün sonu özeti gönderilemedi:', err.message)), 5 * 60 * 1000);
  z.unref();
  return z;
}

module.exports = { ayarlariOku, ayarlariYaz, ozetOlustur, epostaIcerigi, gonder, zamaniGeldiyseGonder, gunSonuZamanlayiciBaslat };
