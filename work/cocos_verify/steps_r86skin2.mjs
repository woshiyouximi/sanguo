export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  const H = `
    const __cn = (c) => { const n = (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; return n.replace(/^cc\\./, ''); };
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  `;
  await sleep(14000);
  const r = await ev(`(() => { ${H}
    const all = __all();
    const sp = all.filter((n) => (n.components || []).some((c) => __cn(c) === 'Sprite'));
    const withFrame = sp.filter((n) => { const s = (n.components || []).find((c) => __cn(c) === 'Sprite'); return !!(s && s.spriteFrame); });
    const skins = all.filter((n) => /^Skin_|^Ui_|^Plate_/.test(n.name));
    const labels = all.filter((n) => (n.components || []).some((c) => __cn(c) === 'Label')).length;
    return JSON.stringify({ scene: cc.director.getScene().name, nodes: all.length, sprites: sp.length, withFrame: withFrame.length, skins: skins.length, skinNames: skins.slice(0,6).map((n)=>n.name), labels });
  })()`);
  log('title ' + JSON.stringify(r));
  await shot('r86_title_ok');
}
