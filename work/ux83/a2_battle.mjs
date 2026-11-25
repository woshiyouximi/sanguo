// 改后取证（2/3）：index.html 战斗页 —— ?a= 主将、空城没有「守將」、结算提示条自动消失
import { bootSeeded, sleep } from './drive.mjs';
const c = await bootSeeded(750, 1334);
const out = { steps: {}, errs: [] };
const q = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null)
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const B = 'http://127.0.0.1:5173/web/index.html?';
const dump = () => c.eval(`(()=>{const st=window.__sanguo&&window.__sanguo.state;
  const w=st&&st.world; const pg=(s)=>{const e=document.querySelector(s);return e?e.getBoundingClientRect().height:null;};
  return {mode:st?st.mode:null,
    aGeneral:w&&w.sides.A.general?w.sides.A.general.name:null,
    bGeneral:w&&w.sides.B.general?w.sides.B.general.name:null,
    labelA:st?st.labels.a:null, labelB:st?st.labels.b:null,
    stat:(document.querySelector('#stat')||{}).textContent||null,
    msg:st?st.message:null,
    settlement:st&&st.settlement?{winner:st.settlement.winner,mode:st.settlement.modeName,
      captures:(st.settlement.post&&st.settlement.post.captures||[]).map(x=>x.name),
      recruited:(st.settlement.post&&st.settlement.post.captures||[]).filter(x=>x.recruited).map(x=>x.name),
      executed:(st.settlement.post&&st.settlement.post.executed||[]).map(x=>x.name),
      drops:(st.settlement.post&&st.settlement.post.drops||[]).map(x=>x.itemId)}:null,
    toast:(()=>{const t=document.querySelector('#notice-toast');return t?{text:t.textContent,opacity:t.style.opacity}:null;})()};})()`);

const base = { city: '易京', a: '夏侯惇', gen: '夏侯惇', troop: 10, form: 0, soldiers: 10, amorale: 60, blevel: 1, freeze: 1 };

// ---- 步骤 1：战前页（HUD 里的我方主将名 + 敌将名）
await c.goto(B + q({ ...base, bsoldiers: 6, sim: 1 }));
await sleep(2600);
out.steps.readyEmpty = await dump();
out.shotReady = await c.shot('after3a_battle_ready.png');

// ---- 步骤 2：有守将的城（北平）打一场「殲滅」，看战报里的守将名（对照组）
await c.goto(B + q({ ...base, city: '北平', a: '程遠志', gen: '程遠志', blevel: 1, sim: 1, end: 'wipe',
  bgen: '公孫瓚', bstr: 86, bint: 70, bmorale: 60, bloyal: 70 }));
await sleep(3000);
out.steps.settleDefended = await dump();
out.shotSettleDefended = await c.shot('after3b_settle_defended.png');

// ---- 步骤 3：空城（易京）殲滅 → 战报里不许出现「守將」，提示条 6s 自动消失
await c.goto(B + q({ ...base, sim: 1, end: 'wipe', bsoldiers: 6 }));
await sleep(3000);
out.steps.settleEmpty0 = await dump();
out.shotSettleEmpty = await c.shot('after3c_settle_empty_0s.png');
await sleep(6500);
out.steps.settleEmpty7 = await dump();
out.shotSettleEmpty7 = await c.shot('after3d_settle_empty_7s.png');

// ---- 步骤 4：写回存档用的名字（问题 2 的第三处：结算报告 / 疲劳士气日志）
out.steps.saved = await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
  return {tire:s.tire, morale:Object.keys(s.morale||{}).slice(-6), log:(s.log||[]).slice(-6).map(x=>x.text||x)};})()`);

out.errs = await c.errs(c.startErr);
await c.save('a2_battle', out);
console.log(JSON.stringify(out, null, 1));
c.close();
