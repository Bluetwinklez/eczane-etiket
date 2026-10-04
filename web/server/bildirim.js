const nodemailer = require('nodemailer');
const { db } = require('./db');

function smtpYapilandirilmisMi() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// Bildirimi kaydeder ve mumkunse gonderir; kaydedilen bildirim satirini doner.
async function bildirimGonder(musteri, kanal, mesaj) {
  const info = db
    .prepare(`INSERT INTO bildirimler (musteri_id, kanal, mesaj, durum) VALUES (?, ?, ?, 'bekliyor')`)
    .run(musteri.id, kanal, mesaj);
  const bildirimId = info.lastInsertRowid;

  if (kanal === 'email' && smtpYapilandirilmisMi() && musteri.email) {
    try {
      await getTransporter().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: musteri.email,
        subject: 'Eczam Programı - Hatırlatma',
        text: mesaj
      });
      db.prepare(`UPDATE bildirimler SET durum='gonderildi' WHERE id=?`).run(bildirimId);
    } catch (err) {
      db.prepare(`UPDATE bildirimler SET durum='hata', hata_mesaji=? WHERE id=?`).run(
        String(err.message).slice(0, 500),
        bildirimId
      );
    }
  } else {
    // SMS icin gercek bir saglayici entegrasyonu bu ortamda mevcut degil; e-posta icin
    // SMTP ayari yoksa veya musterinin e-posta adresi yoksa da ayni sekilde simule edilir.
    db.prepare(`UPDATE bildirimler SET durum='simule' WHERE id=?`).run(bildirimId);
  }

  return db.prepare('SELECT * FROM bildirimler WHERE id = ?').get(bildirimId);
}

module.exports = { bildirimGonder, smtpYapilandirilmisMi };
