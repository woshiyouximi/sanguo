// P：狀態探針（場景 / 存檔 / 招降面板 / 頁面年齡）
import fs from 'node:fs';
import path from 'node:path';

const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __scene = () => (cc.director.getScene() ? cc.director.getScene().name : '?');
  const __comps = () => { const s = new Set(); __all().forEach((n) => (n.components || []).forEach((c) => s.add(__cn(c)))); return [...s]; };
`;

export default async function ({ evaluate, sleep, shot, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = { at: new Date().toISOString() };
  out.page = await ev(`JSON.stringify({ ageSec: Math.round(performance.now()/1000), scene: ${'cc.director.getScene() ? cc.director.getScene().name : "?"'}, frames: cc.director.getTotalFrames() })`);
  out.ls = await ev(`(() => {
    const ks=[]; for (let i=0;i<localStorage.length;i+=1) ks.push(localStorage.key(i));
    const g=(k)=>{const v=localStorage.getItem(k); return v? v.length : null;};
    const sizes={}; ks.forEach(k=>sizes[k]=g(k));
    const blog = localStorage.getItem('sanguo_battlelog_v1');
    return JSON.stringify({ keys: ks, sizes, battlelog: blog ? blog.slice(0,300) : null });
  })()`);
  out.props = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const sp = __comp('SurrenderPanel');
    const s = c ? (c.save || {}) : {};
    return JSON.stringify({
      scene: __scene(), comps: __comps(),
      hasCampaign: !!c, month: s.month, gold: s.gold, wins: s.wins, losses: s.losses,
      post: s.post ? JSON.stringify(s.post).slice(0, 300) : null,
      lastBattle: c && c.lastBattle ? JSON.stringify(c.lastBattle).slice(0,200) : null,
      surrender: sp && typeof sp.debug === 'function' ? sp.debug() : null,
      surrenderOpen: sp ? sp.isOpen : null,
    });
  })()`);
  fs.writeFileSync(path.join(OUTDIR, 'rp.json'), JSON.stringify(out, null, 1), 'utf8');
  log('wrote rp.json');
  return out;
}
