// web/public altindaki ortak varliklari (logo, yazi tipleri) kabugun www klasorune kopyalar.
// "npm run senkron" bunu otomatik calistirir; elle: node scripts/hazirla.js
const fs = require('fs');
const path = require('path');

const kaynak = path.join(__dirname, '..', '..', 'web', 'public');
const hedef = path.join(__dirname, '..', 'www');

fs.mkdirSync(path.join(hedef, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(kaynak, 'img', 'logo-isaret.svg'), path.join(hedef, 'logo-isaret.svg'));
for (const f of fs.readdirSync(path.join(kaynak, 'fonts')).filter((x) => x.endsWith('.woff2') || x.startsWith('OFL'))) {
  fs.copyFileSync(path.join(kaynak, 'fonts', f), path.join(hedef, 'fonts', f));
}
console.log('www hazır:', fs.readdirSync(hedef).join(', '));
