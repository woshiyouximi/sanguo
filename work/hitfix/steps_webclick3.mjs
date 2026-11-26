// 用真实鼠标点击验证 web 端：地图按钮能否点开面板（校验坐标换算是否对），再检面板内部按钮
const DESIGN_W = 750;
const DESIGN_H = 1334;

export default async function (ctx) {
  const { send, evaluate, click, sleep, shot } = ctx;
  const evalT = async (expr, ms = 8000) => {
    const r = await Promise.race([
      evaluate(expr, { returnByValue: true }),
      sleep(ms).then(() => ({ __timeout: true })),
    ]);
    return r;
  };
  const J = (s) => { try { return JSON.parse(s); } catch { return { __raw: String(s) }; } };
  const out = {};

  try { await send('Page.bringToFront', {}); } catch (e) { out.frontErr = String(e && e.message || e); }
  await sleep(300);
  out.resume = J(await evalT(`(() => { try { cc.game.resume(); cc.director.resume(); } catch (e) {} return JSON.stringify({ paused: cc.game.isPaused(), frames: cc.director.getTotalFrames(), focus: document.hasFocus(), active: document.activeElement && document.activeElement.tagName }); })()`, 6000));

  const sc = J(await evalT('JSON.stringify({ scene: cc.director.getScene().name })', 5000));
  if (sc.scene !== 'Campaign') {
    await evalT("cc.director.loadScene('Campaign')", 8000);
    await sleep(3500);
  }
  const geo = J(await evalT(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ cw: c.width, ch: c.height, left: r.left, top: r.top, cssW: r.width, cssH: r.height, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height } });
  })()`, 6000));
  out.geo = geo;
  const toClient = (dx, dy) => {
    const px = geo.vp.x + (dx / DESIGN_W) * geo.vp.w;
    const py = geo.vp.y + ((DESIGN_H - dy) / DESIGN_H) * geo.vp.h;
    return [geo.left + px * (geo.cssW / geo.cw), geo.top + (geo.ch - py) * (geo.cssH / geo.ch)];
  };
  const children = async () => J(await evalT(`JSON.stringify(cc.director.getScene().getChildByName('Canvas').children.filter((n) => /Panel|Scrim|Menu/.test(n.name)).map((n) => n.name + ':' + (n.active ? 1 : 0)))`, 6000));
  const clickAt = async (dx, dy) => { const [x, y] = toClient(dx, dy); await click(x, y); await sleep(600); return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]; };

  out.panelsBefore = await children();

  // 1) 地图页「勢力」按钮（设计 384..544 x 14..66 → 中心 464,40）
  out.forcesClickPos = await clickAt(464, 40);
  out.afterForcesClick = await children();

  // 清理：直接 destroy 掉 scrim/面板，恢复可测状态
  await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); ['Scrim_forces', 'ForcesPanel', 'ForcesPanelNode'].forEach((nm) => { const n = c.getChildByName(nm); if (n) n.destroy(); }); return 'cleaned'; })()`, 6000);
  await sleep(300);
  out.panelsAfterClean1 = await children();

  // 2) 地图页「列 表」按钮（设计 596..732 x 776..812 → 中心 664,794）
  out.listClickPos = await clickAt(664, 794);
  out.afterListClick = await children();

  // 3) 面板「關閉」（设计 598..724 x 34..86 → 中心 661,60）
  out.closeClickPos = await clickAt(661, 60);
  out.afterCloseClick = await children();
  out.shotAfterClose = await shot('51_web_listclick_after_close.png');

  // 4) 若面板还在：点「敵方」筛选（filter:enemy 中心 448,158）
  out.enemyClickPos = await clickAt(448, 158);
  out.enemyState = J(await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const n = c.getChildByName('CityListPanel'); const p = n && n.getComponent('CityListPanel'); return JSON.stringify({ exists: !!n, isOpen: p ? p.isOpen : null, filter: p ? p.debug().filter : null }); })()`, 6000));

  return out;
}
