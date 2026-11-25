export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  await sleep(4000);
  const a = await ev(`(() => { const u = window.SG && window.SG.portraitUrl ? window.SG.portraitUrl('關羽','full') : null; return JSON.stringify({ hasFaceMap: !!window.SG, url: u }); })()`);
  log('face ' + JSON.stringify(a));
  if (a.url) {
    const r = await ev(`(async () => { const r = await fetch(${JSON.stringify('')} + ${JSON.stringify('')} + ''); return ''; })()`).catch(() => null);
  }
  const probe = await ev(`(async () => {
    const u = window.SG.portraitUrl('關羽','full');
    const resp = await fetch(u);
    const blob = await resp.blob();
    const img = new Image();
    const ok = await new Promise((res) => { img.onload = () => res([img.naturalWidth, img.naturalHeight]); img.onerror = () => res(null); img.src = u; });
    return JSON.stringify({ url: u, status: resp.status, type: resp.headers.get('content-type'), bytes: blob.size, loaded: ok });
  })()`);
  log('probe ' + JSON.stringify(probe));
  await shot('face_probe');
}
