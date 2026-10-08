const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat } = require('./helpers');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(() => sunucu.kapat());

test('saglik kontrolu girissiz, her kaynaktan okunur ve Eczam oldugunu bildirir', async () => {
  const r = await fetch(`${sunucu.base}/api/health`, { headers: { Origin: 'capacitor://localhost' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('access-control-allow-credentials'), null);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.uygulama, 'eczam');
  assert.equal(typeof j.ad, 'string');
});
