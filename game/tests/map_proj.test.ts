/**
 * mapProj.ts 的单测：`node --test tests/map_proj.test.ts`
 * 只测纯函数，不碰 DOM。城数据从 scenarios.json 读（与运行时同一份）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAP_H,
  MAP_W,
  fitBox,
  hitCity,
  mapScale,
  mapToScreen,
  screenToMap,
  type MapBox,
} from '../src/view/mapProj.ts';

const EPS = 1e-9;
const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

type City = { NAME: string; pos_xy: [number, number] };
const scen = JSON.parse(
  readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'),
) as { cities: City[] }[];
const CITIES = scen[0]!.cities;

/** 显示区中心与宽高比断言，多处复用 */
function assertUniform(box: MapBox) {
  assert.ok(near(box.width / box.height, MAP_W / MAP_H, 1e-9), `宽高比 ${box.width}/${box.height}`);
  assert.ok(near(mapScale(box), box.height / MAP_H, 1e-9), 'x/y 缩放比必须一致');
}

test('常量：MAP_W/MAP_H 就是原图 1280x960', () => {
  assert.equal(MAP_W, 1280);
  assert.equal(MAP_H, 960);
  assert.ok(near(MAP_W / MAP_H, 4 / 3));
});

test('fitBox contain：等比、整图可见、居中留边', () => {
  const box = fitBox(750, 500, 'contain');
  assertUniform(box);
  // 500/960 < 750/1280 → 高是限制边
  assert.ok(near(box.height, 500), `height=${box.height}`);
  assert.ok(box.width <= 750 + EPS, `width=${box.width} 不能超出可用宽`);
  assert.ok(box.left >= -EPS && box.top >= -EPS, `contain 不应出现负偏移 (${box.left},${box.top})`);
  // 居中：左右留边相等、上下留边相等
  assert.ok(near(box.left, 750 - box.width - box.left), '左右留边不等');
  assert.ok(near(box.top, 500 - box.height - box.top), '上下留边不等');
  assert.ok(near(box.width, (1280 * 500) / 960), `width 应为 ${(1280 * 500) / 960}`);
});

test('fitBox cover：等比、铺满可用区、居中裁边（允许负偏移）', () => {
  const box = fitBox(750, 500, 'cover');
  assertUniform(box);
  assert.ok(box.width >= 750 - EPS, 'cover 宽必须盖满');
  assert.ok(box.height >= 500 - EPS, 'cover 高必须盖满');
  // 750/1280 > 500/960 → 宽是限制边，左右不留边、上下各裁一半
  assert.ok(near(box.width, 750));
  assert.ok(near(box.left, 0));
  assert.ok(near(box.top, (500 - box.height) / 2) && box.top < 0, '上下应对称裁掉');
});

test('fitBox：宽受限 / 高受限两种可用区都选对限制边', () => {
  const wide = fitBox(1600, 480, 'contain'); // 4:3 = 1600:1200 → 高受限
  assert.ok(near(wide.height, 480) && near(wide.width, 640), `${wide.width}x${wide.height}`);
  const tall = fitBox(400, 1200, 'contain'); // 宽受限
  assert.ok(near(tall.width, 400) && near(tall.height, 300), `${tall.width}x${tall.height}`);
  // cover 的限制边正好相反
  assert.ok(near(fitBox(1600, 480, 'cover').width, 1600));
  assert.ok(near(fitBox(400, 1200, 'cover').height, 1200));
});

test('fitBox：可用区非法 → 零 box，不产生 NaN', () => {
  for (const [w, h] of [[0, 500], [750, 0], [-10, 500], [NaN, 500], [Infinity, 500]]) {
    const box = fitBox(w!, h!, 'contain');
    assert.deepEqual(box, { left: 0, top: 0, width: 0, height: 0 }, `${w}x${h}`);
  }
});

test('mapToScreen：四角与中心落在显示区四角与中心', () => {
  const box = fitBox(750, 500, 'contain');
  const tl = mapToScreen(box, [0, 0]);
  const br = mapToScreen(box, [MAP_W, MAP_H]);
  const mid = mapToScreen(box, [MAP_W / 2, MAP_H / 2]);
  assert.ok(near(tl.x, box.left) && near(tl.y, box.top));
  assert.ok(near(br.x, box.left + box.width) && near(br.y, box.top + box.height));
  assert.ok(near(mid.x, box.left + box.width / 2) && near(mid.y, box.top + box.height / 2));
});

test('边界点：0 与 1279/959（最后一像素）都在 box 内', () => {
  const box = fitBox(750, 500, 'contain');
  for (const p of [[0, 0], [MAP_W - 1, 0], [0, MAP_H - 1], [MAP_W - 1, MAP_H - 1], [MAP_W, MAP_H]] as [number, number][]) {
    const s = mapToScreen(box, p);
    assert.ok(s.x >= box.left - EPS && s.x <= box.left + box.width + EPS, `x=${s.x}`);
    assert.ok(s.y >= box.top - EPS && s.y <= box.top + box.height + EPS, `y=${s.y}`);
  }
});

