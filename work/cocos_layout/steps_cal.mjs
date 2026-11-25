// 标定：在设计矩形四角画洋红方块，用像素位置反推「世界坐标 → 屏幕像素」的仿射映射
export default async function ({ s, evaluate, shot, log, sleep }) {
  await s('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const r = await evaluate(`(() => {
    const C = cc.director.getScene().getChildByName('Canvas');
    const old = C.getChildByName('Cal'); if (old) old.destroy();
    const n = new cc.Node('Cal'); n.parent = C; n.setSiblingIndex(C.children.length - 1);
    const g = n.addComponent('cc.Graphics');
    if (g.lineWidth !== undefined) g.lineWidth = 0;
    g.fillColor = cc.color(255, 0, 255, 255);
    // 设计矩形四角（世界坐标：x = dx-375, y = 667-dy）
    const marks = [[0,0],[750,0],[0,1334],[750,1334]];
    for (const [dx, dy] of marks) { const wx = dx - 375, wy = 667 - dy; g.rect(wx - 4, wy - 4, 8, 8); }
    g.fill();
    const ut = n.getComponent('cc.UITransform');
    const cam = C.getChildByName('Camera');
    return JSON.stringify({ nodes: C.children.length, camera: cam ? [cam.worldPosition.x, cam.worldPosition.y] : null,
      designs: cc.view.getDesignResolutionSize(), visible: cc.view.getVisibleSize(), scale: [cc.view.getScaleX(), cc.view.getScaleY()],
      canvasUT: (() => { const u = C.getComponent('cc.UITransform'); return { w: u.width, h: u.height, a: u.anchorPoint, wp: [C.worldPosition.x, C.worldPosition.y], sp: [C.scale.x, C.scale.y] }; })() });
  })()`);
  log('cal setup => ' + r);
  await sleep(400);
  const p = await shot('cal.png');
  log('shot ' + JSON.stringify(p));
  return 'ok';
}
