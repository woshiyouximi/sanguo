/**
 * 把 assets/bundles/res/data/*.json 读成 core 认识的 GameData。
 *
 * 资源已经全部迁进自定义 bundle「res」（`assets/bundles/res/`），它**不会**像
 * 内建 `resources` 那样自动加载，必须先 `assetManager.loadBundle('res')`。
 * 为了两种目录布局都能跑（迁移前 / 迁移后），这里统一走 `getResBundle()`：
 * 先拿 'res'，拿不到再退回内建 `resources`。
 *
 *   assets/bundles/res/data/generals.json → bundle.load('data/generals', JsonAsset)
 *
 * 这里一次并行加载 8 张 core 真正用到的表；其余 5 张（fonts/meta/sango_system/
 * things/things_define）也在同一个目录里，留给以后 UI/图鉴按需加载。
 */
import { Asset, assetManager, JsonAsset, resources } from 'cc';
import type { GameData } from './types';

/** 资源 bundle 名（对应 assets/bundles/res/res.meta 里的 bundleName）。 */
export const RES_BUNDLE = 'res';

/** `assetManager.getBundle()` 的返回类型去掉 null。 */
export type Bundle = NonNullable<ReturnType<typeof assetManager.getBundle>>;

let resBundle: Bundle | null = null;

/** 拿到资源 bundle；'res' 加载失败时退回内建 resources（并为以后留了重试）。 */
export async function getResBundle(): Promise<Bundle> {
  if (resBundle) return resBundle;
  const cached = assetManager.getBundle(RES_BUNDLE);
  if (cached) {
    resBundle = cached;
    return cached;
  }
  const loaded = await new Promise<Bundle | null>((resolve) => {
    assetManager.loadBundle(RES_BUNDLE, (err: Error | null, bundle: Bundle) => {
      if (err) {
        console.warn(`[res] loadBundle('${RES_BUNDLE}') 失敗：${err.message}`);
        resolve(null);
        return;
      }
      resolve(bundle ?? null);
    });
  });
  if (!loaded) {
    console.warn(`[res] 退回內建 resources；assets/bundles/res 是否已被 import？`);
    return resources;
  }
  resBundle = loaded;
  return loaded;
}

/** 在资源 bundle 里加载一个 Asset（路径不带扩展名）。 */
export function loadRes<T extends Asset>(
  path: string,
  type: new () => T,
  cb: (err: Error | null, asset: T | null) => void,
): void {
  void getResBundle().then((bundle) => {
    bundle.load(path, type, (err: Error | null, asset: T) => cb(err, asset ?? null));
  });
}

export const CORE_DATA_FILES = [
  'troops',
  'formations',
  'magics',
  'wises',
  'generals',
  'terrains',
  'items',
  'scenarios',
] as const;

export const ALL_DATA_FILES = [
  ...CORE_DATA_FILES,
  'fonts',
  'meta',
  'sango_system',
  'things',
  'things_define',
] as const;

async function loadJson(name: string): Promise<unknown> {
  const bundle = await getResBundle();
  return new Promise((resolve, reject) => {
    bundle.load(`data/${name}`, JsonAsset, (err: Error | null, asset: JsonAsset) => {
      if (err || !asset) {
        reject(new Error(`res.load('data/${name}') 失敗：${err?.message ?? 'no asset'}`));
        return;
      }
      resolve(asset.json);
    });
  });
}

let cache: Promise<GameData> | null = null;

/** 加载（并缓存）整个 GameData。失败时清空缓存，允许重试。 */
export function loadGameData(onProgress?: (done: number, total: number) => void): Promise<GameData> {
  if (cache) return cache;
  let done = 0;
  // garrison.json 不在 core 的 8 张表里：它是 `battleSetup()` 的**可选**增强表，
  // 缺了也要能开战（core 会退回「按 POPULATION 推算守军」）。所以单独加载、吞错。
  const total = CORE_DATA_FILES.length + 1;
  cache = Promise.all([
    ...CORE_DATA_FILES.map(async (name) => {
      const json = await loadJson(name);
      done += 1;
      onProgress?.(done, total);
      return [name, json] as const;
    }),
    loadJson('garrison').then(
      (json) => {
        done += 1;
        onProgress?.(done, total);
        return ['garrison', json] as const;
      },
      (err: Error) => {
        console.warn(`[res] garrison.json 未載入（守軍退回按人口推算）：${err.message}`);
        done += 1;
        onProgress?.(done, total);
        return ['garrison', undefined] as const;
      },
    ),
  ])
    .then((pairs) => Object.fromEntries(pairs) as unknown as GameData)
    .catch((err) => {
      cache = null;
      throw err;
    });
  return cache;
}

/** 只给「资源是否齐全」的自检用；不进主流程。 */
export async function loadAllForAudit(): Promise<Record<string, unknown>> {
  const pairs = await Promise.all(ALL_DATA_FILES.map(async (name) => [name, await loadJson(name)] as const));
  return Object.fromEntries(pairs);
}
