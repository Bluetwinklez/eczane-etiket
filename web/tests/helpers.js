// Her test dosyasi node --test tarafindan ayri bir proseste calistirilir;
// bu yuzden her dosya kendi izole, bellek ici veritabanini alir.
process.env.ECZANEM_DB_PATH = ':memory:';

const app = require('../server/app');

async function sunucuBaslat() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    kapat: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      })
  };
}

function istemci(base) {
  let cookie = '';

  async function istek(method, url, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(base + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (res.status !== 204) {
      data = contentType.includes('application/json') ? await res.json() : await res.text();
    }
    return { status: res.status, data, headers: res.headers };
  }

  return {
    get: (url) => istek('GET', url),
    post: (url, body = {}) => istek('POST', url, body),
    put: (url, body = {}) => istek('PUT', url, body),
    del: (url) => istek('DELETE', url),
    girisYap: (kullaniciAdi, sifre) => istek('POST', '/api/auth/login', { kullanici_adi: kullaniciAdi, sifre }),
    cerez: () => cookie
  };
}

const DEMO = {
  admin: ['admin', 'admin123'],
  eczaci: ['eczaci', 'eczaci123'],
  kasiyer: ['kasiyer', 'kasiyer123']
};

// Demo hesaplar ilk giriste sifre degistirmeye zorlanir; degisen sifreyi
// bu proses icinde hatirlar ki ayni rolle tekrar giris yapilabilsin.
const guncelSifreler = {};

async function girisliIstemci(base, rol) {
  const [kullaniciAdi, ilkSifre] = DEMO[rol];
  const sifre = guncelSifreler[kullaniciAdi] || ilkSifre;
  const c = istemci(base);
  const res = await c.girisYap(kullaniciAdi, sifre);
  if (res.status !== 200) throw new Error(`${rol} girisi basarisiz: ${res.status} ${JSON.stringify(res.data)}`);

  if (res.data.user.sifre_degistirilmeli) {
    const yeni = `${kullaniciAdi}Yeni2026`;
    const d = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: sifre, yeni_sifre: yeni });
    if (d.status !== 200) throw new Error(`${rol} sifre degisimi basarisiz: ${JSON.stringify(d.data)}`);
    guncelSifreler[kullaniciAdi] = yeni;
  }
  return c;
}

module.exports = { sunucuBaslat, istemci, girisliIstemci, DEMO };
