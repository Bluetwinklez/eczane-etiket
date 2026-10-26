const crypto = require('node:crypto');
const { db } = require('./db');
const { requireLogin } = require('./auth');

// Only synchronous, queueable mobile writes participate in this transaction.
module.exports = function mobileIdempotency(req, res, next) {
  const key = req.get('Idempotency-Key');
  const supported = req.method === 'POST' && ['/api/istekler', '/api/kalite/sicaklik'].includes(req.path) || req.method === 'PUT' && /^\/api\/sayimlar\/\d+\/kalemler$/.test(req.path);
  if (!key || !supported) return next();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(key)) return res.status(400).json({ error: 'Geçersiz işlem kimliği' });
  requireLogin(req, res, () => {
    const fingerprint = crypto.createHash('sha256').update(req.method + req.originalUrl + JSON.stringify(req.body)).digest('hex');
    const saved = db.prepare('SELECT * FROM mobil_istekler WHERE kullanici_id=? AND anahtar=?').get(req.user.id, key);
    if (saved) {
      if (saved.ozet !== fingerprint) return res.status(409).json({ error: 'İşlem kimliği farklı bir kayıt için kullanılmış' });
      res.set('Idempotency-Replayed', 'true');
      return res.status(saved.durum).json(JSON.parse(saved.yanit));
    }
    db.exec('SAVEPOINT mobile_write');
    let active = true;
    const json = res.json.bind(res);
    res.json = (body) => {
      if (active) {
        if (res.statusCode < 400) {
          db.prepare('INSERT INTO mobil_istekler (kullanici_id,anahtar,ozet,durum,yanit) VALUES (?,?,?,?,?)').run(req.user.id, key, fingerprint, res.statusCode, JSON.stringify(body));
        } else db.exec('ROLLBACK TO mobile_write');
        db.exec('RELEASE mobile_write');
        active = false;
      }
      return json(body);
    };
    try { next(); } finally {
      if (active) { db.exec('ROLLBACK TO mobile_write; RELEASE mobile_write'); active = false; }
    }
  });
};
