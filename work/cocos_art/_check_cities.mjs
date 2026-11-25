// 60 城坐标对拍：换图（bg/map_sheet 1100×825 → map/chinamap 1280×960）前后
// world→screen 的公式没动，这里独立复算一遍，确认 60 城仍落在 MAP_VIEW 内、
// 且「按世界 y 排序」与「按屏幕 y 排序」完全同序。
import { readFileSync } from 'node:fs';

const ROOT = 'F:/sanguo';
const VIEW = { x: 20, y: 130, w: 710, h: 900 };
const WORLD = { x0: 88, x1: 1138, y0: 84, y1: 860 };
const MAP_W = 1280;
const MAP_H = 960;

const scale = Math.min(VIEW.w / (WORLD.x1 - WORLD.x0), VIEW.h / (WORLD.y1 - WORLD.y0)) * 0.94;
const ox = VIEW.x + (VIEW.w - (WORLD.x1 - WORLD.x0) * scale) / 2;
const oy = VIEW.y + (VIEW.h - (WORLD.y1 - WORLD.y0) * scale) / 2;
const toScreen = (x, y) => ({ x: ox + (x - WORLD.x0) * scale, y: oy + (y - WORLD.y0) * scale });

const scenarios = JSON.parse(readFileSync(`${ROOT}/game/cocos/assets/bundles/res/data/scenarios.json`, 'utf8'));
let checked = 0;
let failures = 0;
const rows = [];

for (const scenario of scenarios) {
  const cities = scenario.cities ?? [];
  const sortedWorld = cities.map((c) => c.NAME).sort((a, b) => {
    const ca = cities.find((c) => c.NAME === a);
    const cb = cities.find((c) => c.NAME === b);
    return ca.pos_xy[1] - cb.pos_xy[1] || ca.pos_xy[0] - cb.pos_xy[0] || a.localeCompare(b);
  });
  const sortedScreen = cities
    .map((c) => ({ name: c.NAME, p: toScreen(c.pos_xy[0], c.pos_xy[1]) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || a.name.localeCompare(b.name))
    .map((c) => c.name);

  for (const city of cities) {
    const p = toScreen(city.pos_xy[0], city.pos_xy[1]);
    const [wx, wy] = city.pos_xy;
    const insideWorld = wx >= 0 && wx <= MAP_W && wy >= 0 && wy <= MAP_H;
    const insideView = p.x >= VIEW.x && p.x <= VIEW.x + VIEW.w && p.y >= VIEW.y && p.y <= VIEW.y + VIEW.h;
    checked += 1;
    if (!insideWorld || !insideView) {
      failures += 1;
      console.log(`✗ ${scenario.file ?? scenario.id} ${city.NAME} pos=${wx},${wy} screen=${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    if (scenario === scenarios[0]) rows.push({ name: city.NAME, wx, wy, sx: +p.x.toFixed(1), sy: +p.y.toFixed(1) });
  }
  const orderSame = sortedWorld.join('|') === sortedScreen.join('|');
  if (!orderSame) failures += 1;
  console.log(`${scenario.file ?? scenario.id}: cities=${cities.length} order=${orderSame ? 'same' : 'CHANGED'}`);
}

console.log(`scale=${scale.toFixed(6)} origin=(${ox.toFixed(3)},${oy.toFixed(3)})`);
console.log(`checked=${checked} failures=${failures}`);
console.log('sample(襄平..):', rows.slice(0, 5));
console.log('sample(tail):', rows.slice(-3));
process.exit(failures === 0 ? 0 : 1);
