const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('Notes scan keeps raw text off the server and shares only after tapping', async () => {
 const source = fs.readFileSync(require('node:path').join(__dirname, '../public/mobil/mobil.js'), 'utf8');
 const body = source.slice(source.indexOf('    let toplu = false;'), source.indexOf("    $('#elle-form').addEventListener"));
 const elements = new Map();
 const $ = (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
 const shared = [], copied = [];
 let requests = 0;
 const sheet = { isConnected: true, remove() { this.isConnected = false; } };
 const context = { $, mod: 'notlar', Date, document: { body: {} },
  MutationObserver: class { observe() {} disconnect() {} },
  navigator: { share: async (data) => shared.push(data.text), clipboard: { writeText: async (t) => copied.push(t) } },
  sayfaAc: () => sheet, toast() {}, barkodCoz: async () => { requests++; },
 };
 vm.createContext(context);
 vm.runInContext(body + '\nglobalThis.scan = okundu;', context);
 const text = 'https://example.com/qr?code=<script>&id=1';
 await context.scan(text);
 assert.equal($('#qr-metin').value, text);
 assert.equal(requests, 0);
 assert.deepEqual(shared, []);
 await $('#qr-paylas').onclick();
 await $('#qr-kopyala').onclick();
 assert.deepEqual(shared, [text]);
 assert.deepEqual(copied, [text]);
 $('#qr-devam').onclick();
 assert.equal(sheet.isConnected, false);
});
test('batch Notes scan deduplicates raw codes and shares the complete list', async () => {
 const source = fs.readFileSync(require('node:path').join(__dirname, '../public/mobil/mobil.js'), 'utf8');
 const body = source.slice(source.indexOf('    let toplu = false;'), source.indexOf("    $('#elle-form').addEventListener"));
 const elements = new Map();
 const $ = id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
 const shared = [];
 const sheet = { isConnected: true, remove() { this.isConnected = false; } };
 const context = { $, mod: 'notlar', Date, document: { body: {} }, MutationObserver: class { observe() {} disconnect() {} },
  navigator: { share: async data => shared.push(data.text) }, sayfaAc: () => sheet, toast() {}, barkodCoz: () => { throw Error('Must not contact server'); } };
 vm.createContext(context); vm.runInContext(body + '\nglobalThis.scan = okundu;', context);
 $('#qr-toplu').onclick();
 await context.scan('first'); await context.scan('first'); await context.scan('second');
 assert.equal($('#qr-liste').textContent, 'Okunan kodlar (2)');
 assert.deepEqual(shared, []);
 $('#qr-liste').onclick(); await $('#qr-paylas').onclick();
 assert.deepEqual(shared, ['first\nsecond']);
 $('#qr-temizle').onclick(); assert.equal($('#qr-liste').hidden, true);
});
