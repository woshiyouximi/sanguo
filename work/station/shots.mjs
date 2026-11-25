// R95 驗收截圖（project/185 駐紮 / 任命軍師）：四張任務書指定的圖 + 兩張附加證據。
// 用法：MATCH=web/campaign.html OUTDIR=F:\sanguo\work\station node F:\sanguo\work\cocos_verify\cdpweb.mjs run F:\sanguo\work\station\shots.mjs
// 注意：marchdemo / probe / demo 都是調試鍵，沒帶 ?dev=1 會被 campaign.html:548-561 的
// DEV_QUERY_KEYS 白名單整批剔掉（頁面就沒有種子部隊、也不會掛 window.__station）。
export default async ({ send, shot, evaluate, sleep, log }) => {
  const BASE = 'http://127.0.0.1:5173/web/campaign.html';
  const out = { shots: {}, facts: {} };

  const nav = async (query, readyExpr, tag) => {
    await send('Page.navigate', { url: BASE + query });
    await sleep(500);
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const v = await evaluate(readyExpr);
      if (v === true) { ready = true; break; }
      await sleep(250);
    }
    await sleep(1500);   // canvas / 中文字體 / 版面
    if (!ready) log('WARN not ready:', tag, query);
    return ready;
  };
  const front = async () => { await send('Page.bringToFront'); await sleep(250); };
  const cmds = `[...document.querySelectorAll('#armyCmds [data-army-act]')]
      .map((b) => ({ act: b.dataset.armyAct, enabled: !b.disabled, hint: b.querySelector('small').textContent }))`;

  // ── 01 兵團指令：駐紮 / 任命軍師 兩項都可用（不再是灰字） ───────────────
  await nav('?dev=1&demo=1&marchdemo=mid&probe=station',
    `!!(window.__station && document.querySelector('#armySheet'))`, '01');
  const f1 = await evaluate(`(() => {
    const st = window.__station.state();
    const a = st.find((x) => x.side === 'A') || st[0];
    window.__station.select(a.id);
    return { army: a, title: document.querySelector('#armyTtl').textContent,
      sub: document.querySelector('#armySub').textContent,
      info: document.querySelector('#armyInfo').innerText, rows: ${cmds},
      sheetOpen: document.querySelector('#armySheet').hidden === false };
  })()`);
  await sleep(400); await front();
  out.shots['01_menu'] = await shot('01_menu.png');
  out.facts['01_menu'] = f1;

  // ── 02 駐紮：停在路上、進度凍結（再點一次解除） ──────────────────────
  await nav('?dev=1&demo=1&marchdemo=station&probe=station',
    `!!(window.__station && document.querySelector('#armySheet') && document.querySelector('#armySheet').hidden === false)`, '02');
  const before = await evaluate(`window.__station.state()`);
  const after = await evaluate(`window.__station.step(2)`);   // 只推 advanceArmies，不結算遭遇
  const f2 = await evaluate(`(() => ({
    sub: document.querySelector('#armySub').textContent,
    cmds: ${cmds},
    info: document.querySelector('#armyInfo').innerText,
  }))()`);
  f2.before = before; f2.after = after;
  f2.frozen = JSON.stringify(before) === JSON.stringify(after);
  await sleep(300); await front();
  out.shots['02_stationed'] = await shot('02_stationed.png');
  out.facts['02_stationed'] = f2;

  // ── 03 阻擋：敵軍推進到同一路段，停在接觸點（戰報 + notice） ─────────
  await nav('?dev=1&demo=1&marchdemo=block&probe=station',
    `!!(window.__station && document.querySelector('#notice'))`, '03');
  const f3a = await evaluate(`(() => ({
    state: window.__station.state(),
    standoff: window.__station.standoff(),
    notice: (document.querySelector('#notice') || {}).textContent || '',
    noticeShown: Boolean(document.querySelector('#notice') && document.querySelector('#notice').hidden === false),
    log: (document.querySelector('#logbox') || {}).innerText || '',
  }))()`);
  // 再推一個月：駐紮方不動、被擋的敵軍也不動（不越過接觸點）
  const f3b = await evaluate(`window.__station.step(1)`);
  const f3 = { first: f3a, afterStep: f3b };
  await sleep(200); await front();
  out.shots['03_blocked'] = await shot('03_blocked.png');
  out.facts['03_blocked'] = f3;

  // ── 04 任命軍師：浮層列出隨軍武將 → 點一張卡 → 選中結果 ─────────────
  await nav('?dev=1&demo=1&marchdemo=advisor&probe=station',
    `!!(window.__station && document.querySelector('#advisorSheet') && document.querySelector('#advisorSheet').hidden === false)`, '04');
  const picked = await evaluate(`(() => {
    const st = window.__station.state();
    const a = st.find((x) => x.side === 'A') || st[0];
    const rows = window.__station.advisorRows(a.id);
    const cards = [...document.querySelectorAll('#advisorList [data-advisor]')];
    const usable = cards.filter((el) => el.dataset.advisor && el.dataset.advisor !== a.general);
    const card = usable[0] || cards.find((el) => el.dataset.advisor) || null;
    const name = card ? card.dataset.advisor : '';
    const beforeCards = cards.map((el) => el.dataset.advisor);
    if (name) card.click();                       // 真的走頁面的點擊委派，不繞過 UI
    const now = window.__station.state().find((x) => x.id === a.id);
    const again = window.__station.advisorRows(a.id);
    return {
      army: a.id, rows, officerCount: (a.officers || []).length, clicked: name, beforeCards,
      advisor: now.advisor,
      pickedRow: again.find((r) => r.picked) || null,
      cardsAfter: [...document.querySelectorAll('#advisorList [data-advisor]')].map((el) => el.dataset.advisor),
      foot: (document.querySelector('#advisorFoot') || {}).innerText || '',
      sub: (document.querySelector('#advisorSub') || {}).textContent || '',
      ttl: (document.querySelector('#advisorTtl') || {}).textContent || '',
      sheetOpen: document.querySelector('#advisorSheet').hidden === false,
    };
  })()`);
  out.facts['01_rows'] = f1.rows;
  out.facts['04_advisor'] = picked;
  await sleep(400); await front();
  out.shots['04_advisor'] = await shot('04_advisor.png');

  // ── 04b（附加證據）：兵團裡只有主將一人 → 「任命軍師」灰 + 灰字講人少 ──
  await nav('?dev=1&demo=1&marchdemo=advisor1&probe=station',
    `!!(window.__station && document.querySelector('#armySheet') && document.querySelector('#armySheet').hidden === false)`, '04b');
  const f4 = await evaluate(`(() => {
    const st = window.__station.state();
    const a = st.find((x) => x.side === 'A') || st[0];
    return { army: a, officers: a.officers, rows: ${cmds},
      info: document.querySelector('#armyInfo').innerText, sub: document.querySelector('#armySub').textContent };
  })()`);
  out.facts['05_advisor_grey'] = f4;
  await sleep(300); await front();
  out.shots['05_advisor_grey'] = await shot('05_advisor_grey.png');

  // ── 04c（附加證據）：回到兵團指令浮層，軍師那一行顯示剛任命的人 ───────
  await nav('?dev=1&demo=1&marchdemo=advisor&probe=station',
    `!!(window.__station && document.querySelector('#advisorSheet') && document.querySelector('#advisorSheet').hidden === false)`, '04c');
  const f5 = await evaluate(`(() => {
    const st = window.__station.state();
    const a = st.find((x) => x.side === 'A') || st[0];
    const rows = window.__station.advisorRows(a.id);
    const pick = rows.find((r) => !r.isLeader) || rows[0];
    const ok = pick ? window.__station.setAdvisor(a.id, pick.name) : false;
    window.__station.select(a.id);        // 從軍師浮層切回兵團指令浮層
    const now = window.__station.state().find((x) => x.id === a.id);
    return { ok, pick: pick ? pick.name : '', advisor: now.advisor,
      info: document.querySelector('#armyInfo').innerText, rows: ${cmds} };
  })()`);
  out.facts['06_advisor_in_sheet'] = f5;
  await sleep(400); await front();
  out.shots['06_advisor_in_sheet'] = await shot('06_advisor_in_sheet.png');

  // 附加：軍師有沒有真的進開戰 URL（?wise= / ?advisor=）—— 在有敵軍的 block 場景算一次
  await nav('?dev=1&demo=1&marchdemo=block&probe=station', `!!window.__station`, 'enc');
  out.facts['07_encounter_url'] = await evaluate(`(() => {
    const st = window.__station.state();
    const a = st.find((x) => x.side === 'A');
    const b = st.find((x) => x.side === 'B');
    const rows = window.__station.advisorRows(a.id);
    const pick = rows.find((r) => r.seq > 0 && !r.isLeader) || rows.find((r) => r.seq > 0) || rows[0];
    const ok = window.__station.setAdvisor(a.id, pick.name);
    const now = window.__station.state().find((x) => x.id === a.id);
    const url = window.__station.encounterUrl(a.id, b.id);
    const q = new URL(url, location.href).searchParams;
    return { army: a.id, foe: b.id, picked: pick.name, pickedSeq: pick.seq, ok,
      advisor: now.advisor, url,
      wise: q.get('wise'), advisorParam: q.get('advisor'),
      soldiers: q.get('soldiers'), bsoldiers: q.get('bsoldiers') };
  })()`);

  return out;
};
