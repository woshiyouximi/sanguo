/**
 * R204 本地音频 · CDP 实测（web-mobile 构建）
 *
 * 目标：证明「音频在包里也能播」不是纸面结论——
 *   1) res bundle 从包内加载成功（cc.assetManager.getBundle('res')）；
 *   2) bundle 内 audio-manifest.json 能读到 109 档；
 *   3) bundle 内 audio/bgm/04、audio/sfx/hit01 两个 AudioClip 能 load 出来；
 *   4) 进 Battle 场景后 BattleRoot.audio.stats.local > 0、missing 为 0；
 *   5) 场景里的 cc.AudioSource 至少一个 clip 非空（BGM 或音效真的挂上了）；
 *   6) 全程没有 .mp3 的 404 / 加载失败；控制台没有 [AudioHost] 缺档 warn。
 *
 * 用法：node work/audio_local/cdp_audio_local.mjs <cdp-port> <page-url>
 * 产物：work/audio_local/battle_audio_local.png、cdp_evidence.json
 */
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 9420);
const PAGE = process.argv[3] || 'http://127.0.0.1:5199/';
const OUT = 'F:\\sanguo\\work\\audio_local';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __scene = () => (cc.director.getScene() ? cc.director.getScene().name : '?');
`;

const PROBE = `(async () => {
  ${H}
  const br = __comp('BattleRoot');
  const bundle = cc.assetManager.getBundle('res');
  const load = (p, T) => new Promise((res) => {
    if (!bundle) return res({ ok: false, err: 'no res bundle' });
    try {
      bundle.load(p, T, null, (err, a) => res({ ok: !!a, err: err ? String(err.message || err) : null, name: a && a.name ? a.name : null }));
    } catch (e) { res({ ok: false, err: String(e.message || e) }); }
  });
  const manifest = await load('audio-manifest', cc.JsonAsset);
  const manifestInfo = bundle && manifest.ok && bundle.get('audio-manifest')
    ? (() => { const j = bundle.get('audio-manifest').json; return { count: j && j.count, bytes: j && j.bytes, encode: j && j.encode }; })()
    : null;
  const bgm = await load('audio/bgm/04', cc.AudioClip);
  const sfx = await load('audio/sfx/hit01', cc.AudioClip);
  const sources = __all().map((n) => n.getComponent(cc.AudioSource)).filter(Boolean).map((s) => ({
    node: s.node.name,
    clip: s.clip ? s.clip.name : null,
    playing: !!s.playing,
    state: s.state,
    volume: +Number(s.volume || 0).toFixed(2),
  }));
  // AudioHost 内部状态：root 挂在 BattleRoot 下，Bgm / Voice 节点直接看 clip/playing 最准
  const host = (() => {
    const a = br && br.audio;
    if (!a) return null;
    const pick = (v) => (v && v.source ? {
      node: v.node ? v.node.name : null,
      clip: v.source.clip ? v.source.clip.name : null,
      playing: !!v.source.playing,
      loop: !!v.source.loop,
      volume: +Number(v.source.volume || 0).toFixed(2),
    } : null);
    return {
      valid: !!a.root && a.root.isValid,
      parent: a.root && a.root.parent ? a.root.parent.name : null,
      rootChildren: a.root ? a.root.children.map((c) => c.name) : null,
      bgm: pick(a.bgmVoice),
      ambience: pick(a.ambienceVoice),
      voices: (a.voices || []).map(pick),
      clipKeys: a.clips ? Array.from(a.clips.keys()) : null,
    };
  })();
  const res = (performance.getEntriesByType ? performance.getEntriesByType('resource') : [])
    .filter((e) => e.name.split('?')[0].toLowerCase().endsWith('.mp3'))
    .map((e) => ({ file: e.name.split('/').pop(), ms: Math.round(e.duration), transfer: e.transferSize }));
  return JSON.stringify({
    scene: __scene(),
    battle: !!br,
    world: !!(br && br.world),
    bundle: !!bundle,
    bundleName: bundle ? bundle.name : null,
    audioStats: br && br.audio ? br.audio.stats : null,
    clipCache: br && br.audio && br.audio.clips ? br.audio.clips.size : null,
    manifest,
    manifestInfo,
    bgm,
    sfx,
    sources,
    host,
    res,
  });
})()`;

let seq = 0;
const pending = new Map();
const consoleLogs = [];
const netBad = [];
const mp3Net = [];

async function main() {
  let version = null;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
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
      consoleLogs.push(`[${msg.params.type}] ` + (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleLogs.push('[exception] ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
    } else if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.status >= 400) netBad.push({ url: r.url, status: r.status });
      if (/\.mp3(\?|$)/i.test(r.url)) mp3Net.push({ url: r.url, status: r.status, bytes: r.headers && (r.headers['Content-Length'] || r.headers['content-length']) });
    } else if (msg.method === 'Network.loadingFailed') {
      netBad.push({ url: '(loadingFailed) ' + (msg.params.errorText || ''), status: 0 });
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: true });
  await send('Page.bringToFront');
  await send('Page.navigate', { url: PAGE });

  // Cocos 场景就绪：轮询 cc.director.getScene()，不赌固定秒数
  let scene = '';
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: `(() => { try { return (window.cc && cc.director && cc.director.getScene()) ? cc.director.getScene().name : ''; } catch (e) { return ''; } })()`, returnByValue: true }).catch(() => null);
    scene = r?.result?.value || '';
    if (scene) break;
  }
  console.log('scene ready:', scene);
  if (!scene) {
    const diag = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ ready: document.readyState, hasCc: !!window.cc, title: document.title, body: (document.body ? document.body.innerHTML : '').slice(0, 300) })`,
      returnByValue: true,
    }).catch((e) => ({ error: String(e) }));
    console.log('diag:', JSON.stringify(diag && diag.result ? diag.result.value : diag));
    console.log('console:');
    for (const l of consoleLogs.slice(-40)) console.log('  ' + l);
    console.log('netBad:', JSON.stringify(netBad.slice(0, 30), null, 1));
    const s = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (s && s.data) fs.writeFileSync(`${OUT}\\cdp_fail.png`, Buffer.from(s.data, 'base64'));
    throw new Error('Cocos 场景没起来');
  }

  // 进战斗：直接 loadScene('Battle')（与 work/cocos_accept/steps_a6_tail.mjs 同一条路）
  await send('Runtime.evaluate', { expression: `cc.director.loadScene('Battle'); 1`, returnByValue: true });
  let battle = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', {
      expression: `(() => { ${H} const b = __comp('BattleRoot'); return JSON.stringify({ scene: __scene(), battle: !!b, world: !!(b && b.world) }); })()`,
      returnByValue: true,
    }).catch(() => null);
    battle = r?.result?.value ? JSON.parse(r.result.value) : null;
    if (battle && battle.world) break;
  }
  console.log('battle:', JSON.stringify(battle));

  // 给 BGM / 预加载一点真实时间（AudioHost.update 用 dt 推进）
  await sleep(6000);

  const probe = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true }).catch((e) => ({ error: String(e) }));
  if (!probe?.result?.value) throw new Error('页面探针失败：' + JSON.stringify(probe).slice(0, 400));
  const data = JSON.parse(probe.result.value);
  data.console = consoleLogs.slice(-60);
  data.netBad = netBad;
  data.mp3Net = mp3Net;
  data.audioWarn = consoleLogs.filter((l) => l.includes('[AudioHost]'));
  data.page = PAGE;
  data.at = new Date().toISOString();

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}\\battle_audio_local.png`, Buffer.from(shot.data, 'base64'));
  fs.writeFileSync(`${OUT}\\cdp_evidence.json`, JSON.stringify(data, null, 1), 'utf8');

  console.log('--- evidence ---');
  console.log(JSON.stringify({
    scene: data.scene, battle: data.battle, world: data.world, bundle: data.bundle,
    audioStats: data.audioStats, clipCache: data.clipCache,
    manifest: data.manifest, manifestInfo: data.manifestInfo, bgm: data.bgm, sfx: data.sfx,
    sources: data.sources, host: data.host, res: data.res, netBad: data.netBad, mp3Net: data.mp3Net, audioWarn: data.audioWarn,
  }, null, 1));
  console.log('console tail:');
  for (const l of data.console.slice(-20)) console.log('  ' + l);
  console.log('PNG', `${OUT}\\battle_audio_local.png`, Buffer.from(shot.data, 'base64').length, 'B');

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
