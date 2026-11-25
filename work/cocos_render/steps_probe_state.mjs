// 探针：运行态自检
export default async function ({ evaluate, sleep, log }) {
  const raw = async (expr) => {
    const v = await evaluate(expr);
    return JSON.stringify(v);
  };
  log('typeof cc =', await raw(`typeof cc`));
  log('director =', await raw(`typeof cc !== 'undefined' && !!cc.director`));
  log('scene =', await raw(`(typeof cc !== 'undefined' && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null`));
  log('frames =', await raw(`(typeof cc !== 'undefined' && cc.director) ? cc.director.getTotalFrames() : -1`));
  log('href =', await raw(`location.href`));
  log('body =', await raw(`document.body ? document.body.children.length : -1`));
  log('canvas =', await raw(`document.querySelectorAll('canvas').length`));
  log('loading =', await raw(`(window.__cc_loading || window.__loading || null)`));
  log('errs =', await raw(`(window.__errs || []).slice(0,5)`));
  await sleep(3000);
  log('scene2 =', await raw(`(typeof cc !== 'undefined' && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null`));
  log('frames2 =', await raw(`(typeof cc !== 'undefined' && cc.director) ? cc.director.getTotalFrames() : -1`));
  log('sys =', await raw(`(typeof cc !== 'undefined') ? Object.keys(cc).slice(0,20) : []`));
  return {};
}
