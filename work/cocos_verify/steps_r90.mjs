// 第 5 轮验收：Boot 标题页 → 剧本选择 → 君主选择 → 大地图（名冊/列表/勢力/圖例）→ 截图
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  // 节点树工具（在页面里）：找名字含关键字的节点、读它的 Label 文本与屏幕矩形
  const TREE_FN = `
    const __tree = () => {
      const sc = cc.director.getScene();
      const out = [];
      const walk = (n, d) => {
        const comps = (n.components || []).map((c) => c && c.constructor && c.constructor.name).filter(Boolean);
        const lb = (n.components || []).find((c) => c && typeof c.string === 'string');
        out.push({ d, name: n.name, active: n.active, comps, text: lb ? lb.string : null });
        n.children.forEach((c) => walk(c, d + 1));
      };
      if (sc) walk(sc, 0);
      return out;
    };
    const __labels = () => __tree().filter((x) => x.text !== null && String(x.text).trim() !== '').map((x) => x.text);
  `;

  await sleep(6000);
  out.afterBoot = await ev(`(() => { ${TREE_FN}
    const t = __tree();
    return JSON.stringify({
      scene: cc.director.getScene() ? cc.director.getScene().name : null,
      nodes: t.length,
      labels: __labels().slice(0, 24),
    });
  })()`);
  await shot('r90_00_boot');

  // 点「開始新局」：标题页的按钮是节点，先按文字找，再派发触摸
  out.clickStart = await ev(`(() => { ${TREE_FN}
    const sc = cc.director.getScene();
    const target = __tree().find((x) => x.text && x.text.replace(/\\s/g, '') === '開始新局');
    if (!target) return JSON.stringify({ ok: false, why: 'no 開始新局 label', labels: __labels().slice(0, 20) });
    const all = [];
    const walk = (n) => { all.push(n); n.children.forEach(walk); };
    walk(sc);
    const node = all.find((n) => {
      const lb = (n.components || []).find((c) => c && typeof c.string === 'string');
      return lb && lb.string.replace(/\\s/g, '') === '開始新局';
    });
    if (!node) return JSON.stringify({ ok: false, why: 'node not found' });
    const parent = node.parent || node;
    const ui = parent.getComponent(cc.UITransform);
    if (!ui) return JSON.stringify({ ok: false, why: 'no UITransform' });
    const wp = ui.convertToWorldSpaceAR(cc.v3(0, 0, 0));
    const evt = new cc.EventTouch([], true);
    evt.type = cc.Node.EventType.TOUCH_END;
    evt.touch = { getUILocation: () => ({ x: wp.x, y: wp.y }) };
    evt.getUILocation = () => ({ x: wp.x, y: wp.y });
    parent.emit(cc.Node.EventType.TOUCH_END, evt);
    return JSON.stringify({ ok: true, x: wp.x, y: wp.y, parent: parent.name });
  })()`);
  await sleep(1500);
  await shot('r90_01_scenario');
  out.scenario = await ev(`(() => { ${TREE_FN}
    return JSON.stringify({ labels: __labels().slice(0, 30) });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}
