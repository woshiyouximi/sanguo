// P1 補證：旗形像素遮罩（完整窗口 dx -32..-2, dy -20..+2）
export default async function ({ evaluate, log }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  await ev(`location.href = 'http://127.0.0.1:5173/web/campaign.html?bg=0&dev=1&v1check=1&pa=' + Date.now(); 'go'`);
  await evaluate(`new Promise(r => setTimeout(r, 2800))`);
  const mask = await ev(`(async () => {
    const cv = document.querySelector('#map'); const g = cv.getContext('2d');
    const S = await import('./saves.js');
    const pal = S.FORCE_PALETTE.map(e => [1,3,5].map(i => parseInt(e.color.slice(i, i+2), 16)));
    const near = (d) => pal.some(p => Math.abs(d[0]-p[0]) + Math.abs(d[1]-p[1]) + Math.abs(d[2]-p[2]) <= 30);
    const draw = (name) => {
      const c = window.__v1.cities().find(x => x.name === name);
      const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
      const sx = Math.round(xy[0]); const sy = Math.round(xy[1]);
      const rows = [];
      for (let dy = -20; dy <= 2; dy++) {
        let line = '';
        for (let dx = -32; dx <= -2; dx++) {
          const d = g.getImageData(sx + dx, sy + dy, 1, 1).data;
          line += (d[3] > 160 && near([d[0], d[1], d[2]])) ? '#' : '.';
        }
        rows.push(String(dy).padStart(3) + ' ' + line);
      }
      return name + ' (dx -32..-2)\\n' + rows.join('\\n');
    };
    return { city: draw('南皮'), gate: draw('界橋') };
  })()`);
  log('MASK2\\n' + mask.city + '\\n---\\n' + mask.gate);
  return mask;
}
