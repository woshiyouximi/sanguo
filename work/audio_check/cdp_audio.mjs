/**
 * 音频层体检 · 第 8 步：CDP 取证（截图 + 页面内实测）。
 *
 * 分工：Edge 由 PowerShell 的 Start-Process 拉起（--window-size / --virtual-time-budget
 * 先在 PowerShell 里赋变量再入数组，避免参数被拆坏）；本脚本只负责连上去、
 * Runtime.evaluate、Page.captureScreenshot —— 不 spawn 任何进程。
 *
 * 用法：
 *   node work/audio_check/cdp_audio.mjs map    <port>
 *   node work/audio_check/cdp_audio.mjs battle <port>
 *
 * 产物（都在 work/audio_check/）：
 *   map_audio.png / battle_audio.png   —— 截图（左下角 ?sfxdbg=1 的 HUD 一并入镜）
 *   terrain_sweep.json                 —— 12 个地形逐个切歌 + 切底噪的实测记录
 *   cdp_evidence.json                  —— 两个页面的 SG.audio.state() / HUD 文本
 */
import { writeFileSync } from 'node:fs';

const MODE = process.argv[2] || 'map';
const PORT = Number(process.argv[3] || 9617);
const OUT = 'F:\\sanguo\\work\\audio_check';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URLS = {
  // ?demo=1：没有存档时铺 5 个示范槽（campaign.html:1059 seedDemoSlots），否则只弹「選擇劇本」浮层
  map: 'http://127.0.0.1:5173/web/campaign.html?demo=1&sfxdbg=1&bgmdbg=1&seed=7',
  battle: 'http://127.0.0.1:5173/web/index.html?sim=250&terrain=7&sfxdbg=1&bgmdbg=1&seed=7',
  // 技能音：战场页解锁音频后逐个调 SG.audio.magic(dir)，看 plays/byName 有没有动
  magic: 'http://127.0.0.1:5173/web/index.html?sim=20&terrain=3&sfxdbg=1&bgmdbg=1&seed=7',
};

// 逐个 dir 查 magicKey + has + 真调一次，前后对比 plays/byName：
// plays 涨了 = audio.js 认得这个 dir（不是静默 return null），byName 里出现的就是实际播的音效名。
const MAGIC_JS = `(() => {
  const dirs = ['006', '010', '017', '021', '022', '024', '031', '016', '001', '004', '033', '008'];
  const before = SG.audio.state();
  const keys = dirs.map((d) => {
    const k = SG.audio.magicKey(d);
    return { dir: d, key: k, hasFile: k ? SG.audio.has(k) : false };
  });
  for (const d of dirs) SG.audio.magic(d, { volume: 0 });
  const after = SG.audio.state();
  return { keys, before: { plays: before.plays, byName: before.byName }, after: { plays: after.plays, byName: after.byName } };
})()`;

// 12 个地形逐个切 BGM + 切底噪，把每次的实际曲名/底噪读回来。
// 注意：这是真调用（不是读常量），所以同时验证了 index.json 与 audio.js 两条路径。
const SWEEP_JS = `(async () => {
  const out = [];
  for (let t = 0; t < 12; t++) {
    SG.audio.bgm('terrain:' + t);
    SG.audio.battleAmbience(t);
    await new Promise((r) => setTimeout(r, 130));
    const s = SG.audio.state();
    out.push({ terrain: t, bgm: s.bgm, amb: s.amb, bgmPaused: s.bgmPaused });
  }
  SG.audio.bgm('terrain:0');
  SG.audio.battleAmbience(0);
  return out;
})()`;

const STATE_JS = `(() => {
  const hud = document.getElementById('sg-audio-dbg');
  return {
    url: location.href,
    audio: window.SG && SG.audio ? SG.audio.state() : null,
    hud: hud ? hud.textContent : null,
    album: window.SG && SG.audio && SG.audio.album ? SG.audio.album() : null,
    htmlAudioPlaying: [...document.querySelectorAll('audio')].map((a) => ({ src: a.src.split('/').pop(), paused: a.paused, vol: +a.volume.toFixed(2) })),
  };
})()`;

