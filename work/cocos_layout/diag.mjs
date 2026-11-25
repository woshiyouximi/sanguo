export default async ({ send, evaluate, sleep, log }) => {
  const enc = await evaluate(`JSON.stringify({ href: location.href, title: document.title, ccType: typeof cc, bodyLen: document.body.innerHTML.length, canvasCount: document.querySelectorAll('canvas').length })`);
  log('page:', enc);
  for (const expr of [
    `typeof cc.director`,
    `cc.game && cc.game.isRunning ? String(cc.game.isRunning()) : 'n/a'`,
    `String(cc.director.getScene())`,
    `(cc.director.getScene()||{}).name || null`,
    `cc.view.getVisibleSize().width + 'x' + cc.view.getVisibleSize().height`,
    `document.querySelector('canvas') && document.querySelector('canvas').width + 'x' + document.querySelector('canvas').height`,
  ]) {
    log(expr.slice(0, 40), '=>', JSON.stringify(await evaluate(expr)));
  }
  const t = await send('Target.getTargets');
  return { targets: t.targetInfos.filter((x) => x.type === 'page').map((x) => x.url) };
};
