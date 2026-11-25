/**
 * Cocos 宿主垫片 —— 只做一件事：把 `core/smartscript/runtime.ts` 依赖的两处
 * 浏览器 API（`location` / `fetch`）在 Cocos（含微信小游戏）里补齐。
 *
 * 为什么不在 core 副本里改代码：`game/src/core/**` 是 web 与 Cocos 共用的一份真源，
 * 本轮只允许改 Cocos 侧。core 里 `initMagicProgram()` 已经预留了「预加载」路径
 * （见 runtime.ts:69-83 注释），只要先把 `magic_so.bin` / `magic_so.symbols.json`
 * 的字节塞进 `preloaded`，运行时就不会再走同步 XHR 或 `node:fs` 分支。
 *
 * 做法：
 *   1. 若 `globalThis` 上没有 `location`，塞一个假 origin（`https://cocos.local/`），
 *      让 core 的 `new URL(base, location.href)` 能算出一个稳定的绝对 URL；
 *   2. 包一层 `fetch`：URL 以 `magic_so.bin` / `magic_so.symbols.json` 结尾时
 *      从 `res` bundle 取 `BufferAsset` / `JsonAsset`，其余 URL 交回原 `fetch`
 *      （web-mobile 平台本来就有真 fetch）；
 *   3. `preloadMagicProgram()` 装完垫片再 `await initMagicProgram('data/')`。
 *
 * 形状对齐：core 只用到 `res.ok` / `res.status` / `res.arrayBuffer()` / `res.json()`，
 * 所以垫片返回一个「够用的 Response 形状」即可，不需要构造真的 `Response`。
 */
import { Asset, BufferAsset, JsonAsset } from 'cc';
import { getResBundle } from '../DataLoader';
import { initMagicProgram } from '../core/smartscript/runtime';

/** 假 origin：只在没有真 `location`（微信小游戏 / 原生）时用。 */
const FAKE_ORIGIN = 'https://cocos.local/';

interface ResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}

type FetchLike = (input: unknown, init?: unknown) => Promise<ResponseLike>;

function globalRecord(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/** `bundle.load` 必须四参：三参会被引擎当成 onProgress，完成回调永远不触发。 */
function loadBundleAsset<T extends Asset>(path: string, type: new () => T): Promise<T> {
  return getResBundle().then(
    (bundle) =>
      new Promise<T>((resolve, reject) => {
        bundle.load(path, type, null, (err: Error | null, asset: T) => {
          if (err || !asset) {
            reject(new Error(`res.load('${path}') 失敗：${err?.message ?? 'no asset'}`));
            return;
          }
          resolve(asset);
        });
      }),
  );
}

async function magicBinResponse(): Promise<ResponseLike> {
  const asset = await loadBundleAsset('data/magic_so', BufferAsset);
  const buffer = asset.buffer();
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(buffer),
    json: () => Promise.reject(new Error('magic_so.bin 不是 JSON')),
  };
}

async function magicSymbolsResponse(): Promise<ResponseLike> {
  const asset = await loadBundleAsset('data/magic_so.symbols', JsonAsset);
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.reject(new Error('magic_so.symbols.json 不是二進制')),
    json: () => Promise.resolve(asset.json),
  };
}

/** 幂等：装一次就够（Boot 场景与调试重启都可能重复调用）。 */
export function installHostShim(): void {
  const g = globalRecord();
  if (!g.location) {
    g.location = {
      href: FAKE_ORIGIN,
      origin: FAKE_ORIGIN.replace(/\/$/, ''),
      protocol: 'https:',
      host: 'cocos.local',
      hostname: 'cocos.local',
      pathname: '/',
      search: '',
      hash: '',
    };
  }
  if (g.__sanguoHostShim) return;
  g.__sanguoHostShim = true;

  const original = typeof g.fetch === 'function' ? (g.fetch as FetchLike) : null;
  const shimmed: FetchLike = async (input, init) => {
    const url = String(input);
    if (url.endsWith('magic_so.bin')) return magicBinResponse();
    if (url.endsWith('magic_so.symbols.json')) return magicSymbolsResponse();
    if (original) return original(input, init);
    throw new Error(`沒有 fetch：${url}`);
  };
  g.fetch = shimmed;
}

/**
 * 装垫片 + 预加载 `magic_so.{bin,symbols.json}`。
 *
 * 返回 false 表示预加载失败（缺资产 / `BufferAsset` 导入类型不对），此时技能会退化成
 * 占位特效，但**战斗本身照常跑**——所以这里只 `console.warn`，绝不抛给 BootRoot。
 */
export async function preloadMagicProgram(): Promise<boolean> {
  installHostShim();
  try {
    await initMagicProgram('data/');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[shim/host] magic_so 預加載失敗：${message}；法術將退化成占位特效`);
    return false;
  }
}
