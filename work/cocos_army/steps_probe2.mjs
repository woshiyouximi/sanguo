export default async function ({ evaluate, log }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  log('vis ' + (await ev(`JSON.stringify({ hidden: document.hidden, state: document.visibilityState, f: cc.director.getTotalFrames(), paused: cc.game.isPaused ? cc.game.isPaused() : null, running: cc.game.isRunning ? cc.game.isRunning() : null })`)));
  return 'ok';
}
