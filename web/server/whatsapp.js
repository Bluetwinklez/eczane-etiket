// WhatsApp Cloud API (Meta): webhook imza dogrulama, gelen mesaj ayristirma, mesaj gonderme.
const crypto = require('node:crypto');
const express = require('express');
const asistan = require('./asistan');

const GRAPH = 'https://graph.facebook.com/v21.0';
const bekleyenler = new Set();

function imzaDogru(hamGovde, baslik) {
  const gizli = process.env.WHATSAPP_APP_SECRET;
  if (!gizli || !hamGovde || !/^sha256=[0-9a-f]{64}$/i.test(String(baslik || ''))) return false;
  const beklenen = crypto.createHmac('sha256', gizli).update(hamGovde).digest();
  return crypto.timingSafeEqual(beklenen, Buffer.from(String(baslik).slice(7), 'hex'));
}

async function varsayilanGonderici(kime, metin) {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: numara } = process.env;
  if (!token || !numara) throw new Error('WhatsApp yapılandırılmamış');
  const res = await fetch(`${GRAPH}/${numara}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: kime, type: 'text', text: { body: metin.slice(0, 4000) } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}`);
}
let gonderici = varsayilanGonderici;
function gondericiAyarla(fn) {
  gonderici = fn || varsayilanGonderici;
}

// Webhook govdesinden { from, id, tip, metin } listesi cikarir
function gelenMesajlar(govde) {
  const sonuc = [];
  for (const giris of (govde && govde.entry) || []) {
    for (const degisim of giris.changes || []) {
      for (const m of (degisim.value && degisim.value.messages) || []) {
        sonuc.push({ from: String(m.from || ''), id: m.id, tip: m.type, metin: m.type === 'text' && m.text ? m.text.body : null });
      }
    }
  }
  return sonuc;
}

async function mesajiIsle(m) {
  if (!m.from || asistan.mesajIslendiMi(m.id)) return;
  const rol = asistan.rolBelirle(m.from);
  let cevap;
  if (m.metin === null) {
    cevap = 'Şimdilik yalnızca yazılı mesajları yanıtlayabiliyorum. Sorunuzu yazar mısınız?';
  } else {
    ({ cevap } = await asistan.cevapla({ kimlik: asistan.telefonSade(m.from), rol, mesaj: m.metin, waId: m.id }));
  }
  if (cevap) {
    try {
      await gonderici(m.from, cevap);
    } catch (err) {
      console.error('[whatsapp] gönderilemedi:', err.message);
    }
  }
}

const router = express.Router();

// Meta'nin webhook dogrulamasi
router.get('/', (req, res) => {
  const beklenen = process.env.WHATSAPP_VERIFY_TOKEN;
  if (beklenen && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === beklenen) {
    return res.status(200).type('text').send(String(req.query['hub.challenge'] || ''));
  }
  res.sendStatus(403);
});

router.post('/', (req, res) => {
  if (!process.env.WHATSAPP_APP_SECRET) return res.sendStatus(503);
  if (!imzaDogru(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  // Meta hizli 200 bekler; asistan kapaliysa da 200 doner ama mesaj islenmez
  res.sendStatus(200);
  if (!asistan.ayarlar().aktif) return;
  for (const m of gelenMesajlar(req.body)) {
    const is = mesajiIsle(m).catch((err) => console.error('[whatsapp]', err.message));
    bekleyenler.add(is);
    is.finally(() => bekleyenler.delete(is));
  }
});

module.exports = { router, imzaDogru, gelenMesajlar, gondericiAyarla, bekleyenleriBekle: () => Promise.all([...bekleyenler]) };