test('往返误差 ≤0.5px（网格 + contain/cover 两种 box）', () => {
  for (const mode of ['contain', 'cover'] as const) {
    const box = fitBox(750, 500, mode);
    for (let gx = 0; gx <= MAP_W; gx += 137) {
      for (let gy = 0; gy <= MAP_H; gy += 131) {
        const s = mapToScreen(box, [gx, gy]);
        const [mx, my] = screenToMap(box, s.x, s.y);
        assert.ok(Math.abs(mx - gx) <= 0.5, `x ${gx} → ${mx}`);
        assert.ok(Math.abs(my - gy) <= 0.5, `y ${gy} → ${my}`);
      }
    }
  }
});

test('60 城全部落在 box 内，且往返误差 ≤0.5px', () => {
  assert.equal(CITIES.length, 60);
  for (const mode of ['contain', 'cover'] as const) {
    const box = fitBox(750, 500, mode);
    for (const c of CITIES) {
      const [x, y] = c.pos_xy;
      const s = mapToScreen(box, [x, y]);
      // contain 时严格在内；cover 时同样在内（整图都画出去了，只是被裁）
      assert.ok(s.x >= box.left - EPS && s.x <= box.left + box.width + EPS, `${c.NAME} x=${s.x}`);
      assert.ok(s.y >= box.top - EPS && s.y <= box.top + box.height + EPS, `${c.NAME} y=${s.y}`);
      const [mx, my] = screenToMap(box, s.x, s.y);
      assert.ok(Math.abs(mx - x) <= 0.5 && Math.abs(my - y) <= 0.5, `${c.NAME} 往返`);
    }
  }
});

test('等比：屏幕距离比 == 原图距离比（不存在 x/y 各自缩放）', () => {
  const box = fitBox(750, 500, 'contain');
  const a = mapToScreen(box, [100, 100]);
  const bx = mapToScreen(box, [500, 400]);
  const c = mapToScreen(box, [900, 700]);
  const dScreen = Math.hypot(bx.x - a.x, bx.y - a.y);
  const dMap = Math.hypot(400, 300);
  assert.ok(near(dScreen / dMap, mapScale(box), 1e-9), '屏幕/原图距离比应恒等于缩放比');
  const dScreen2 = Math.hypot(c.x - bx.x, c.y - bx.y);
  const dMap2 = Math.hypot(400, 300);
  assert.ok(near(dScreen2 / dMap2, mapScale(box), 1e-9));
});

test('screenToMap：零尺寸 box → NaN（不是假的 0,0）', () => {
  const [x, y] = screenToMap({ left: 0, top: 0, width: 0, height: 0 }, 100, 100);
  assert.ok(Number.isNaN(x) && Number.isNaN(y));
  // hitCity 拿到 NaN 也必须安全返回 null
  assert.equal(hitCity({ left: 0, top: 0, width: 0, height: 0 }, CITIES, 0, 0, 20), null);
});

test('hitCity：命中半径内、排除半径外、取最近者', () => {
  const box = fitBox(750, 500, 'contain');
  const cities = [
    { NAME: 'A', pos_xy: [100, 100] as [number, number] },
    { NAME: 'B', pos_xy: [110, 100] as [number, number] },
  ];
  const sa = mapToScreen(box, [100, 100]);
  // 正好点在 A 上
  assert.equal(hitCity(box, cities, sa.x, sa.y, 12)?.NAME, 'A');
  // 两个都在半径内时取最近的：靠 B 一点
  const sb = mapToScreen(box, [110, 100]);
  assert.equal(hitCity(box, cities, (sa.x + sb.x) / 2 + 1, sa.y, 30)?.NAME, 'B');
  // 半径外
  assert.equal(hitCity(box, cities, sa.x + 200, sa.y, 12), null);
  // r<=0 / 空数组 / NaN 坐标
  assert.equal(hitCity(box, cities, sa.x, sa.y, 0), null);
  assert.equal(hitCity(box, [], sa.x, sa.y, 20), null);
  assert.equal(hitCity(box, cities, NaN, sa.y, 20), null);
  assert.equal(hitCity(box, [{ NAME: 'bad', pos_xy: [NaN, 0] }], sa.x, sa.y, 20), null);
});

test('hitCity：真实 60 城里点洛陽只命中洛陽', () => {
  const box = fitBox(750, 500, 'contain');
  const luoyang = CITIES.find((c) => c.NAME === '洛陽')!;
  const s = mapToScreen(box, luoyang.pos_xy);
  assert.equal(hitCity(box, CITIES, s.x, s.y, 14)?.NAME, '洛陽');
  // 半径 14 design px ≈ 14/0.5208 ≈ 26.9 原图 px，比洛陽到最近邻城(弘農 dx=90)小得多
  assert.equal(hitCity(box, CITIES, s.x, s.y, 40)?.NAME, '洛陽');
});
