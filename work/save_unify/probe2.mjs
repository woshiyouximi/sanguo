/**
 * 探針 2：驗證「SaveSlots.ts 自帶 @ccclass 裝飾器 + import 'cc'」能不能在 node --test 裡載入。
 * 方案：
 *   · resolve hook 把 'cc' 短路成 data: URL 樁；相對 import 缺副檔名時補 `.ts`；
 *   · load hook 只對 SaveSlots.ts 生效：先剝掉唯一一行 `@ccclass('SaveSlotsPanel')`
 *     （Node 24 的 type-strip 不解析裝飾器），再用 `module.stripTypeScriptTypes()` 轉成
 *     純 JS，回傳 format 'module'。
 */
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SAVE_SLOTS_URL = new URL('../../game/cocos/assets/scripts/SaveSlots.ts', import.meta.url).href;

const CC_STUB = `
export const _decorator = {
  ccclass: () => (target) => target,
  property: () => () => {},
};
export class Component {
  node = { getChildByName: () => null, addChild: () => {}, children: [], layer: 0 };
  getComponent() { return null; }
  addComponent() { return null; }
}
export class Node {}
export class Label {}
export class Color { constructor() {} }
export class Graphics {}
export class UITransform {}
export class Vec3 { constructor() {} }
export class EventTouch {}
export const input = { on: () => {}, off: () => {} };
export const Input = { EventType: {} };
export const director = { loadScene: () => {} };
export const sys = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
`;
const CC_URL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(CC_STUB);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cc') return { url: CC_URL, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(specifier + '.ts', context);
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url === SAVE_SLOTS_URL) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const stripped = source.replace(/^\s*@ccclass\([^)]*\)\s*$/m, '');
      if (stripped === source) throw new Error('探針失效：沒找到 @ccclass 裝飾器行');
      return { format: 'module', source: stripTypeScriptTypes(stripped), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const S = await import(SAVE_SLOTS_URL);
console.log('exports:', Object.keys(S).sort().join(','));
console.log('SLOTS_KEY =', S.SLOTS_KEY);
console.log('saveToSlot type =', typeof S.saveToSlot);

// 最小冒煙：Map 假 storage，存一格 → 讀回
const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const save = { owned: ['小沛'], month: 3, wins: 2, losses: 1, roster: { 小沛: ['關羽', '張飛'] } };
const rec = S.saveToSlot(save, 2, { now: 123 }, storage);
console.log('record =', JSON.stringify(rec));
console.log('index =', mem.get('sanguo_slots_v1'));
console.log('payload keys =', [...mem.keys()].filter((k) => k.startsWith('sanguo_slot_payload_v1_')).join(','));