let seq = 0;
const pending = new Map();
const logs = [];

async function main() {
  // 等调试端口
  let version = null;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not yet */ }
    await sleep(150);
  }
  if (!version) throw new Error('调试端口没起来：' + PORT);
  console.log('Edge', version.Browser);

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${msg.params.type}] ` + (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URLS[MODE] });

  // 等 SG.audio 就绪（轮询，不用固定秒数赌）
  let ready = false;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const r = await send('Runtime.evaluate', { expression: '!!(window.SG && SG.audio && SG.audio.state)', returnByValue: true }).catch(() => null);
    if (r?.result?.value) { ready = true; break; }
  }
  console.log('SG.audio 就绪', ready);

  const evidence = { mode: MODE, url: URLS[MODE], at: new Date().toISOString() };
  evidence.before = (await send('Runtime.evaluate', { expression: STATE_JS, returnByValue: true })).result.value;

  if (MODE === 'map') {
    // 让 BGM 真播一会儿再扫（同时给截图里的 HUD 攒出非零计数）
    await sleep(2500);
    const sweep = await send('Runtime.evaluate', { expression: SWEEP_JS, returnByValue: true, awaitPromise: true })
      .catch((e) => ({ error: String(e) }));
    if (sweep?.result?.value) {
      writeFileSync(`${OUT}\\terrain_sweep.json`, JSON.stringify(sweep.result.value, null, 1), 'utf8');
      const byBgm = {};
      for (const row of sweep.result.value) (byBgm[row.bgm] = byBgm[row.bgm] || []).push(row.terrain);
      console.log('--- 12 地形扫描 ---');
      console.log('曲目分布', JSON.stringify(byBgm));
      console.log('有底噪的地形', sweep.result.value.filter((r) => r.amb).map((r) => r.terrain + ':' + r.amb).join(' '));
      console.log('无底噪的地形', sweep.result.value.filter((r) => !r.amb).map((r) => r.terrain).join(' '));
      evidence.sweep = sweep.result.value;
    } else {
      console.log('扫描失败', JSON.stringify(sweep));
    }
    // 截图前恢复大地图本该播的曲（17.mp3），HUD 上就是这张页面真实的状态
    await send('Runtime.evaluate', { expression: "SG.audio.bgm('map'); 1", returnByValue: true });
    await sleep(1500);
  } else if (MODE === 'magic') {
    await sleep(1500);
    const r = await send('Runtime.evaluate', { expression: MAGIC_JS, returnByValue: true });
    const v = r.result.value;
    writeFileSync(`${OUT}\\magic_probe.json`, JSON.stringify(v, null, 1), 'utf8');
    console.log('--- 技能音逐个实测（before plays=' + v.before.plays + ' → after=' + v.after.plays + '）---');
    for (const k of v.keys) console.log(`${k.dir}  magicKey=${k.key || '(无键，静默)'}  hasFile=${k.hasFile}`);
    console.log('新增播放:', JSON.stringify(v.after.byName));
    evidence.magic = v;
    await sleep(600);
  } else {
    await sleep(1500);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}\\${MODE}_audio.png`, Buffer.from(shot.data, 'base64'));
  console.log('PNG', `${OUT}\\${MODE}_audio.png`, Buffer.from(shot.data, 'base64').length, 'B');

  evidence.after = (await send('Runtime.evaluate', { expression: STATE_JS, returnByValue: true })).result.value;
  evidence.console = logs.slice(-40);
  writeFileSync(`${OUT}\\cdp_evidence_${MODE}.json`, JSON.stringify(evidence, null, 1), 'utf8');

  console.log('--- STATE ---');
  console.log(JSON.stringify(evidence.after.audio));
  console.log('--- HUD ---');
  console.log(evidence.after.hud);
  if (evidence.after.htmlAudioPlaying) console.log('--- <audio> ---', JSON.stringify(evidence.after.htmlAudioPlaying));
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
