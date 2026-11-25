// Cocos 侧美术路径守卫。
//
// 起因：`CityModel.hallImageOf()` 长期返回 `assets/bg/env/hall_0N.jpg`，而那组 AI 图
// **从未进过 Cocos bundle**（`project/114_Cocos美术收尾.md` §3：bg/env 31 档 2.72 MB
// 只在 web 目录里）。也就是说那个函数一直指向不存在的资源，只是没人调用所以没炸。
// 这组断言锁住两点：
//   ① 返回的路径必须是 Cocos bundle 里真实存在的文件；
//   ② 大城（hallIndexOf=6）要 clamp 到原作 POLICY 只有的 5 张之内。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const SRC = new URL('../cocos/assets/scripts/CityModel.ts', import.meta.url);
const BUNDLE = new URL('../cocos/assets/bundles/res/', import.meta.url);

test('Cocos 的 hallImageOf 不再指向从未进包的 bg/env', () => {
  const src = readFileSync(SRC, 'utf8');
  const start = src.indexOf('export function hallImageOf');
  assert.ok(start >= 0, 'CityModel.ts 里应有 hallImageOf');
  const body = src.slice(start, start + 600);
  assert.ok(!body.includes('bg/env/'), 'hallImageOf 不能再用 bg/env（该目录从未进 Cocos bundle）');
  assert.ok(body.includes('bg/policy/palais_0'), 'hallImageOf 应指向进包的原作 POLICY 预烘图');
  assert.ok(/Math\.min\(5/.test(body), 'hallIndexOf 会返回 6，必须 clamp 到 5 张 PALAIS 之内');
});

test('bg/policy 的 5 张 PALAIS 预烘图确实在 bundle 里', () => {
  for (let n = 1; n <= 5; n += 1) {
    const url = new URL(`bg/policy/palais_0${n}.webp`, BUNDLE);
    assert.ok(existsSync(url), `palais_0${n}.webp 应在 cocos bundle 内`);
  }
  // 不许出现第 6 张（原作没有），否则 hallImageOf 的 clamp 就没意义了
  assert.ok(!existsSync(new URL('bg/policy/palais_06.webp', BUNDLE)));
});

test('bg/env 目录不应再出现在 cocos bundle 里', () => {
  const env = new URL('bg/env/', BUNDLE);
  assert.ok(!existsSync(env), 'bg/env 已移出 bundle（AI 图不复位，见 project/114）');
});
