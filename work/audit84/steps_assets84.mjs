// 小探针：看 assetManager.bundles 的真实形状 + 已加载资源
export default async function (ctx) {
  const { evaluate, log } = ctx;
  const r = await evaluate(`JSON.stringify((() => {
    const am = cc.assetManager;
    const b = am.bundles;
    const shape = {
      ctor: b && b.constructor && b.constructor.name,
      isArray: Array.isArray(b),
      keys: b ? Object.keys(b).slice(0, 12) : null,
      hasValues: !!(b && typeof b.values === 'function'),
      hasSize: !!(b && typeof b.size === 'number'),
      proto: b ? Object.getOwnPropertyNames(Object.getPrototypeOf(b)).slice(0, 12) : null,
      resCtor: typeof cc.resources,
      resName: cc.resources && cc.resources.name,
    };
    const res = am.getBundle ? (am.getBundle('res') || null) : null;
    const dirs = res && res.getDirWithPath ? {
      map: res.getDirWithPath('map', cc.SpriteFrame).length,
      audio: res.getDirWithPath('audio', cc.AudioClip).length,
      audioAny: res.getDirWithPath('audio').length,
      face: res.getDirWithPath('face', cc.SpriteFrame).length,
    } : null;
    return { shape, getBundleRes: !!res, dirs };
  })())`);
  log('PROBE=' + r);
  return r;
}
