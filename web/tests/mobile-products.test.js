const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/mobil/mobil.js'), 'utf8');
async function screen(fail = false) {
 const elements = new Map();
 const $ = id => { if (!elements.has(id)) elements.set(id, { value: '', addEventListener(name, fn) { this[name] = fn; } }); return elements.get(id); };
 const data = Array.from({ length: 175 }, (_, i) => ({ id: i + 1, ad: 'Product ' + i, satis_fiyati: 5, stok: 12, kritik_stok: 3 }));
 const c = { $, uyg: { querySelectorAll: () => [] }, get: async () => { if (fail) throw Error('Server offline'); return data; }, cerceve() {}, yerel: () => null, tl: String, esc: String, MASKOT: '', hataKutusu: e => e.message, URLSearchParams };
 vm.createContext(c); vm.runInContext(source.slice(source.indexOf('  async function urunlerEkrani('), source.indexOf('  // Kamera:')) + '\nglobalThis.open = urunlerEkrani;', c);
 await c.open(new URLSearchParams()); return $;
}
test('all matching products can be reached and search resets the page size', async () => {
 const $ = await screen();
 const count = () => ($('#u-liste').innerHTML.match(/data-id=/g) || []).length;
 assert.equal(count(), 80); $('#u-daha').onclick(); assert.equal(count(), 160);
 $('#u-daha').onclick(); assert.equal(count(), 175); assert.equal($('#u-daha').hidden, true);
 $('#u-ara').value = 'Product 17'; $('#u-ara').input(); assert.equal(count(), 6);
});
test('network failure is distinguished from no matching products', async () => {
 const $ = await screen(true);
 assert.match($('#u-liste').innerHTML, /Server offline/);
 assert.doesNotMatch($('#u-liste').innerHTML, /Sonuç bulunamadı/);
});
