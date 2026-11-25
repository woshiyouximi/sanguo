// 診斷：存檔是否存在 + Deploy 場景載入耗時（逐步記錄場景名變化）
export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => await evaluate(expr);
  const out = {};
  out.scene0 = await ev(`cc.director.getScene() ? cc.director.getScene().name : ''`);
  out.save = await ev(`(() => { try { const raw = sys.localStorage.getItem('sanguo_campaign_v1'); if (!raw) return 'null'; const j = JSON.parse(raw); return JSON.stringify({ len: raw.length, owned: (j.owned || []).length, month: j.month, gold: j.gold, queue: !!(j.deployQueue) }); } catch (e) { return 'ERR ' + e; } })()`);
  out.frames0 = await ev(`cc.director.getTotalFrames()`);
  log('scene0=' + out.scene0 + ' save=' + out.save + ' frames=' + out.frames0);
  out.loadRet = await ev(`(() => { try { cc.director.loadScene('Deploy', (err) => { window.__deployLoadErr = err ? String(err) : 'ok'; }); return 'issued'; } catch (e) { return 'throw ' + e; } })()`);
  const trail = [];
  for (let i = 0; i < 150; i += 1) {
    await sleep(1000);
    const s = await ev(`cc.director.getScene() ? cc.director.getScene().name : ''`);
    if (trail.length === 0 || trail[trail.length - 1].scene !== s) trail.push({ t: i + 1, scene: s });
    if (s === 'Deploy') break;
  }
  out.trail = trail;
  out.loadErr = await ev(`window.__deployLoadErr || ''`);
  out.sceneEnd = await ev(`cc.director.getScene() ? cc.director.getScene().name : ''`);
  out.hasDeployRoot = await ev(`(() => { const walk = (n, hit) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number') hit.push(n.name); }); n.children.forEach((k) => walk(k, hit)); return hit; }; return JSON.stringify(walk(cc.director.getScene(), [])); })()`);
  log('trail=' + JSON.stringify(trail) + ' err=' + out.loadErr + ' end=' + out.sceneEnd + ' roots=' + out.hasDeployRoot);
  return out;
}
