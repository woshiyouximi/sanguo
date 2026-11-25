// 乾淨截圖：暫時收起 SurrenderPanel（它當時正好開著，蓋住戰報），灌本月+上月戰報，拍兩頁
export default async ({ evaluate, shot, sleep, log }) => {
  const prep = await evaluate(`(() => {
    const cv = cc.director.getScene().getChildByName('Canvas');
    const c = cv.components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    const sp = cv.getChildByName('SurrenderPanel');
    if (!window.__bk2) window.__bk2 = { log: c.battleLog, page: c.logPage, ls: localStorage.getItem('sanguo_battlelog_v1'), sp: sp ? sp.active : null };
    if (sp) sp.active = false;
    const month = c.save ? c.save.month : 1;
    const year = Math.floor((month - 1) / 12) + 1;
    const mm = ((month - 1) % 12) + 1;
    const cur = year + '年' + mm + '月';
    const prev = mm === 1 ? (year - 1) + '年12月' : year + '年' + (mm - 1) + '月';
    const lines = [];
    lines.push({ t: prev, s: '曹操 出兵 8000 來犯 陸口（守 5000）', k: 'atk' });
    lines.push({ t: prev, s: '陸口 守住了，折兵 1200', k: 'hold' });
    for (let i = 0; i < 4; i++) lines.push({ t: prev, s: '第 ' + (i + 1) + ' 條舊聞：周瑜 攻 江夏，易手', k: 'win' });
    for (let i = 0; i < 6; i++) lines.push({ t: cur, s: '本月第 ' + (i + 1) + ' 條：我軍 攻 襄陽 成功，易手', k: 'win' });
    c.battleLog = []; c.pushBattleLog(lines); c.refresh();
    if (sp) sp.active = false;
    return JSON.stringify({ month, cur, prev, buffered: c.battleLog.length, title: c.logTitle.string, pages: c.logPages, page: c.logPage, prevAct: c.logPrev.node.active, nextAct: c.logNext.node.active, prevCol: c.logPrev.color.toHEX('#rrggbb'), nextCol: c.logNext.color.toHEX('#rrggbb') });
  })()`);
  log('prep:', prep);
  await sleep(400);
  const s1 = await shot('ui_log_month_page1');
  log('shot1:', JSON.stringify(s1));
  const p2 = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    c.turnBattleLogPage(1);
    const sp = cc.director.getScene().getChildByName('Canvas').getChildByName('SurrenderPanel');
    if (sp) sp.active = false;
    return JSON.stringify({ title: c.logTitle.string, page: c.logPage, texts: c.logTextLabels.map((l) => l.string) });
  })()`);
  log('page2:', p2);
  await sleep(400);
  const s2 = await shot('ui_log_month_page2');
  log('shot2:', JSON.stringify(s2));
  const back = await evaluate(`(() => {
    const cv = cc.director.getScene().getChildByName('Canvas');
    const c = cv.components.find((x) => x && x.save && x.cities && x.__classname__ === 'CampaignRoot');
    const sp = cv.getChildByName('SurrenderPanel');
    c.battleLog = window.__bk2.log; c.logPage = window.__bk2.page;
    if (window.__bk2.ls === null) localStorage.removeItem('sanguo_battlelog_v1'); else localStorage.setItem('sanguo_battlelog_v1', window.__bk2.ls);
    if (sp && window.__bk2.sp !== null) sp.active = window.__bk2.sp;
    c.refresh();
    return JSON.stringify({ len: c.battleLog.length, title: c.logTitle.string });
  })()`);
  log('restored:', back);
  return { prep, page2: p2, shot1: s1, shot2: s2, restored: back };
};
