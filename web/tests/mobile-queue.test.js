const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const src = fs.readFileSync(require('node:path').join(__dirname, '../public/mobil/mobil.js'), 'utf8');
function queue(api) {
 let records = [];
 const storage = {};
 const c = { crypto, Date, oturum: { kullanici: { id: 7 } }, cevrimiciMi: true, api, toast() {}, kuyrukRozeti() {},
  yerel: () => records, localStorage: { setItem: (_, value) => { records = JSON.parse(value); }, removeItem(key) { delete storage[key]; } },
 };
 vm.createContext(c);
 vm.runInContext(src.slice(src.indexOf('  const KUYRUK ='), src.indexOf('  function kuyrukRozeti()')) + '\nglobalThis.add = kuyruklaGonder; globalThis.flush = kuyruguBosalt;', c);
 return { c, records: () => records };
}
test('server errors retain records and stable IDs across retries', async () => {
 const ids = [];
 let fail = true;
 const q = queue(async (_, __, ___, o) => { ids.push(o.istekId); if (fail) throw Object.assign(new Error('Server failure'), { durum: 500 }); });
 assert.equal((await q.c.add('POST', '/api/istekler', {}, 'Example')).kuyrukta, true);
 assert.equal(q.records().length, 1); assert.equal(q.records()[0].hata, 'Server failure');
 fail = false; await q.c.flush();
 assert.equal(q.records().length, 0); assert.equal(ids[0], ids[1]);
});
test('overlapping drains share a single request and preserve newly queued records', async () => {
 let release, calls = 0;
 const q = queue(async () => { calls++; await new Promise(r => { release = r; }); });
 const a = q.c.add('POST', '/api/istekler', {}, 'First');
 const b = q.c.add('POST', '/api/istekler', {}, 'Second');
 const c = q.c.flush();
 assert.equal(calls, 1); release(); await Promise.all([a,b,c]);
 assert.equal(q.records().length, 1); assert.equal(q.records()[0].aciklama, 'Second');
});
test('validation failures remain reviewable instead of being discarded', async () => {
 const q = queue(async () => { throw Object.assign(new Error('Invalid product'), { durum: 400 }); });
 await q.c.add('PUT', '/api/sayimlar/1/kalemler', {}, 'Count');
 assert.equal(q.records()[0].hata, 'Invalid product');
});
test('failed local persistence is reported without sending or claiming success', async () => {
 let calls = 0;
 const q = queue(async () => calls++);
 q.c.localStorage.setItem = () => { throw new Error('Storage full'); };
 await assert.rejects(q.c.add('POST', '/api/istekler', {}, 'Example'), /Storage full/);
 assert.equal(calls, 0);
});
test('another user cannot automatically submit saved records', async () => {
 let calls = 0;
 const q = queue(async () => calls++);
 q.c.cevrimiciMi = false;
 await q.c.add('POST', '/api/istekler', {}, 'Example');
 q.c.oturum.kullanici.id = 8; q.c.cevrimiciMi = true; await q.c.flush();
 assert.equal(calls, 0); assert.equal(q.records().length, 1);
});
test('logout cleanup clears cached identity and records while preserving connection and language preferences', () => {
 const q = queue(async () => {});
 Object.assign(q.c.localStorage, { 'eczanem:kullanici': 'private', 'onb:/api/ilaclar': 'cache', 'eczanem:kuyruk': 'queue', 'eczanem:dil': 'tr', 'eczanem:sunucu': 'server' });
 q.c.localStorage.removeItem = key => delete q.c.localStorage[key];
 vm.runInContext('cihazVerileriniTemizle()', q.c);
 assert.equal(q.c.localStorage['eczanem:kullanici'], undefined);
 assert.equal(q.c.localStorage['onb:/api/ilaclar'], undefined);
 assert.equal(q.c.localStorage['eczanem:kuyruk'], undefined);
 assert.equal(q.c.localStorage['eczanem:dil'], 'tr');
 assert.equal(q.c.localStorage['eczanem:sunucu'], 'server');
});
