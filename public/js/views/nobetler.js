(function () {
  let suankiAy = new Date().toISOString().slice(0, 7);
  let nobetler = [];

  function yazmaYetkisiVar(ctx) {
    return ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
  }

  function ayAdi(ayStr) {
    const [yil, ay] = ayStr.split('-').map(Number);
    const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${aylar[ay - 1]} ${yil}`;
  }

  function ayDegistir(fark) {
    const [yil, ay] = suankiAy.split('-').map(Number);
    const tarih = new Date(yil, ay - 1 + fark, 1);
    suankiAy = tarih.toISOString().slice(0, 7);
  }

  function takvimCiz(ctx) {
    const [yil, ay] = suankiAy.split('-').map(Number);
    const ayinIlkGunu = new Date(yil, ay - 1, 1);
    const ayinGunSayisi = new Date(yil, ay, 0).getDate();
    // Pazartesi=0 olacak sekilde haftanin gunu
    const baslangicBosluk = (ayinIlkGunu.getDay() + 6) % 7;

    const nobetMap = new Map(nobetler.map((n) => [n.tarih, n]));
    const bugun = new Date().toISOString().slice(0, 10);

    let hucreler = '';
    for (let i = 0; i < baslangicBosluk; i++) hucreler += '<div></div>';
    for (let gun = 1; gun <= ayinGunSayisi; gun++) {
      const tarihStr = `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
      const nobet = nobetMap.get(tarihStr);
      const bugunMu = tarihStr === bugun;
      hucreler += `
        <div class="nobet-gun ${nobet ? 'nobet-aktif' : ''} ${bugunMu ? 'nobet-bugun' : ''}" data-tarih="${tarihStr}" ${nobet ? `data-id="${nobet.id}"` : ''} title="${nobet ? UI.esc(nobet.notlar || 'Nöbetçi') : ''}">
          <span>${gun}</span>
          ${nobet ? '<small>⚕ Nöbetçi</small>' : ''}
        </div>
      `;
    }

    return `
      <div class="toolbar">
        <button id="nobet-onceki" class="secondary">← Önceki Ay</button>
        <h3 style="margin:0">${ayAdi(suankiAy)}</h3>
        <button id="nobet-sonraki" class="secondary">Sonraki Ay →</button>
        <div class="spacer"></div>
        <a href="/api/nobetler/export?ay=${suankiAy}" download="nobetci-listesi-${suankiAy}.csv"><button type="button" class="secondary">Excel'e Aktar (CSV)</button></a>
      </div>
      <div class="card">
        ${yazmaYetkisiVar(ctx) ? '<p style="color:var(--text-muted);font-size:13px;margin-top:0">Bir güne tıklayarak nöbetçi eczane olarak işaretleyin/kaldırın.</p>' : ''}
        <div class="nobet-haftabaslik">
          <div>Pzt</div><div>Sal</div><div>Çar</div><div>Per</div><div>Cum</div><div>Cmt</div><div>Paz</div>
        </div>
        <div class="nobet-grid" id="nobet-grid">${hucreler}</div>
      </div>
    `;
  }

  const view = {
    async render(container, ctx) {
      const yenile = async () => {
        nobetler = await Api.get('/api/nobetler?ay=' + suankiAy);
        container.innerHTML = takvimCiz(ctx);

        document.getElementById('nobet-onceki').addEventListener('click', () => {
          ayDegistir(-1);
          yenile();
        });
        document.getElementById('nobet-sonraki').addEventListener('click', () => {
          ayDegistir(1);
          yenile();
        });

        if (yazmaYetkisiVar(ctx)) {
          document.getElementById('nobet-grid').addEventListener('click', async (e) => {
            const gunDiv = e.target.closest('.nobet-gun');
            if (!gunDiv) return;
            try {
              if (gunDiv.dataset.id) {
                await Api.del(`/api/nobetler/${gunDiv.dataset.id}`);
                UI.toast('Nöbet kaydı kaldırıldı', 'success');
              } else {
                await Api.post('/api/nobetler', { tarih: gunDiv.dataset.tarih });
                UI.toast('Nöbetçi olarak işaretlendi', 'success');
              }
              yenile();
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          });
        }
      };

      await yenile();
    }
  };

  Views.nobetler = view;
})();
