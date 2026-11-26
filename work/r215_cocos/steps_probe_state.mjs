// 临场探针：读 BattleRoot 的 tick / paused / settlement / 最近异常
export default async function steps({ s, evaluate, sleep, log }) {
  await s('Page.bringToFront');
  const Q = String.raw`(function () {
    var sc = cc.director.getScene(), st = [sc], root = null;
    while (st.length) {
      var n = st.pop(), cs = n._components || n.components || [];
      for (var i = 0; i < cs.length; i++) {
        var nm = cs[i].__classname__ || (cs[i].constructor && cs[i].constructor.name);
        if (nm === 'BattleRoot') root = cs[i];
      }
      var ch = n.children || []; for (var j = 0; j < ch.length; j++) st.push(ch[j]);
    }
    return {
      scene: sc && sc.name,
      frames: cc.director.getTotalFrames(),
      paused: cc.director.isPaused ? cc.director.isPaused() : null,
      hidden: document.hidden,
      hasFocus: document.hasFocus(),
      tick: root && root.world ? root.world.tick : null,
      over: root && root.world ? root.world.over : null,
      settlement: !!root.settlement,
      loading: !!root.loading,
      worldDots: root && root.world ? root.world.units.filter(function (u) { return u.alive; }).length : null,
      last: root && root.lastMessage ? String(root.lastMessage) : null,
    };
  })()`;
  const a = await evaluate(Q);
  await sleep(1200);
  const b = await evaluate(Q);
  log('a', JSON.stringify(a));
  log('b', JSON.stringify(b));
  return { a, b };
}
