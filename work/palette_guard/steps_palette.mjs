// R103 编成页调色板守卫 · CDP 采样步
// 用法（由 work\palette_guard\palette_guard.ps1 调用）：
//   node work\cocos_verify\cdpweb.mjs run work\palette_guard\steps_palette.mjs
// 产出：OUTDIR/deploy_750.png（750×1334，正好是 cstat.py 的口径）
export default async function ({ send, evaluate, sleep, shot, log }) {
  // 1) 把视口钉到 750×1334（设计分辨率），色数才有可比性
  await send('Emulation.setDeviceMetricsOverride', {
    width: 750,
    height: 1334,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(300);

  // 2) 等引擎起来
  for (let i = 0; i < 60; i += 1) {
    const ok = await evaluate(() => {
      const cc = window.cc;
      if (!cc || !cc.director) return false;
      const scene = cc.director.getScene();
      return !!scene && cc.director.getTotalFrames() > 5;
    });
    if (ok) break;
    await sleep(250);
  }

  // 3) 进编成页
  const cur = await evaluate(() => {
    const cc = window.cc;
    const s = cc && cc.director ? cc.director.getScene() : null;
    return s ? s.name : null;
  });
  log(`scene before = ${cur}`);
  if (cur !== 'Deploy') {
    await evaluate(() => {
      window.cc.director.loadScene('Deploy');
    });
    await sleep(2500);
  }

  const after = await evaluate(() => {
    const cc = window.cc;
    const s = cc && cc.director ? cc.director.getScene() : null;
    return {
      scene: s ? s.name : null,
      frames: cc && cc.director ? cc.director.getTotalFrames() : -1,
      nodes: s ? s.children.length : -1,
    };
  });
  log(`scene after = ${JSON.stringify(after)}`);
  await sleep(800);

  await shot('deploy_750.png');
  log('saved deploy_750.png (750x1334)');
  return { ok: after.scene === 'Deploy', scene: after.scene, frames: after.frames };
}
