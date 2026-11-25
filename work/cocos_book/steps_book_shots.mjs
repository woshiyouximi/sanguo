/**
 * R208 名冊行頭像真機驗收：Campaign → openGeneralBook() → 輪詢等 20 行圖層 ready → dump + 截圖。
 *
 * 跑法（先起靜態服務，PAGE_URL 指到 cocos-build/web-mobile/index.html）：
 *   node work\cocos_verify\cdpweb.mjs launch
 *   node work\cocos_verify\cdpweb.mjs run work\cocos_book\steps_book_shots.mjs
 *   node work\cocos_verify\cdpweb.mjs close
 */
export default async function ({ evaluate, sleep, shot, log }) {
  const J = (s) => JSON.parse(s);
  const ev = async (expr) => {
    const v = await evaluate(expr, { returnByValue: true });
    if (v && v.__throw) throw new Error(v.__throw);
    return typeof v === 'string' ? J(v) : v;
  };

  const probe = `(() => {
    const scene = cc.director.getScene();
    const find = (root, name) => { let hit = null; (function w(n) { if (!hit && n.name === name) hit = n; for (const c of n.children || []) w(c); })(root); return hit; };
    const out = { rows: [], panel: null };
    for (let i = 0; i < 20; i += 1) {
      const img = find(scene, 'BookRowFaceImg' + i);
      const letter = find(scene, 'BookRowFace' + i);
      const t = img ? img.getComponent('cc.UITransform') : null;
      const sp = img ? img.getComponent('cc.Sprite') : null;
      const lb = letter ? letter.getComponent('cc.Label') : null;
      const sf = sp ? sp.spriteFrame : null;
      out.rows.push({
        i,
        img: !!img,
        active: img ? img.active : null,
        w: t ? Math.round(t.width * 100) / 100 : null,
        h: t ? Math.round(t.height * 100) / 100 : null,
        hasFrame: !!sf,
        frameW: sf ? sf.originalSize.width : null,
        frameH: sf ? sf.originalSize.height : null,
        letterActive: letter ? letter.active : null,
        letterText: lb ? lb.string : null,
      });
    }
    const name0 = find(scene, 'BookRowName0');
    out.panel = name0 && name0.parent ? name0.parent.name : null;
    return JSON.stringify(out);
  })()`;

  const before = await ev(`JSON.stringify({ scene: cc.director.getScene().name })`);
  log('before =', JSON.stringify(before));

  // 面板可能已开着（重复跑时不要重开）
  let first = await ev(probe);
  if (!first.rows.some((r) => r.img)) {
    if (before.scene !== 'Campaign') {
      await evaluate(`cc.director.loadScene('Campaign')`, { returnByValue: true });
      await sleep(3500);
    }
    await sleep(800);
    const opened = await ev(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const comp = c.components.find((x) => x && x.save && x.cities);
      const out = { hasComp: !!comp };
      try { comp.openGeneralBook(); out.called = true; } catch (e) { out.err = String((e && e.stack) || e); }
      return JSON.stringify(out);
    })()`);
    log('open =', JSON.stringify(opened));
  }

  // 等圖：最多 15 s，等到「ready 的圖層數不再變（且 ≥1）」
  let last = -1;
  let dump = null;
  for (let k = 0; k < 30; k += 1) {
    dump = await ev(probe);
    const ready = dump.rows.filter((r) => r.active === true && r.hasFrame).length;
    if (ready === last && ready > 0) break;
    last = ready;
    await sleep(500);
  }
  log('rows =', JSON.stringify(dump));
  const withFrame = dump.rows.filter((r) => r.active === true && r.hasFrame).length;
  const hiddenLetters = dump.rows.filter((r) => r.active === true && r.hasFrame && r.letterActive === false).length;
  const sizes = dump.rows.filter((r) => r.hasFrame).map((r) => `${r.w}x${r.h}`);
  log('summary =', JSON.stringify({ withFrame, hiddenLetters, sizes: Array.from(new Set(sizes)), panel: dump.panel }));
  await shot('book_roster.png');
}
