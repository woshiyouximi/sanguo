// R86 三處斷鏈的瀏覽器證據（CDP steps 模組）：
//   $env:MATCH='campaign'; $env:OUTDIR='F:\sanguo\work\webfix86'
//   node work\cocos_verify\cdpweb.mjs run work\webfix86\steps_r86.mjs
//
// 前置：頁面必須已經有一個能開局的存檔。本腳本自己解決 —— 先清掉 localStorage 的三個鍵，
// 再用 `?demo=1`（campaign.html 既有的示範槽鋪路參數）鋪 10 個槽，槽 1 就是可玩的存檔
// （君主 = 劇本第一座城的 KING），不必點 UI。
//
// 產出：
//   · r86_s22_equip_before.png / r86_s22_equip_after.png —— S2-2 裝備進存檔 → 大地圖武力/智力 +30/+20
//   · r86_s11_arrive_lost.png —— S1-1 敵軍抵達但城已失守：不跳戰鬥、戰報多一行「佔 領…不進戰鬥」
//   · r86_s24_migrate_notice.png —— S2-4 v2 老檔載入：立刻寫回 v3 + 只提示一次
//   · 回傳值（由 run 印成 result JSON）就是 work\webfix86\expo.json 的內容。

import fs from 'node:fs';
import path from 'node:path';

