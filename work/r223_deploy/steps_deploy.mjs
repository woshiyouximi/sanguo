// 编成屏 + 出陣順序面板现状截图。
const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\r223_deploy';

export default async function steps({ s, evaluate, shot, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const findRoot = `(function(){var sc=cc.director.getScene();var st=[sc],r=null;while(st.length){var n=st.pop();var cs=n._components||n.components||[];for(var i=0;i<cs.length;i++){var nm=cs[i].__classname__||(cs[i].constructor&&cs[i].constructor.name);if(nm==='DeployRoot')r=cs[i];}var c=n.children||[];for(var j=0;j<c.length;j++)st.push(c[j]);}return r;})()`;
  const tap = (x, y) => `(function(){var r=${findRoot};if(!r)return 'no-root';r.onTouch({getUILocation:function(){return {x:${x - 375}, y:${667 - y}};}});return 'tapped';})()`;

  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (let i = 0; i < 12; i++) {
    await ev("(function(){ try { cc.director.loadScene('Deploy'); return 1; } catch (e) { return 0; } })()");
    await sleep(800);
    const now = await ev("(cc.director.getScene() ? cc.director.getScene().name : null)");
    if (now === 'Deploy') break;
  }
  await sleep(1800);
  await shot('deploy_now.png');
  // 真实触摸：设计坐标 (375,1168) → 画布 letterbox 后的屏幕坐标
  const sx = Math.round(53.5 + 375 * 1.0255);
  const sy = Math.round(1168 * 1.0255);
  await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  await shot('deploy_queue.png');
  const labels = await ev(`(function(){
    var sc=cc.director.getScene(), out=[], st=[sc];
    while(st.length){var n=st.pop();var l=n.getComponent&&n.getComponent('cc.Label');
      if(l && l.node.activeInHierarchy && String(l.string||'').trim()) out.push(String(l.string));
      var c=n.children||[];for(var i=0;i<c.length;i++)st.push(c[i]);}
    return out.slice(0, 80);
  })()`);
  log('LABELS', JSON.stringify(labels));
  return { result: 'OK', labels };
}
