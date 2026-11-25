/**
 * 把 resources/data/*.json 读成 core 认识的 GameData。
 *
 * Cocos 的 resources.load 只认 resources/ 下的路径，且不带 .json 后缀：
 *   assets/resources/data/generals.json → resources.load('data/generals', JsonAsset)
 *
 * 这里一次并行加载 8 张 core 真正用到的表；其余 5 张（fonts/meta/sango_system/
 * things/things_define）也复制进了 resources/data，留给以后 UI/图鉴按需加载。
 */
import { JsonAsset, resources } from 'cc';
import type { GameData } from '../types';

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

function loadJson(name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    resources.load(`data/${name}`, JsonAsset, (err, asset) => {
      if (err || !asset) {
        reject(new Error(`resources.load('data/${name}') 失敗：${err?.message ?? 'no asset'}`));
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
  const total = CORE_DATA_FILES.length;
  cache = Promise.all(
    CORE_DATA_FILES.map(async (name) => {
      const json = await loadJson(name);
      done += 1;
      onProgress?.(done, total);
      return [name, json] as const;
    }),
  )
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
