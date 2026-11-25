export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const H = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  `;
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  let last = '';
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = await ev(`(() => { ${H} const s = cc.director.getScene(); return JSON.stringify({ n: s ? s.name : null, nodes: s ? __all().length : 0 }); })()`);
    last = JSON.stringify(r);
    if (r.n && r.n !== 'Boot') break;
  }
  log('scene ' + last);
  const out = await ev(`(() => { ${H}
    const all = __all();
    const sp = all.filter((n) => (n.components || []).some((c) => __cn(c) === 'Sprite'));
    const withFrame = sp.filter((n) => { const s = (n.components || []).find((c) => __cn(c) === 'Sprite'); return !!(s && s.spriteFrame); });
    const skins = all.filter((n) => /^Skin_|^Ui_|^Plate_/.test(n.name));
    return JSON.stringify({ scene: cc.director.getScene().name, sprites: sp.length, withFrame: withFrame.length, skins: skins.length, names: skins.slice(0,6).map((n)=>n.name) });
  })()`);
  log('skin ' + JSON.stringify(out));
  await shot('r86_skin_check');
}
