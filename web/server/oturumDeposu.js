const session = require('express-session');

// express-session'in varsayilan MemoryStore'u sunucu yeniden basladiginda
// tum oturumlari kaybeder ve uretimde bellek sizdirir; oturumlari ayni
// SQLite veritabaninda tutan kucuk bir depo.
class SqliteOturumDeposu extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.temizlikZamanlayici = setInterval(() => this.suresiDolanlariSil(), 15 * 60 * 1000);
    this.temizlikZamanlayici.unref();
  }

  suresiDolanlariSil() {
    this.db.prepare('DELETE FROM oturumlar WHERE bitis < ?').run(Date.now());
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT veri, bitis FROM oturumlar WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.bitis < Date.now()) {
        this.db.prepare('DELETE FROM oturumlar WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.veri));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const bitis =
        sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 24 * 60 * 60 * 1000;
      this.db
        .prepare(
          `INSERT INTO oturumlar (sid, veri, bitis) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET veri = excluded.veri, bitis = excluded.bitis`
        )
        .run(sid, JSON.stringify(sess), bitis);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM oturumlar WHERE sid = ?').run(sid);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  kullaniciOturumlariniSil(userId, haricSid) {
    const rows = this.db.prepare('SELECT sid, veri FROM oturumlar').all();
    for (const row of rows) {
      if (row.sid === haricSid) continue;
      try {
        if (JSON.parse(row.veri).userId === userId) {
          this.db.prepare('DELETE FROM oturumlar WHERE sid = ?').run(row.sid);
        }
      } catch (e) {
        // bozuk kayit: atla
      }
    }
  }
}

module.exports = SqliteOturumDeposu;
