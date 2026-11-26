// web-mobile 预览：用「正确 viewport 换算」的真实鼠标点击，验证城池一覽按钮是否可用
// 上一轮假阴性原因：cc.game.isPaused()=true（窗口失焦）+ 我按底朝上换算 y。这轮先 bringToFront+resume。
const DESIGN_W = 750;
const DESIGN_H = 1334;

export default async function (ctx) {
  const { send, evaluate, click, sleep, shot, log } = ctx;

  const evalT = async (expr, ms = 8000) => {
    const r = await Promise.race([
      evaluate(expr, { returnByValue: true }),
      sleep(ms).then(() => ({ __timeout: true })),
    ]);
    return r;
  };
  const J = (s) => {
    try { return JSON.parse(s); } catch { return { __raw: String(s) }; }
  };

  const out = { steps: [] };

  // 0) 前台 + 恢复游戏（窗口失焦时 Cocos 会 isPaused=true，会导致点击假阴性）
  try { await send('Page.bringToFront', {}); } catch (e) { out.frontErr = String(e && e.message || e); }
  await sleep(400);
  out.resume = await evalT(`(() => { try { cc.game.resume(); cc.director.resume(); } catch (e) {} return JSON.stringify({ paused: cc.game.isPaused(), frames: cc.director.getTotalFrames(), hidden: document.hidden, vis: document.visibilityState }); })()`, 6000);

  // 1) 确保 Campaign 场景
  const sc = J(await evalT('JSON.stringify({ scene: cc.director.getScene().name })', 5000));
  if (sc.scene !== 'Campaign') {
    await evalT("cc.director.loadScene('Campaign')", 8000);
    await sleep(3500);
  }
  out.scene = J(await evalT(`JSON.stringify({ scene: cc.director.getScene().name, frames: cc.director.getTotalFrames() })`, 5000));

  // 2) 几何换算参数
  const geo = J(await evalT(`(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const vp = cc.view.getViewportRect();
    return JSON.stringify({ cw: c.width, ch: c.height, left: r.left, top: r.top, cssW: r.width, cssH: r.height, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height }, paused: cc.game.isPaused(), frames: cc.director.getTotalFrames() });
  })()`, 8000));
  out.geo = geo;
  const toClient = (dx, dy) => {
    const px = geo.vp.x + (dx / DESIGN_W) * geo.vp.w;
    const py = geo.vp.y + ((DESIGN_H - dy) / DESIGN_H) * geo.vp.h; // py 以画布左下角为原点
    const cx = geo.left + px * (geo.cssW / geo.cw);
    const cy = geo.top + (geo.ch - py) * (geo.cssH / geo.ch);
    return [cx, cy];
  };

  const panelState = async (tag) => {
    const r = await evalT(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const n = c.getChildByName('CityListPanel');
      const p = n && n.getComponent('CityListPanel');
      if (!p) return JSON.stringify({ err: 'no panel' });
      const d = p.debug();
      return JSON.stringify({ tag: '${tag}', isOpen: p.isOpen, active: n.active, filter: d.filter, page: d.page, selected: d.selected, row0: d.rowTexts && d.rowTexts[0] && d.rowTexts[0][0], frames: cc.director.getTotalFrames() });
    })()`, 6000);
    return J(r);
  };

  // 3) 打开面板
  await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); window.__comp = comp; comp.openCityList(); return 'ok'; })()`, 10000);
  await sleep(800);
  out.opened = await panelState('opened');

  // 4) 真实点击「關閉」中心设计 (661,60)
  const [cxClose, cyClose] = toClient(661, 60);
  out.closeClick = { cx: cxClose, cy: cyClose };
  await click(cxClose, cyClose);
  await sleep(700);
  out.afterClose = await panelState('afterClose');
  out.shotAfterClose = await shot('34_web2_after_close_click.png');

  // 5) 再开一次，测「敵方」筛选 / 第 2 页 / 选行
  await evalT(`(() => { window.__comp.openCityList(); return 'ok'; })()`, 10000);
  await sleep(700);

  const [cxEnemy, cyEnemy] = toClient(448, 158);
  out.enemyClick = { cx: cxEnemy, cy: cyEnemy };
  await click(cxEnemy, cyEnemy);
  await sleep(500);
  out.afterEnemy = await panelState('afterEnemy');
  out.shotAfterEnemy = await shot('35_web2_after_enemy_click.png');

  const [cxNext, cyNext] = toClient(677, 1142);
  out.nextClick = { cx: cxNext, cy: cyNext };
  await click(cxNext, cyNext);
  await sleep(500);
  out.afterNext = await panelState('afterNext');

  const [cxRow, cyRow] = toClient(375, 600);
  out.rowClick = { cx: cxRow, cy: cyRow };
  await click(cxRow, cyRow);
  await sleep(600);
  out.afterRow = await panelState('afterRow');
  out.shotAfterRow = await shot('36_web2_after_row_click.png');

  return out;
}
