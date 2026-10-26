// Each demo session gets a private copy of the seeded sample database.
// Connections are request scoped; files live only for this server process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { baseDb, dbContext } = require('./db');
let directory;
module.exports = function demoSpaces(req, res, next) {
  if (process.env.ECZAM_DEMO !== '1' || !req.path.startsWith('/api/') || req.path === '/api/health') return next();
  if (!directory) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eczam-demo-'));
    baseDb.exec(`VACUUM INTO '${path.join(directory, 'template.db').replace(/'/g, "''")}'`);
  }
  const now = Date.now();
  // Reclaim expired sessions and cap disk use instead of growing indefinitely.
  for (const file of fs.readdirSync(directory)) {
    if (file !== 'template.db' && fs.statSync(path.join(directory, file)).mtimeMs < now - 8 * 3600000) fs.unlinkSync(path.join(directory, file));
  }
  let id = req.session.demoSpace;
  if (!/^[a-f0-9]{32}$/.test(id || '')) id = crypto.randomBytes(16).toString('hex');
  const filename = path.join(directory, id + '.db');
  if (!fs.existsSync(filename)) {
    if (fs.readdirSync(directory).length > 100) return res.status(503).json({ error: 'Deneme alanları dolu. Daha sonra tekrar deneyin.' });
    fs.copyFileSync(path.join(directory, 'template.db'), filename);
  }
  req.session.demoSpace = id;
  fs.utimesSync(filename, new Date(), new Date());
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  res.once('close', () => setImmediate(() => database.close()));
  dbContext.run(database, next);
};
