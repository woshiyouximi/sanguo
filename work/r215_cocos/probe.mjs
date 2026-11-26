// 诊断：为什么全图只画出 BattleMap/gBase，单位与 HUD 不见。
const PROBE = String.raw`
(function () {
  var sc = cc.director.getScene();
  var st = [sc], root = null;
  while (st.length) {
    var n = st.pop(); var cs = n._components || n.components || [];
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
      if (nm === 'BattleRoot') root = cs[i];
    }
    var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
  }
  if (!root) return { ok: false, error: 'no-root' };
  var kids = [];
  var cn = root.node;
  for (var k = 0; k < cn.children.length; k++) {
    var c = cn.children[k];
    kids.push({ name: c.name, active: !!c.active, activeSelf: !!c.activeSelf, kids: (c.children || []).length });
  }
  var canvas = cn.getComponent && cn.getComponent('cc.Canvas');
  var cam = cn.getComponent && cn.getComponent('cc.Camera');
  var out = {
    ok: true, scene: sc.name, tick: root.world ? root.world.tick : null,
    canvas: canvas ? { w: canvas.node.getComponent('cc.UITransform').contentSize.width, h: canvas.node.getComponent('cc.UITransform').contentSize.height } : null,
    cam: cam ? { orthoHeight: cam.orthoHeight, visibility: cam.visibility } : null,
    design: cc.view.getDesignResolutionSize(), visible: cc.view.getVisibleSize(), scale: cc.view.getScaleX(),
    kids: kids,
    markerKids: (function () { var m = null; for (var i = 0; i < cn.children.length; i++) if (cn.children[i].name === 'GeneralMarkers') m = cn.children[i]; if (!m) return null; return { pos: m.position, kids: m.children.length }; })(),
  };
  try { root.redraw(); out.redraw = 'ok'; } catch (e) { out.redraw = 'ERR:' + (e && e.message) + ' | ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' // ') : e); }
  out.after = { tick: root.world ? root.world.tick : null };
  return out;
})()
`;

export default async function steps({ s, evaluate, shot, log }) {
  await s('Page.bringToFront');
  const v = await evaluate(PROBE);
  log('probe', JSON.stringify(v, null, 1));
  const err = await evaluate("(function(){ try { return cc.director.getScene().name; } catch(e){ return 'E:'+e; } })()");
  log('scene', JSON.stringify(err));
  await shot('r215_probe.png');
  return v;
}
