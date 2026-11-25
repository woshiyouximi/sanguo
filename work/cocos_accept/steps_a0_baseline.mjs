// A0：基準快照（localStorage 現狀 + 存檔槽）＋ 截圖可靠性自檢
import fs from 'node:fs';
import path from 'node:path';

const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __node = (name) => __all().find((x) => x.name === name) || null;
  const __lbl = (name) => { const n = __node(name); if (!n) return null; const l = n.getComponent(cc.Label); return l ? l.string : null; };
`;

export default async function ({ evaluate, sleep, shot, log, OUTDIR, s }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  try { await s('Page.bringToFront'); } catch (e) { log('bringToFront fail ' + e.message); }

  const out = { at: new Date().toISOString() };
  await sleep(5000);

  out.vis = await ev(`JSON.stringify({ vis: document.visibilityState, hidden: document.hidden, hasFocus: document.hasFocus() })`);
  out.ls = await ev(`(() => {
    const ks = [];
    for (let i = 0; i < localStorage.length; i += 1) ks.push(localStorage.key(i));
    const pick = (k) => { const v = localStorage.getItem(k); return v ? (v.length > 400 ? v.slice(0, 400) + '…(' + v.length + ')' : v) : null; };
    return JSON.stringify({ keys: ks, slots: pick('sanguo_slots_v1'), saveHead: pick('sanguo_save_v1'), slotPayloadKeys: ks.filter((k) => k.indexOf('slot_payload') >= 0) });
  })()`);

  // 帧计数器是否在跑（截圖可靠性）
  const f1 = await ev(`cc.director.getTotalFrames()`);
  await sleep(1000);
  const f2 = await ev(`cc.director.getTotalFrames()`);
  out.frames = { f1, f2, delta: f2 - f1 };

  await shot('a0_boot');
  fs.writeFileSync(path.join(OUTDIR, 'r0.json'), JSON.stringify(out, null, 1), 'utf8');
  log('wrote r0.json');
  return out;
}
