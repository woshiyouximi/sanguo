// shared UI helpers: real mouse clicks on matched elements (never el.click())
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function list(c, sel, extra = '') {
  return c.eval(`(()=>{const out=[]; const ns=document.querySelectorAll(${JSON.stringify(sel)});
   for(let i=0;i<ns.length;i++){const e=ns[i]; const r=e.getBoundingClientRect();
     const s=getComputedStyle(e); const vis=r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity!==0;
     out.push({i, vis, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
       dis:e.disabled===true, cls:String(e.className||'').slice(0,40),
       txt:(e.innerText||e.value||'').replace(/\\s+/g,' ').trim().slice(0,120) ${extra}});}
   return out;})()`);
}

/** click the i-th matched element by real mouse events */
export async function clickNth(c, sel, i = 0, dy = 0) {
  const arr = await list(c, sel);
  const e = arr[i];
  if (!e) return { ok: false, why: 'no match ' + sel + ' #' + i, n: arr.length };
  if (!e.vis) return { ok: false, why: 'invisible ' + sel + ' #' + i, e };
  await c.mouse(e.x + e.w / 2, e.y + e.h / 2 + dy);
  return { ok: true, e };
}

/** click first matched element whose text matches re */
export async function clickText(c, sel, re, extra = '') {
  const arr = await list(c, sel, extra);
  const e = arr.find((x) => x.vis && re.test(x.txt));
  if (!e) return { ok: false, why: 'no text match ' + sel + ' ' + String(re), seen: arr.map((a) => a.txt) };
  await c.mouse(e.x + e.w / 2, e.y + e.h / 2);
  return { ok: true, e };
}

export async function clickRect(c, r) {
  if (!r || r.w < 2 || r.h < 2) return { ok: false, why: 'bad rect', r };
  await c.mouse(r.x + r.w / 2, r.y + r.h / 2);
  return { ok: true, r };
}

/** click by element id via real mouse events */
export async function clickId(c, id, dy = 0) {
  return clickNth(c, '#' + id, 0, dy);
}

export async function text(c, sel) {
  return c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return e?(e.innerText||e.value||'').replace(/\\s+/g,' ').trim():null;})()`);
}

export async function visible(c, id) {
  return c.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); if(!e) return null; const s=getComputedStyle(e); return !e.hidden && s.display!=='none' && s.visibility!=='hidden';})()`);
}

/** drag a range input to a target fraction of its track using real mouse */
export async function dragRange(c, sel, frac) {
  const r = await c.rect(sel);
  if (!r) return { ok: false, why: 'no ' + sel };
  const x0 = r.x + r.w / 2, y0 = r.y + r.h / 2;
  await c.mouse(x0, y0, 'down');
  await sleep(60);
  const x1 = r.x + Math.max(2, Math.min(r.w - 2, r.w * frac));
  await c.mouse(x1, y0, 'move');
  await sleep(60);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x1), y: Math.round(y0), button: 'left', buttons: 1 }, c.sid);
  await sleep(60);
  await c.mouse(x1, y0, 'up');
  return { ok: true, value: await c.eval(`document.querySelector(${JSON.stringify(sel)}).value`) };
}
