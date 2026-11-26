// F26 截圖（?dev=1&sim=1&freeze=1）：同步跑 1 tick、跳過叫陣、鏡頭硬切到 camera(world) 後只畫一幀。
// 這條路徑在 main.js 內是為「可復現截圖」準備的，frame() 不再跟隨，所以 front/back 兩張的 camX 與畫面
// 差異只來自站位本身。
const BASE = 'http://127.0.0.1:5174';

export default async function ({ evaluate, sleep, shot, send, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = {};
  const base = new URL(BASE + '/web/index.html');
  const params = {
    city: '南皮', from: 'campaign', a: '關羽', gen: '關羽', home: '南皮', marchpool: '200',
    troop: '2', form: '0', soldiers: '100', cav: '0', atire: '0', amorale: '60', wise: '',
    blevel: '', bsoldiers: '125', bgen: '沮授', bstr: '66', bint: '90', bmorale: '60',
    dev: '1', sim: '1', freeze: '1',
  };
  const run = async (label, cols) => {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('cols', cols);
    await send('Page.navigate', { url: u.toString() });
    let ok = false;
    for (let i = 0; i < 80; i += 1) {
      await sleep(250);
      if (await ev(`!!(window.__sanguo && window.__sanguo.state && window.__sanguo.state.world && window.__sanguo.state.world.tick >= 1)`)) { ok = true; break; }
    }
    if (!ok) throw new Error('dev freeze 頁沒 boot: ' + label);
    await sleep(400);
    const m = await ev(`(() => { const S = window.__sanguo, w = S.state.world;
      const a = w.units.find((x) => x.side === 'A' && x.isGeneral);
      const b = w.units.find((x) => x.side === 'B' && x.isGeneral);
      return { mode: S.state.mode, tick: w.tick, camX: S.state.camX, aGx: a && a.x, aCol: a && a.col, aLane: a && a.y,
        bGx: b && b.x, soldiers: w.units.filter((x) => x.side === 'A' && !x.isGeneral && x.alive).length }; })()`);
    const s = await shot(label);
    log(label, JSON.stringify(m));
    return { label, ...m, shot: s };
  };
  out.front = await run('f26_shot_front.png', '關羽:front');
  out.back = await run('f26_shot_back.png', '關羽:back');
  out.mid = await run('f26_shot_mid.png', '');
  return out;
}