export default async ({ send, shot, evaluate, sleep, log, OUTDIR }) => {
  const BASE = 'http://127.0.0.1:5173/web/campaign.html';
  const out = { url: BASE, shots: [], notes: [] };

  const go = async (url, ms = 2600) => {
    await send('Page.navigate', { url });
    await sleep(ms);
    for (let i = 0; i < 40; i++) {
      const ok = await evaluate(`!!document.querySelector('#logrows') && !!document.querySelector('#kingName')`);
      if (ok) break;
      await sleep(150);
    }
  };
  const text = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText : null; })()`);
  const probeOf = async () => {
    const v = await evaluate(`(() => {
      const el = document.querySelector('#marchdbg');
      if (!el || el.hidden) return { __missing: true, hidden: !!(el && el.hidden) };
      const raw = String(el.textContent || '');
      try { return JSON.parse(raw); } catch (e) { return { __parseError: String(e), raw: raw.slice(0, 900) }; }
    })()`);
    return v;
  };
  const record = async (name) => {
    // 先把 ?probe=1 的 JSON 面板藏起來再拍 —— 它會蓋住要當證據的卡片/提示條
    // （數值都已經在 steps 裡讀過了，收進 expo.json）。
    await evaluate(`(() => { const el = document.querySelector('#marchdbg'); if (el) el.hidden = true; return true; })()`);
    await sleep(120);
    const r = await shot(name);
    out.shots.push({ name, path: r.path, bytes: r.bytes });
    log('shot', name, r.bytes, 'bytes');
    return r;
  };
  const cardLine = async () => {
    const t = String((await text('#monBody')) || '');
    return t.split('\n').map((s) => s.trim()).filter((s) => /^武 /.test(s))[0] || t.slice(0, 200);
  };

  // ---------------------------------------------------------------- 0) 乾淨起點 → 鋪示範存檔
  await go(BASE, 2600);
  await evaluate(`localStorage.removeItem('sanguo_items_v1'); localStorage.removeItem('sanguo_saves_v1'); localStorage.removeItem('sanguo_campaign_v1'); 1`);
  await go(BASE + '?dev=1&demo=1&probe=1', 3400);
  const seedProbe = await probeOf();
  out.demoSeed = {
    monarch: seedProbe?.saves?.monarch ?? null,
    hero: seedProbe?.saves?.equip?.who ?? null,
    slotsWithSave: seedProbe?.saves?.filled ?? null,
    slotV: seedProbe?.saves?.v ?? null,
    __keys: seedProbe && typeof seedProbe === 'object' ? Object.keys(seedProbe).slice(0, 8) : null,
  };
  const HERO = out.demoSeed.hero || out.demoSeed.monarch;
  if (!HERO) throw new Error('示範存檔沒拿到君主/武將名：' + JSON.stringify(out.demoSeed));

  // ---------------------------------------------------------------- A) S2-2 裝備（before）
  await go(BASE + '?dev=1&demo=1&panel=monarch&probe=1', 2800);
  const beforeProbe = await probeOf();
  out.before = {
    cardLine: await cardLine(),
    equip: beforeProbe?.saves?.equip || null,
    monarch: beforeProbe?.saves?.monarch || '',
    marchDirect: beforeProbe?.march_direct || '',
    defend: beforeProbe?.defend || '',
  };
  await record('r86_s22_equip_before.png');

  // 寫 items.html 的那份存檔（形狀一致：{equip:{將名:{槽:Sequence}}, bag:[Sequence…]}）
  // 45 方天畫戟 +30 武力 / 52 孫子兵法 +20 智力 / 73 布匹 +4 忠誠（三件都在 city_model 的 DEFAULT_BAG 裡）
  await evaluate(`(() => {
    const data = { equip: { ${JSON.stringify(HERO)}: { weapon: 45, book: 52, amulet: 73 } }, bag: [45, 52, 73, 14, 56] };
    localStorage.setItem('sanguo_items_v1', JSON.stringify(data));
    return localStorage.getItem('sanguo_items_v1');
  })()`);

  // ---------------------------------------------------------------- A) S2-2 裝備（after）
  await go(BASE + '?dev=1&demo=1&panel=monarch&probe=1', 2800);
  const afterProbe = await probeOf();
  out.after = {
    cardLine: await cardLine(),
    equip: afterProbe?.saves?.equip || null,
    marchDirect: afterProbe?.march_direct || '',
    defend: afterProbe?.defend || '',
  };
  await record('r86_s22_equip_after.png');
  out.delta = {
    strBefore: out.before.equip?.stats?.str ?? null,
    strAfter: out.after.equip?.stats?.str ?? null,
    intBefore: out.before.equip?.stats?.int ?? null,
    intAfter: out.after.equip?.stats?.int ?? null,
    savedEquipNamesBefore: out.before.equip?.savedNames ?? null,
    savedEquipNamesAfter: out.after.equip?.savedNames ?? null,
    slots: out.after.equip?.slots ?? null,
    marchDirectHasAstr: /astr=\d+/.test(String(out.after.marchDirect || '')),
    marchDirectAstr: (String(out.after.marchDirect || '').match(/astr=(\d+)/) || [])[1] || null,
    marchDirectAint: (String(out.after.marchDirect || '').match(/aint=(\d+)/) || [])[1] || null,
  };

  // ---------------------------------------------------------------- B) S1-1 抵達但城已失守
  await go(BASE + '?dev=1&probe=1&marchdemo=lost', 3000);
  const s11probe = await probeOf();
  const logRows = String((await text('#logrows')) || '');
  out.s11 = {
    url: await evaluate('location.href'),
    logText: logRows,
    logLines: logRows.split('\n').map((s) => s.trim()).filter(Boolean),
    arrivals: s11probe?.saves?.arrivals || null,
    armies: s11probe?.saves?.armies ?? null,
    ownedCount: s11probe?.saves?.slotParts?.ownedCount ?? null,
    stillOnCampaign: /campaign\.html/.test(String(await evaluate('location.href'))),
    enteredBattle: /index\.html\?/.test(String(await evaluate('location.href'))),
    saveLog: await evaluate(`(() => { try { const s = JSON.parse(localStorage.getItem('sanguo_campaign_v1') || '{}'); return (s.log || []).slice(-3).map((x) => x.s); } catch (e) { return 'err:' + e; } })()`),
  };
  await record('r86_s11_arrive_lost.png');

  // ---------------------------------------------------------------- C) S2-4 遷移：寫回 + 只提示一次
  const downgraded = await evaluate(`(() => {
    const KEY = 'sanguo_saves_v1';
    const raw = localStorage.getItem(KEY);
    if (!raw) return 'no-store';
    const st = JSON.parse(raw);
    const idx = (st.slots || []).findIndex((e) => e && e.snapshot);
    if (idx < 0) return 'no-slot';
    const s = st.slots[idx].snapshot;
    s.v = 2;
    for (const k of ['year', 'yearFlag', 'ledger', 'generalStatus', 'weapon', 'horse', 'thing']) delete s[k];
    localStorage.setItem(KEY, JSON.stringify(st));
    return 'downgraded:' + (idx + 1);
  })()`);
  await go(BASE + '?dev=1&probe=1', 3000);
  const mig1 = await probeOf();
  out.migrate = {
    downgraded,
    bootUpgrades1: mig1?.saves?.bootUpgrades ?? null,
    notice1: await text('#notice'),
    noticeVisible1: await evaluate(`(() => { const el = document.querySelector('#notice'); return !!(el && !el.hidden); })()`),
    diskSnapshotV1: await evaluate(`(() => { try { const st = JSON.parse(localStorage.getItem('sanguo_saves_v1')); const e = (st.slots || []).find((x) => x && x.snapshot); return e ? e.snapshot.v : null; } catch (e) { return 'err:' + e; } })()`),
    hasUpgradedKeyOnDisk: await evaluate(`(() => { try { return Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem('sanguo_saves_v1')), 'upgraded'); } catch (e) { return 'err'; } })()`),
  };
  await record('r86_s24_migrate_notice.png');
  await go(BASE + '?dev=1&probe=1', 3000);
  const mig2 = await probeOf();
  out.migrate.bootUpgrades2 = mig2?.saves?.bootUpgrades ?? null;
  out.migrate.notice2Visible = await evaluate(`(() => { const el = document.querySelector('#notice'); return !!(el && !el.hidden); })()`);
  out.migrate.diskSnapshotV2 = await evaluate(`(() => { try { const st = JSON.parse(localStorage.getItem('sanguo_saves_v1')); const e = (st.slots || []).find((x) => x && x.snapshot); return e ? e.snapshot.v : null; } catch (e) { return 'err:' + e; } })()`);

  // 收尾：把「現在磁碟上的快照版本 / 裝備欄」一起帶回去給 expo.json
  out.disk = {
    snapshotV: out.migrate.diskSnapshotV2,
    equipNames: await evaluate(`(() => { try { const st = JSON.parse(localStorage.getItem('sanguo_saves_v1')); const e = (st.slots || []).find((x) => x && x.snapshot); const s = e && e.snapshot || {}; return { equip: s.equip || null, weapon: s.weapon || null, thing: s.thing || null }; } catch (e) { return 'err:' + e; } })()`),
  };

  // 驗收要的「expo.json 裡的等價狀態值」：這份 JSON 就是。倉庫裡原本沒有 expo.json，
  // 所以由這支 steps 自己導出（見報告的 [推測] 說明）。
  const expoPath = path.join(OUTDIR, 'expo.json');
  fs.writeFileSync(expoPath, JSON.stringify(out, null, 2), 'utf8');
  out.expoPath = expoPath;
  log('OUTDIR', OUTDIR, 'expo', expoPath);
  return out;
};
