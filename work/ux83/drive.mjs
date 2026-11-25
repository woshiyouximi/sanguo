// 我的驱动：用 work/play4 的 CDP 封装 + 每次新文档前把「完整存档」写进 localStorage。
// 只写我自己的档案 .edgeprof_ux83（不动 lead 的 .edgeprof_lead）。
//
// 夹具说明（要在报告里注明）：
//   · 底本是 lead 档案槽 1 的完整快照（work/ux83/state/save_full.json，月份 4、6 城、36 键齐全）
//   · `armies` 被强制清空：原快照里 B 侧有 progress>=1 的部队，campaign 一读档就会
//     location.href=defendUrl(atk) 跳到守城战，没法停在大地图上点「出征」。
//   · `ts` 固定，且 legacy(工作副本) 与槽 1 快照用同一个 ts ⇒ legacyNewer=false，
//     不触发「進度已同步 / 戰鬥結果已寫回」通知，也不触发 isBattleDelta 的守城战。
import fs from 'node:fs';
import { CDP, sleep } from './cdp.mjs';

const SAVE_PATH = 'F:\\sanguo\\work\\ux83\\state\\save_full.json';
const RAW = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
const FULL = { ...RAW, armies: [] };
const TS = 1795593000000;            // 固定时间戳（夹具；避免每次跑都变成「更新的工作副本」）
const STORE = {
  v: 2,
  last: 1,                            // lastUsed(store)=0 ⇒ bootSlot=1
  slots: [
    {
      id: 1, name: '槽 1', slotName: '', time: '第1年4月', ts: TS, scenario: Number(FULL.scenario) || 1,
      scenarioName: '', month: Number(FULL.month) || 4, gold: Number(FULL.gold) || 0,
      ownedCount: (FULL.owned || []).length, wins: Number(FULL.wins) || 0, losses: Number(FULL.losses) || 0,
      monarch: String(FULL.monarch || FULL.king || ''), forceCount: 14, extinctCount: 0,
      cityCount: Object.keys(FULL.cities || {}).length, generalCount: 60,
      snapshot: FULL,
    },
    null, null, null, null, null, null, null, null, null,
  ],
};
const SAVE_JSON = JSON.stringify(FULL);
const STORE_JSON = JSON.stringify(STORE);
const SEED = `try{ if(location.hostname==='127.0.0.1' && !sessionStorage.getItem('__ux83_seeded')){
  localStorage.setItem('sanguo_saves_v1', ${JSON.stringify(STORE_JSON)});
  localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(SAVE_JSON)});
  sessionStorage.setItem('__ux83_seeded','1');
} }catch(e){}`;

export async function bootSeeded(w = 750, h = 1334) {
  const c = await CDP.connect();
  await c.attach();
  await c.viewport(w, h);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED }, c.sid);
  await c.inject();
  await c.eval(`try{ localStorage.setItem('sanguo_saves_v1', ${JSON.stringify(STORE_JSON)});
    localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(SAVE_JSON)});
    sessionStorage.setItem('__ux83_seeded','1'); }catch(e){}`);
  c.startErr = await c.errCount();
  return c;
}

export async function goto(c, url, wait = 1200) {
  await c.goto(url);
  await sleep(wait);
}

export { sleep };
