const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
let server, client;
before(async () => { server = await sunucuBaslat(); client = await girisliIstemci(server.base, 'eczaci'); });
after(() => server.kapat());
async function write(key, body) {
 const r = await fetch(server.base + '/api/istekler', { method: 'POST', headers: { Cookie: client.cerez(), 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
 return { status: r.status, data: await r.json(), replay: r.headers.get('Idempotency-Replayed') };
}
test('retry returns original response and creates one record', async () => {
 const body = { urun_adi: 'Test item', musteri_adi: 'Test customer' };
 const a = await write('mobile-one', body), b = await write('mobile-one', body);
 assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(b.replay, 'true'); assert.equal(a.data.id, b.data.id);
 assert.equal((await client.get('/api/istekler')).data.filter(x => x.urun_adi === 'Test item').length, 1);
 assert.equal((await write('mobile-one', { ...body, adet: 2 })).status, 409);
});
test('failed validation can be corrected using the same key', async () => {
 assert.equal((await write('mobile-two', {})).status, 400);
 assert.equal((await write('mobile-two', { urun_adi: 'Corrected', musteri_adi: 'Person' })).status, 201);
});
