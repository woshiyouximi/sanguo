// 大地圖戰報 UI 運行時驗證（只在我的 9344 會話裡跑，別人的頁面不碰）：
// 1) 找到 CampaignRoot 元件（用 __classname__ 判定） 2) 灌 11 條跨月戰報
// 3) 讀標題/頁數/翻頁鈕 4) 真的用 CDP 點一下 ▶ 5) 還原
export default async ({ evaluate, shot, click, sleep, log }) => {
  const boot = await evaluate(`new Promise((res) => {
    let n = 0;
    const pick = () => {
      if (!(window.cc && cc.director && cc.director.getScene())) return null;
      const cv = cc.director.getScene().getChildByName('Canvas');
      return cv ? cv.components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot') : null;
    };
    const t = setInterval(() => {
      n++;
      const comp = pick();
      if (comp || n > 80) { clearInterval(t); res(JSON.stringify({ ok: !!comp, tries: n, cls: comp ? comp.__classname__ : null, scene: window.cc && cc.director.getScene() ? cc.director.getScene().name : null })); }
    }, 250);
  })`);
  log('boot:', boot);

  // 頁面停在標題頁（Boot 場景）時，直接叫 BootRoot 進大地圖（等同按「進入」）
  let entered = null;
  if (!JSON.parse(boot).ok) {
    entered = await evaluate(`(() => {
      const scene = window.cc && cc.director.getScene();
      if (!scene) return 'NO_SCENE';
      const cv = scene.getChildByName('Canvas');
      const b = cv && cv.components.find((x) => x && x.__classname__ === 'BootRoot');
      if (!b) return 'NO_BOOTROOT:' + (cv ? cv.components.map((x) => (x && x.__classname__) || 'x').join(',') : 'no-canvas');
      b.enterCampaign();
      return 'ENTERED:' + scene.name;
    })()`);
    log('enterCampaign:', entered);
    const waitCampaign = await evaluate(`new Promise((res) => {
      let n = 0;
      const t = setInterval(() => {
        n++;
        let comp = null;
        try {
          const scene = window.cc && cc.director.getScene();
          const cv = scene && scene.getChildByName('Canvas');
          if (cv) comp = cv.components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
        } catch (e) {}
        if (comp || n > 120) { clearInterval(t); res(JSON.stringify({ ok: !!comp, tries: n, scene: window.cc && cc.director.getScene() ? cc.director.getScene().name : null })); }
      }, 250);
    })`);
    log('wait CampaignRoot:', waitCampaign);
  }

  const r1 = await evaluate(`(() => {
    const cv = cc.director.getScene().getChildByName('Canvas');
    const c = cv.components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    if (!c) return 'NO_COMP';
    if (!window.__bk) window.__bk = { log: null, page: 0, ls: null, month: c.save ? c.save.month : 0 };
    window.__bk.log = c.battleLog; window.__bk.page = c.logPage; window.__bk.ls = localStorage.getItem('sanguo_battlelog_v1');
    const lines = [];
    for (let i = 0; i < 6; i++) lines.push({ t: '3年3月', s: '第' + (i + 1) + '條：曹操 出兵來犯 8000', k: 'atk' });
    for (let i = 0; i < 5; i++) lines.push({ t: '3年4月', s: '四月戰報 ' + (i + 1) + '：我軍 攻 襄陽 易手', k: 'win' });
    c.battleLog = [];
    c.pushBattleLog(lines);
    c.refresh();
    const texts = c.logTextLabels.map((l) => l.string);
    return JSON.stringify({
      saveMonth: c.save ? c.save.month : null,
      buffered: c.battleLog.length,
      title: c.logTitle.string,
      pages: c.logPages, page: c.logPage,
      prevActive: !!(c.logPrev && c.logPrev.node.active), nextActive: !!(c.logNext && c.logNext.node.active),
      prevColor: c.logPrev ? c.logPrev.color.toHEX('#rrggbb') : null,
      nextColor: c.logNext ? c.logNext.color.toHEX('#rrggbb') : null,
      texts,
      consoleTitles: c.logTitle.node.parent ? 'n/a' : 'n/a',
    });
  })()`);
  log('after push 11:', r1);

  const page2 = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    c.turnBattleLogPage(1);
    return JSON.stringify({ title: c.logTitle.string, page: c.logPage, texts: c.logTextLabels.map((l) => l.string), prevActive: c.logPrev.node.active, nextActive: c.logNext.node.active });
  })()`);
  log('turn +1:', page2);

  const last = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    const before = c.logPage;
    c.turnBattleLogPage(1);
    return JSON.stringify({ before, after: c.logPage, title: c.logTitle.string });
  })()`);
  log('turn +1 at last page:', last);

  const back = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    c.turnBattleLogPage(-1);
    return JSON.stringify({ page: c.logPage, title: c.logTitle.string });
  })()`);
  log('turn -1:', back);

  // 量一下 ▶ 的頁面座標（設計座標 → CSS px），再用真滑鼠點它
  const geo = await evaluate(`(() => {
    const cvs = document.querySelector('canvas');
    const r = cvs.getBoundingClientRect();
    const vp = cc.view.getViewportRect();
    const sx = cc.view.getScaleX();
    const nx = (682 + 22) * sx + vp.x + r.left;
    const ny = (846 + 11) * sx + vp.y + r.top;
    return JSON.stringify({ rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), left: +r.left.toFixed(1), top: +r.top.toFixed(1) }, vp: { x: +vp.x.toFixed(1), y: +vp.y.toFixed(1), w: +vp.width.toFixed(1), h: +vp.height.toFixed(1) }, scale: +sx.toFixed(4), vis: cc.view.getVisibleSize(), clickAt: { x: +nx.toFixed(1), y: +ny.toFixed(1) } });
  })()`);
  log('geo:', geo);
  let clicked = null;
  try {
    const g = JSON.parse(geo);
    await click(g.clickAt.x, g.clickAt.y);
    await sleep(250);
    clicked = await evaluate(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
      return JSON.stringify({ page: c.logPage, title: c.logTitle.string });
    })()`);
    log('after real click on ▶:', clicked);
  } catch (e) {
    log('click failed:', String(e && e.message ? e.message : e));
  }

  const shotInfo = await shot('ui_battlelog_page1');
  log('shot:', JSON.stringify(shotInfo));

  const restored = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    c.battleLog = window.__bk.log; c.logPage = window.__bk.page;
    if (window.__bk.ls === null) localStorage.removeItem('sanguo_battlelog_v1'); else localStorage.setItem('sanguo_battlelog_v1', window.__bk.ls);
    c.refresh();
    return JSON.stringify({ len: c.battleLog.length, page: c.logPage, title: c.logTitle.string });
  })()`);
  log('restored:', restored);
  return { boot, r1, page2, last, back, geo, clicked, shotInfo, restored };
};
