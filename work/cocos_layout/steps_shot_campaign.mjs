// 大地圖：設 876×1368 模擬視口 → 重新載入（拿新建置）→ 等場景 → 幾何 dump → 截圖
const DUMP = `(() => {
  const scene = cc.director.getScene();
  const canvas = scene.getChildByName('Canvas');
  const comp = canvas.components.find((x) => x && x.save && x.cities);
  const H = 1334;
  const box = (n) => {
    const t = n.getComponent('cc.UITransform');
    if (!t) return null;
    const b = t.getBoundingBoxToWorld();
    return { name: n.name, dx: +b.x.toFixed(2), dy: +(H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  };
  const pick = (pred) => canvas.children.filter(pred).map(box).filter(Boolean);
  const icons = canvas.getChildByName('CampaignCityIcons');
  return {
    view: { w: cc.view.getVisibleSize().width, h: cc.view.getVisibleSize().height, scale: cc.view.getScaleX() },
    mapImageRect: comp.mapImageRect(),
    toScreenXiangping: comp.toScreen(760, 300),
    cityCount: comp.cities ? comp.cities.length : -1,
    nodes: {
      mapImage: pick((n) => n.name === 'CampaignMapImage'),
      bands: pick((n) => n.name === 'CampaignBands'),
      icons: icons ? icons.children.map(box).filter(Boolean) : [],
      labels: pick((n) => n.name.startsWith('Label_')),
    },
  };
})()`;

export default async ({ send, shot, evaluate, sleep, log }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  // 注意：不要在這裡 Page.reload。reload 後 Edge 對背景分頁凍結 → getScene() 回 null、截圖全黑。
  // 需要新產物時用 cdp.mjs close + launch（PAGE_URL 指新 build）。
  // 等 cc 就緒 + Campaign 場景 + 組件
  let info = null;
  for (let i = 0; i < 120; i += 1) {
    await sleep(500);
    const probe = await evaluate(`(() => { try { const s = cc.director.getScene(); if (!s || s.name !== 'Campaign') return 'scene:' + (s && s.name); const c = s.getChildByName('Canvas'); const k = c && c.components.find((x) => x && x.save && x.cities); return k ? 'ok:' + cc.director.getTotalFrames() : 'nocomp'; } catch (e) { return 'err:' + e.message; } })()`);
    if (typeof probe === 'string' && probe.startsWith('ok:')) { info = probe; break; }
  }
  log('ready:', info);
  await sleep(1500);
  const geom = await evaluate(DUMP);
  const shotRes = await shot('campaign.png');
  log('shot:', JSON.stringify(shotRes));
  return { ready: info, geom, shot: shotRes };
};
