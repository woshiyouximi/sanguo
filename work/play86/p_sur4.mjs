import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.goto(BASE + 'campaign.html'); await sleep(1500);
const probe = async (tag) => {
  await c.eval(`location.reload()`); await sleep(3000);
  log(tag, JSON.stringify(await c.eval(`(()=>{const q=(id)=>{const e=document.getElementById(id);return e?{hid:!!e.hidden,txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80)}:null;};const bs=document.getElementById('btnSave');const br=bs?bs.getBoundingClientRect():null;const at=br?document.elementFromPoint(br.x+br.width/2,br.y+br.height/2):null;return {sur:q('surrenderSheet'),n:document.querySelectorAll('#surCards > *').length,cards:(document.getElementById('surCards')||{}).innerText?document.getElementById('surCards').innerText.replace(/\\s+/g,' ').slice(0,60):'',msg:q('surMsg'),scrim:q('scrim'),notice:q('notice'),btnSaveAt:at?at.id||at.className||at.tagName:'?'};})()`)));
};
const setCap = async (cap, exe) => c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); s.captured=${cap}; s.executed=${exe}; localStorage.setItem('sanguo_campaign_v1', JSON.stringify(s)); const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); for(const sl of st.slots||[]){ if(sl&&sl.snapshot&&sl.month!==undefined){sl.snapshot.captured=${cap};sl.snapshot.executed=${exe};} } localStorage.setItem('sanguo_saves_v1',JSON.stringify(st)); return 1;})()`);
await setCap('[""]','[]'); await probe('A 空串');
await setCap('[null]','[]'); await probe('B null');
await setCap('[]','[]'); await probe('C 空数组');
await c.close();
