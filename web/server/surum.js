// Calisan surum: package.json surumu + git commit (kurulum git ile yapildiysa).
// git programi gerekmez; .git klasoru dogrudan okunur.
const fs = require('fs');
const path = require('path');
const paket = require('../package.json');

const KOK = path.join(__dirname, '..', '..');

function gitCommit() {
  try {
    const gitDir = path.join(KOK, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = (head.match(/^ref: (.+)$/) || [])[1];
    if (!ref) return null;
    const refYolu = path.join(gitDir, ref);
    if (fs.existsSync(refYolu)) return fs.readFileSync(refYolu, 'utf8').trim();
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const satir = packed.split('\n').find((s) => s.endsWith(' ' + ref));
    return satir ? satir.split(' ')[0] : null;
  } catch (e) {
    return null;
  }
}

function surumBilgisi() {
  const commit = gitCommit();
  return { surum: paket.version, commit, kisa: commit ? commit.slice(0, 7) : null };
}

// GitHub'daki son commit ile karsilastirir (yalnizca api.github.com; internet yoksa sessizce gecer)
const DEPO = 'Bluetwinklez/eczane-etiket';
async function guncellemeKontrol(fetchFn = fetch) {
  const yerel = surumBilgisi();
  if (!yerel.commit) return { durum: 'bilinmiyor', aciklama: 'Kurulum git ile yapılmamış; güncelleme kontrol edilemiyor', yerel };
  try {
    const yanit = await fetchFn(`https://api.github.com/repos/${DEPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'eczam-guncelleme' },
      signal: AbortSignal.timeout(6000)
    });
    if (!yanit.ok) return { durum: 'kontrol_edilemedi', aciklama: `GitHub ${yanit.status} döndürdü`, yerel };
    const v = await yanit.json();
    const uzak = { commit: v.sha, kisa: String(v.sha || '').slice(0, 7), tarih: v.commit && v.commit.committer && v.commit.committer.date, mesaj: v.commit && String(v.commit.message || '').split('\n')[0] };
    return { durum: uzak.commit === yerel.commit ? 'guncel' : 'yeni_surum_var', yerel, uzak };
  } catch (e) {
    return { durum: 'kontrol_edilemedi', aciklama: 'İnternet bağlantısı yok veya GitHub yanıt vermedi', yerel };
  }
}

module.exports = { surumBilgisi, guncellemeKontrol, gitCommit };
