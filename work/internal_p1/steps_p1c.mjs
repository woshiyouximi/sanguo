// P1 續驗（dev=1）：F4/F5/F16 頂欄與日誌 + F28 城旗像素取樣 + 超編城 N/CAP
export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?bg=0&dev=1&v1check=1&probe=r7&armyui=1&p3=' + Date.now(); 'go'`);
  await sleep(3200);

  const top = await ev(`(() => ({
    scName: document.getElementById('scName')?.textContent,
    ym: document.getElementById('ym')?.textContent,
    gold: document.getElementById('gold')?.textContent,
    hasV1: !!window.__v1,
    hasR7: !!window.__r7,
    state: window.__r7 ? (() => { const s = window.__r7.state(); return { month: s.month, startYear: window.__p1StartYear ?? null, owned: s.owned, gold: s.gold, logTail: (s.log || []).slice(-8).map(e => e.text) }; })() : null,
  }))()`);
  log('TOP3 ' + JSON.stringify(top, null, 1).slice(0, 3000));

  const flags = await ev(`(async () => {
    const cv = document.querySelector('#map');
    if (!cv) return { err: 'no canvas' };
    if (!window.__v1) return { err: 'no __v1' };
    const S = await import('./saves.js');
    const PAL = S.FORCE_PALETTE.map(e => ({ h: e.color, f: e.force }));
    const rgb = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
    const pal = PAL.map(p => ({ ...p, v: rgb(p.h) }));
    const near = (d) => {
      const best = pal.map(p => ({ h: p.h, f: p.f, d: Math.abs(d[0]-p.v[0]) + Math.abs(d[1]-p.v[1]) + Math.abs(d[2]-p.v[2]) })).sort((a,b) => a.d-b.d)[0];
      return best && best.d <= 45 ? best : null;
    };
    const g = cv.getContext('2d');
    const out = [];
    for (const c of window.__v1.cities()) {
      const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
      const sx = Math.round(xy[0]); const sy = Math.round(xy[1]);
      if (sx < 45 || sy < 45 || sx > cv.width - 10 || sy > cv.height - 10) continue;
      let hits = 0; let color = null; let force = null;
      for (const dx of [-27, -25, -23, -21]) for (const dy of [-15, -12, -9]) {
        try {
          const d = g.getImageData(sx + dx, sy + dy, 1, 1).data;
          if (d[3] < 180) continue;
          const m = near([d[0], d[1], d[2]]);
          if (m) { hits += 1; color = color || m.h; force = force || m.f; }
        } catch {}
      }
      if (hits) out.push({ city: c.NAME, hits, color, force });
    }
    return { palette: PAL.length, canvas: cv.id + ' ' + cv.width + 'x' + cv.height, flagged: out.length, sample: out.slice(0, 12) };
  })()`);
  log('FLAGS3 ' + JSON.stringify(flags, null, 1).slice(0, 2600));
  const s = await shot('p1_map_flags_dev'); log('shot ' + JSON.stringify(s));

  // F19：點一座超編城（濮陽 15）看城市卡 N/CAP 是否標紅
  const over = await ev(`(() => {
    const names = [...document.querySelectorAll('#cityList .n, #cityList .name')].map(e => e.textContent.trim());
    return names.slice(0, 8);
  })()`);
  log('LIST ' + JSON.stringify(over));
  return { top, flags };
}
