import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.goto(BASE + 'campaign.html'); await sleep(1500);
const probe = async (tag) => {
  await c.eval(`location.reload()`); await sleep(2800);
  log(tag, JSON.stringify(await c.eval(`(()=>{const q=(id)=>{const e=document.getElementById(id);return e?{h:!!e.hidden,t:(e.textContent||'').replace(/\\s+/g,' ').slice(0,70)}:null;};return {sur:q('surrenderSheet'),cards:document.querySelectorAll('#surCards .sgen').length,msg:q('surMsg'),scrim:q('scrim'),notice:q('notice'),hint:q('hint')};})()`)));
};
const setCap = async (cap, exe) => c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); s.captured=${cap}; s.executed=${exe}; localStorage.setItem('sanguo_campaign_v1', JSON.stringify(s)); const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sl=st.slots[1]||st.slots[0]; if(sl&&sl.snapshot){sl.snapshot.captured=${cap};sl.snapshot.executed=${exe};localStorage.setItem('sanguo_saves_v1',JSON.stringify(st));} return 1;})()`);
await setCap('[""]','[]'); await probe('A [" "]');
await setCap('[null]','[]'); await probe('B [null]');
await setCap('[]','[]'); await probe('C 空');
await c.close();
