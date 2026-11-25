// 标定 Page.captureScreenshot 的 clip 坐标空间：静态 Campaign 屏对比 全屏 vs 裁剪
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function (ctx) {
  const { send, evaluate, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => J(await evaluate(expr));
  const out = {};

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(4000);
  out.env = await ev(`(() => { const v = cc.view.getViewportRect(); return JSON.stringify({
      dpr: window.devicePixelRatio, inner: [window.innerWidth, window.innerHeight],
      canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height],
      rect: (() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })(),
      vp: { x: v.x, y: v.y, w: v.width, h: v.height }, s: cc.view.getScaleX(), scene: cc.director.getScene().name }); })()`);
  log('ENV', JSON.stringify(out.env));

  const full = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUTDIR, '10_cal_full.png'), Buffer.from(full.data, 'base64'));
  const clipTop = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 876, height: 300, scale: 1 } });
  fs.writeFileSync(path.join(OUTDIR, '10_cal_clipTop.png'), Buffer.from(clipTop.data, 'base64'));
  const c = await send('Page.captureScreenshot', { format: 'png', clip: { x: 337, y: 671, width: 200, height: 200, scale: 3 } });
  fs.writeFileSync(path.join(OUTDIR, '10_cal_clipC.png'), Buffer.from(c.data, 'base64'));
  log('saved calibration shots');
  return out;
}
