// 170：Cocos 編成頁「步/騎兩欄」取證
// 前置：Edge 需以 --touch-events=enabled 啟動（Cocos 的 TouchInput 只在 navigator.maxTouchPoints>0 時掛 touch 監聽）
// 用法：PORT=9461 OUTDIR=F:\sanguo\work\troopcap node work/cocos_verify/cdp.mjs run work/troopcap/steps_cocos_deploy.mjs
export default async function ({ evaluate, send, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const sceneName = async () => await ev(`cc.director.getScene() ? cc.director.getScene().name : ''`);
  const hasSave = async () => (await ev(`(() => { const raw = cc.sys.localStorage.getItem('sanguo_campaign_v1'); return !!raw; })()`)) === true;
  const poll = async (fn, tries = 240, ms = 1000) => {
    for (let i = 0; i < tries; i += 1) {
      if (await fn()) return i + 1;
      await sleep(ms);
    }
    return 0;
  };
  const out = {};

  const FIND = `(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(scene);
    return comp;
  })()`;

  const probe = async () => JSON.parse(await ev(`(() => {
    const comp = ${FIND};
    if (!comp) return JSON.stringify({ scene: cc.director.getScene().name, err: 'no DeployRoot' });
    const gen = comp.generals[comp.selectedGen] || null;
    return JSON.stringify({
      scene: cc.director.getScene().name,
      loaded: comp.loaded,
      soldiers: comp.soldiers, cavalry: comp.cavalry,
      soldierCap: comp.soldierCap, cavalryCap: comp.cavalryCap,
      selectedGen: comp.selectedGen,
      gen: gen && { name: gen.NAME, level: gen.level },
      queue: (comp.queue || []).map((q) => ({ name: q.general, troops: q.troops })),
      labelTarget: comp.labelTarget ? comp.labelTarget.string : null,
      labelSoldier: comp.labelSoldier ? comp.labelSoldier.string : null,
      labelHint: comp.labelHint ? comp.labelHint.string : null,
      sliders: (comp.buttons || []).filter((b) => b.kind === 'slide').map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })),
    });
  })()`));

  out.start = await probe();
  out.saveAtStart = await hasSave();
  out.touch = await ev(`String(navigator.maxTouchPoints) + '/' + String('ontouchstart' in window)`);
  log('start = ' + JSON.stringify(out.start) + ' save=' + out.saveAtStart + ' touch=' + out.touch);

  // Deploy 沒存檔 → loaded=false（主將池空）。先讓 Campaign 把存檔落盤。
  if ((await probe()).loaded !== true) {
    if (!out.saveAtStart) {
      await ev(`(() => { try { cc.director.loadScene('Campaign'); } catch (e) {} return 'go'; })()`);
      out.campaignTries = await poll(async () => await hasSave(), 300, 1000);
      log('campaign save after ' + out.campaignTries + 's scene=' + (await sceneName()));
    }
    await ev(`(() => { try { cc.director.loadScene('Deploy'); } catch (e) {} return 'go'; })()`);
    out.deployTries = await poll(async () => {
      const p = await probe();
      return p.loaded === true;
    }, 240, 1000);
    log('deploy loaded after ' + out.deployTries + 's scene=' + (await sceneName()));
  }
  out.loaded = await probe();
  log('loaded = ' + JSON.stringify(out.loaded));

  // 等級：與 web `deploy.html?...&lv=26` 同一個旋鈕（DeployRoot.levelOf 第一優先讀 gen.level）
  out.level = JSON.parse(await ev(`(() => {
    const comp = ${FIND};
    if (!comp) return JSON.stringify({ err: 'no comp' });
    const gen = comp.generals[comp.selectedGen];
    if (!gen) return JSON.stringify({ err: 'no gen', pool: (comp.generals || []).length });
    const before = { name: gen.NAME, level: gen.level };
    gen.level = 26;
    comp.applyGeneral();
    comp.refresh();
    return JSON.stringify({ before, after: { name: gen.NAME, level: gen.level }, caps: { inf: comp.soldierCap, cav: comp.cavalryCap }, soldiers: comp.soldiers, cavalry: comp.cavalry });
  })()`));
  log('level = ' + JSON.stringify(out.level));
  await sleep(700);

  const VIEW = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height });
  })()`));
  // 設計座標（左上原點）→ CSS 像素（同為左上原點）：y 不需要翻轉，
  // 只有 Cocos 的 getUILocation() 才是「左下原點」；toDesign() 內部已做 1334−uiY。
  const toPage = (dx, dy) => [Math.round(VIEW.vx + dx * VIEW.s), Math.round(VIEW.vy + dy * VIEW.sy)];
  const touch = async (dx, dy) => {
    const [px, py] = toPage(dx, dy);
    const pt = [{ x: px, y: py, id: 0, radiusX: 1, radiusY: 1, force: 1 }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await sleep(120);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(600);
    return [px, py];
  };

  out.afterLevel = await probe();
  const cavHit = (out.afterLevel.sliders || [])[1];
  if (cavHit) {
    out.touchCav = await touch(cavHit.x + cavHit.w - 12, cavHit.y + cavHit.h / 2);
    out.afterCavTouch = await probe();
    log('afterCavTouch = ' + JSON.stringify(out.afterCavTouch));
  }
  const infHit = (out.afterLevel.sliders || [])[0];
  if (infHit) {
    // 步兵軌道點 100% 處 → 步 100，湊成「100 步 + 30 騎 = 130」
    out.touchInf = await touch(infHit.x + infHit.w - 12, infHit.y + infHit.h / 2);
  }
  out.final = await probe();
  log('final = ' + JSON.stringify(out.final));

  await sleep(500);
  out.shot = await shot('cocos_deploy_twocol');
  return out;
}
