// 探针：cc 模块里 AudioSource/AudioClip/Mask/MaskComponent 是否真的有导出
export default async function ({ evaluate, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) return { __throw: v.__throw };
    return v;
  };
  const r = await ev(`(async () => {
    const C = await System.import('cc');
    const names = ['AudioSource','AudioClip','Mask','MaskComponent','Label','Sprite','Graphics','UITransform','Node','Component','AudioSourceComponent','Audio','sys'];
    const out = {};
    for (const n of names) out[n] = typeof C[n];
    out.__keys = Object.keys(C).length;
    out.audioKeys = Object.keys(C).filter(k => /audio/i.test(k)).slice(0, 20);
    out.maskKeys = Object.keys(C).filter(k => /mask/i.test(k)).slice(0, 10);
    out.feature = (C.feature || null) ? Object.keys(C.feature).filter(k => /audio/i.test(k)).slice(0,20) : null;
    return JSON.stringify(out);
  })()`);
  log('CC PROBE =', JSON.stringify(r));
  return { cc: r };
}
