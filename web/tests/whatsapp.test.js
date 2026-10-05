const { test } = require('node:test');
const assert = require('node:assert/strict');
const WA = require('../public/js/whatsapp');

test('WhatsApp numarası: Türkiye biçimleri uluslararası koda çevrilir', () => {
  assert.equal(WA.numara('0532 111 22 33'), '905321112233');
  assert.equal(WA.numara('(0532) 111-22-33'), '905321112233');
  assert.equal(WA.numara('5321112233'), '905321112233');
  assert.equal(WA.numara('+90 532 111 22 33'), '905321112233');
  assert.equal(WA.numara('0090 532 111 22 33'), '905321112233');
  assert.equal(WA.numara('+49 151 23456789'), '4915123456789', 'yabancı numara korunur');
  assert.equal(WA.numara('0212 12'), null);
  assert.equal(WA.numara('90532111'), null);
  assert.equal(WA.numara(''), null);
  assert.equal(WA.numara(null), null);
});

test('WhatsApp bağlantısı ve hazır mesajlar', () => {
  const m = WA.SABLONLAR.raporBitis({ ad: 'Ayşe Yılmaz', ilac: 'Ramipril', tarih: '2026-10-14' });
  assert.equal(m, 'Merhaba Ayşe Yılmaz, Ramipril için ilaç raporunuzun süresi 14.10.2026 tarihinde doluyor. Yenileme için doktorunuza başvurmanızı hatırlatırız. Sağlıklı günler dileriz.');
  const u = WA.link('05321112233', m);
  assert.ok(u.startsWith('https://wa.me/905321112233?text='));
  assert.equal(decodeURIComponent(u.split('text=')[1]), m);
  assert.equal(WA.link('05321112233', ''), 'https://wa.me/905321112233');
  assert.equal(WA.link('123', 'x'), null);
  assert.match(WA.SABLONLAR.ilacBitis({ ad: 'A', ilac: 'Beloc', tarih: '2026-10-01', gecti: true }), /bitmiş olabilir/);
  assert.match(WA.SABLONLAR.urunGeldi({ ad: 'A', urun: 'Parol' }), /istediğiniz Parol eczanemize geldi/);

  // Dugme HTML'i kacislidir; gecersiz numarada bos doner
  const d = WA.dugme('05321112233', 'a"b<c>&');
  assert.match(d, /href="https:\/\/wa\.me\/905321112233\?text=a%22b%3Cc%3E%26"/);
  assert.match(d, /rel="noopener noreferrer"/);
  assert.equal(WA.dugme('', 'x'), '');
});
