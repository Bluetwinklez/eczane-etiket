const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('scanner requests rear HD video, filters repeats, exposes controls and releases camera', async () => {
 const source = fs.readFileSync(path.join(__dirname, '../public/mobil/mobil.js'), 'utf8');
 const code = source.slice(source.indexOf('  async function kameraBaslat'), source.indexOf('  // ---------- Tarama'));
 let callback, constraints, resets = 0, observer;
 const applied = [], read = [];
 const track = { getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 4, step: 0.1 } }), getSettings: () => ({ zoom: 1 }), applyConstraints: async (v) => applied.push(v) };
 const elements = { video: { srcObject: { getVideoTracks: () => [track] } }, '[data-flash]': {}, '[data-zoom]': { parentElement: {} } };
 class Reader {
  async decodeFromConstraints(c, v, cb) { constraints = c; callback = cb; }
  reset() { resets++; }
 }
 const zxing = { DecodeHintType: {}, BarcodeFormat: {}, BrowserMultiFormatReader: Reader };
 const context = { navigator: { mediaDevices: { getUserMedia() {} } }, window: { ZXing: zxing }, ZXing: zxing,
  Map, Date, Promise, document: { body: {} }, $: (s) => elements[s], toast() {}, esc: String,
  MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
 };
 vm.createContext(context); vm.runInContext(code + '\nglobalThis.start = kameraBaslat;', context);
 const camera = { isConnected: true };
 const stop = await context.start(camera, (s) => read.push(s));
 assert.equal(constraints.video.width.ideal, 1920);
 assert.equal(constraints.audio, false);
 callback({ getText: () => 'QR1' }); callback({ getText: () => 'QR1' });
 assert.deepEqual(read, ['QR1']);
 await elements['[data-flash]'].onclick();
 assert.equal(applied[0].advanced[0].torch, true);
 elements['[data-zoom]'].value = '2'; await elements['[data-zoom]'].onchange();
 assert.equal(applied[1].advanced[0].zoom, 2);
 camera.isConnected = false; observer();
 callback({ getText: () => 'QR2' });
 assert.deepEqual(read, ['QR1']); assert.ok(resets > 0);
 stop();
});
