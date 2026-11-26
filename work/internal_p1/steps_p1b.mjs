// P1 續驗：F4/F5/F16 頂欄與日誌 + F28 城旗像素取樣（同一存檔續玩）
export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?bg=0&v1check=1&probe=r7&p2=' + Date.now(); 'go'`);
  await sleep(3000);

  const top = await ev(`(() => ({
    scName: document.getElementById('scName')?.textContent,
    ym: document.getElementById('ym')?.textContent,
    gold: document.getElementById('gold')?.textContent,
    canvii: [...document.querySelectorAll('canvas')].map(c => c.id + ':' + c.width + 'x' + c.height),
    hasV1: !!window.__v1,
    hasR7: !!window.__r7,
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ').slice(0, 260) ?? null,
    state: window.__r7 ? (() => { const s = window.__r7.state(); return { month: s.month, owned: s.owned, gold: s.gold, logTail: (s.log || []).slice(-6) }; })() : null,
  }))()`);
  log('TOP2 ' + JSON.stringify(top, null, 1).slice(0, 3000));

  const flags = await ev(`(() => {
    const cv = document.querySelector('#map') || document.querySelector('canvas');
    if (!cv) return { err: 'no canvas' };
    if (!window.__v1) return { err: 'no __v1', ids: [...document.querySelectorAll('canvas')].map(c => c.id) };
    const g = cv.getContext('2d');
    const PAL = (window.Saves && window.Saves.FORCE_PALETTE) ? window.Saves.FORCE_PALETTE.map(e => e.color) : [];
    const rgb = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
    const pal = PAL.map(h => ({ h, v: rgb(h) }));
    const near = (d) => {
      const best = pal.map(p => ({ h: p.h, d: Math.abs(d[0]-p.v[0]) + Math.abs(d[1]-p.v[1]) + Math.abs(d[2]-p.v[2]) })).sort((a,b) => a.d-b.d)[0];
      return best && best.d <= 45 ? best : null;
    };
    const out = [];
    for (const c of window.__v1.cities()) {
      const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
      const sx = Math.round(xy[0]); const sy = Math.round(xy[1]);
      if (sx < 40 || sy < 40 || sx > cv.width - 10 || sy > cv.height - 10) continue;
      let hits = 0; let color = null;
      for (const dx of [-27, -25, -23, -21]) for (const dy of [-15, -12, -9]) {
        try {
          const d = g.getImageData(sx + dx, sy + dy, 1, 1).data;
          if (d[3] < 180) continue;
          const m = near([d[0], d[1], d[2]]);
          if (m) { hits += 1; color = color || m.h; }
        } catch {}
      }
      if (hits) out.push({ city: c.NAME, hits, color });
    }
    return { palette: PAL.length, canvas: cv.id + ' ' + cv.width + 'x' + cv.height, flagged: out.length, sample: out.slice(0, 10) };
  })()`);
  log('FLAGS2 ' + JSON.stringify(flags, null, 1).slice(0, 2200));
  const s = await shot('p1_map_flags_zoom');
  log('shot ' + JSON.stringify(s));

  return { top, flags };
}
