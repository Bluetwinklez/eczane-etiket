const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/mobil/mobil.js'), 'utf8');
const login = source.slice(source.indexOf('  function girisEkrani('), source.indexOf('  // ---------- Ekran: ozet'));
async function run({ search = '?demo=1', demo = { kullanici: 'demo', sifre: 'demo1234' }, fail = false } = {}) {
  const elements = new Map();
  const calls = [];
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, disabled: false, addEventListener(_, fn) { this.submit = fn; }, querySelector() { return $('#submit'); }, requestSubmit() { this.submit({ preventDefault() {}, target: this }); }, click() { this.onclick(); } });
    return elements.get(id);
  };
  const context = { document: { documentElement: { style: { setProperty() {} } } }, $, uyg: {}, gezinme: {}, esc: String, hataKutusu: (e) => e.message, location: { search, hash: '#/giris' }, oturum: {}, URLSearchParams,
    fetch: async () => ({ json: async () => ({ ok: true, demo }) }),
    post: async (url, body) => { calls.push({ url, body }); if (fail) throw new Error('Giriş başarısız'); return { user: { id: 1 } }; },
  };
  vm.runInNewContext(login + '\ngirisEkrani();', context);
  await new Promise(setImmediate);
  return { context, $, calls };
}
test('explicit demo launch signs in and opens summary without input', async () => {
  const s = await run();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, '/api/auth/login');
  assert.equal(s.calls[0].body.kullanici_adi, 'demo');
  assert.equal(s.context.location.hash, '#/ozet');
  assert.equal(s.$('#giris-form').hidden, true);
});
test('regular pharmacy server never auto signs in', async () => {
  const s = await run({ demo: null });
  assert.equal(s.calls.length, 0);
});
test('normal web login stays manual', async () => {
  const s = await run({ search: '' });
  assert.equal(s.calls.length, 0);
});
test('failed automatic login exposes retry controls and error', async () => {
  const s = await run({ fail: true });
  assert.equal(s.$('#giris-form').hidden, false);
  assert.equal(s.$('#submit').disabled, false);
  assert.equal(s.$('#giris-hata').innerHTML, 'Giriş başarısız');
});
