// 改前取证：大地图选敌城 → 出征 → 编成页 → 战斗 HUD；另加 campaign 通知 12s 不退的证据
import { bootSeeded, goto, sleep } from './drive.mjs';
import { BASE } from './cdp.mjs';

const c = await bootSeeded();
const out = {};
const T = (s) => `(()=>{const e=document.querySelector(${JSON.stringify(s)}); return e?((e.innerText||'').replace(/\\s+/g,' ').trim()):null;})()`;

// 1) 大地图 → 选 易京（89 演练里那座空城）
await goto(c, BASE + 'campaign.html', 1900);
out.monthLabel = await c.eval(T('#monthbar') + '');
out.hint0 = await c.eval(T('#hint'));
await c.shot('b0_map');
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="易京"]'); if(e) e.scrollIntoView({block:'center'});})()`);
await sleep(300);
await c.clickSel('.city[data-name="易京"]');
await sleep(500);
out.acts = await c.eval(`[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act||'',txt:(e.innerText||'').replace(/\\s+/g,' ').trim(),dis:!!e.disabled}))`);
out.selHint = await c.eval(T('#hint'));
await c.shot('b1_actions');

// 2) 出征 → deploy.html
await c.clickSel('#actions .btn[data-act="march"]');
await c.waitLoad(); await sleep(1600);
out.deployHref = await c.eval('location.href');
out.deploy = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?((e.innerText||'').replace(/\\s+/g,' ').trim()):null;};
 return {target:t('#target'), gar:t('#gar'), def:t('#def'), intel:t('#intel'), gname:t('#gname'), gosub:t('#gosub'), vs:t('#vs'), gennote:t('#gennote'), hint:t('#hint'),
   header:t('header .sub'), notice:(document.querySelector('#notice')||{}).innerText||null};})()`);
await c.shot('b2_deploy');

// 3) 出征 → 战斗页（HUD/结算里的主将名）
await c.clickSel('#go');
await c.waitLoad(); await sleep(1800);
out.battleHref = await c.eval('location.href');
out.battle = await c.eval(`(()=>{const s=window.__sanguo&&window.__sanguo.state; if(!s||!s.world) return {no:1};
 return {aGeneral:s.world.sides.A.general.name, aStr:s.world.sides.A.general.str, bGeneral:s.world.sides.B.general.name, bStr:s.world.sides.B.general.str, bInt:s.world.sides.B.general.int, labels:s.labels, stat:(document.querySelector('#stat')||{}).innerText||''};})()`);
await c.shot('b3_battle_ready');
// 结算：直接 endBattle 拿战报文本
out.settle = await c.eval(`(()=>{const S=window.__sanguo; if(!S||!S.state.world) return {no:1}; S.endBattle(); const st=S.state;
 return {modeName:st.settlement&&st.settlement.modeName, report:st.settlement&&st.settlement.report, message:st.message, aGeneral:st.world.sides.A.general.name, bGeneral:st.world.sides.B.general.name,
  post:st.settlement&&st.settlement.post?{captures:(st.settlement.post.captures||[]).map(x=>x.name+(x.recruited?'+':'-')), executed:(st.settlement.post.executed||[]).map(x=>x.name), drops:(st.settlement.post.drops||[]).map(x=>x.itemId)}:null};})()`);
await sleep(600);
await c.shot('b4_battle_settle');

// 4) 通知：campaign ?battle=1 的 12s 提示（89 报告原句）
await goto(c, BASE + 'campaign.html?battle=1', 1500);
out.notice0 = await c.eval(`(()=>{const e=document.getElementById('notice'); return e?{hidden:e.hidden,text:e.innerText}:null;})()`);
await c.shot('b5_notice_0s');
await sleep(11000);
out.notice11 = await c.eval(`(()=>{const e=document.getElementById('notice'); return e?{hidden:e.hidden,text:e.innerText}:null;})()`);
await c.shot('b6_notice_11s');
await sleep(2500);
out.notice13 = await c.eval(`(()=>{const e=document.getElementById('notice'); return e?{hidden:e.hidden,text:e.innerText}:null;})()`);

out.errs = await c.errs(c.startErr);
await c.save('b_before', out);
console.log(JSON.stringify(out, null, 1));
c.close();
