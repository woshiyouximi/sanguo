// 探针：验证 Node 24 能否在桩掉 'cc' 后 import SaveSlots.ts（含 @ccclass 装饰器）。
import { registerHooks } from 'node:module';

const STUB = `data:text/javascript,${encodeURIComponent(`
export const _decorator = { ccclass: () => (t) => t, property: () => () => {} };
export class Component {}
export class Color { constructor() {} }
export class Node {}
export class Graphics {}
export class Label {}
export class UITransform {}
export class Vec3 { constructor() {} }
export class EventTouch {}
export const input = { on(){}, off(){} };
export const Input = { EventType: { TOUCH_END: 'touch-end', TOUCH_MOVE: 'touch-move' } };
export const director = {};
export const sys = { localStorage: { getItem: () => null, setItem(){}, removeItem(){} } };
`)}`;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cc') return { url: STUB, shortCircuit: true };
    try {
      return next(spec, ctx);
    } catch (err) {
      if (spec.startsWith('.') && ctx.parentURL && !/\.[a-z]+$/i.test(spec)) return next(`${spec}.ts`, ctx);
      throw err;
    }
  },
});

const base = new URL('../../game/cocos/assets/scripts/', import.meta.url);
const M = await import(new URL('SaveSlots.ts', base).href);
console.log('OK exports:', Object.keys(M).length, 'SLOTS_KEY=', M.SLOTS_KEY, 'CAMPAIGN_KEYS=', M.CAMPAIGN_KEYS.join(','));
