// 檢查翻頁後「沒用到的行」是不是被藏起來（避免殘留上一頁的字）
export default async ({ evaluate, log }) => {
  const out = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    const bk = { log: c.battleLog, page: c.logPage, ls: localStorage.getItem('sanguo_battlelog_v1') };
    const lines = [];
    for (let i = 0; i < 6; i++) lines.push({ t: '3年3月', s: '第' + (i + 1) + '條', k: 'atk' });
    for (let i = 0; i < 5; i++) lines.push({ t: '3年4月', s: '四月 ' + (i + 1), k: 'win' });
    c.battleLog = []; c.pushBattleLog(lines); c.refresh();
    const snap = (tag) => ({
      tag, page: c.logPage, pages: c.logPages, title: c.logTitle.string,
      rows: c.logTextLabels.map((l, i) => ({ i, t: l.string, act: l.node.active, timeAct: c.logTimeLabels[i].node.active, col: l.color.toHEX('#rrggbb') })),
    });
    const p0 = snap('p0');
    c.turnBattleLogPage(1);
    const p1 = snap('p1');
    c.turnBattleLogPage(-1);
    const p0b = snap('p0-back');
    // 折疊態：標題只剩「共 N 條 ▸」、8 行全藏
    c.toggleBattleLog();
    const fold = { title: c.logTitle.string, actives: c.logTextLabels.map((l) => l.node.active), prevAct: c.logPrev.node.active, nextAct: c.logNext.node.active };
    c.toggleBattleLog();
    c.battleLog = bk.log; c.logPage = bk.page;
    if (bk.ls === null) localStorage.removeItem('sanguo_battlelog_v1'); else localStorage.setItem('sanguo_battlelog_v1', bk.ls);
    c.refresh();
    return JSON.stringify({ p0, p1, p0b, fold, restored: c.battleLog.length });
  })()`);
  log('rows:', typeof out === 'string' ? out : JSON.stringify(out));
  return out;
};
