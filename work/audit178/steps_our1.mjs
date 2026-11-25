// 178 复核：截我们自己的战斗画面（只读，不改码）
export default async function ({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  await s('Page.bringToFront');
  await sleep(1000);

  // 等 cc 起来（最多 40s；必要时 reload 一次）
  let booted = false;
  for (let i = 0; i < 40; i++) {
    const ok = await ev('typeof cc === "object" && !!(cc.director && cc.director.getScene())');
    if (ok === true) { booted = true; break; }
    if (i === 12) { try { await ev('location.reload()'); } catch (e) {} }
    await sleep(1000);
  }
  const out = { booted };
  const f0 = await ev('cc.director.getTotalFrames()');
  await sleep(1200);
  const f1 = await ev('cc.director.getTotalFrames()');
  out.frames = { f0, f1, rising: f1 > f0 };
  out.scene = await ev('cc.director.getScene() ? cc.director.getScene().name : null');
  await s('Page.bringToFront');
  await sleep(400);

  // 进战斗
  out.load = await ev(`(() => { try { cc.director.loadScene('Battle'); return 'ok'; } catch (e) { return 'err:' + e; } })()`);
  await sleep(3000);
  await s('Page.bringToFront');
  await sleep(300);

  out.canvas = await ev(`(() => { const c = document.querySelector('canvas'); if (!c) return null; const b = c.getBoundingClientRect(); return { left: b.left, top: b.top, w: b.width, h: b.height }; })()`);
  out.shot1 = await shot('our_b01_battle_start.png');

  // 文本快照
  out.labels = await ev(`(() => {
    const sc = cc.director.getScene(); if (!sc) return [];
    const res = [];
    const walk = (n) => {
      (n._components || []).forEach((c) => {
        if (c && typeof c.string === 'string' && c.string.trim()) {
          const p = n.getWorldPosition ? n.getWorldPosition() : null;
          res.push({ t: c.string, x: Math.round(p ? p.x : 0), y: Math.round(p ? p.y : 0) });
        }
      });
      (n.children || []).forEach(walk);
    };
    walk(sc);
    return res.slice(0, 220);
  })()`);
  log('labels', JSON.stringify(out.labels).slice(0, 3000));
  return out;
}
