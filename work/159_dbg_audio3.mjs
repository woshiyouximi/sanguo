// 159 临时调试：seq 3（尖刺陷阱类）的发声序列为什么只剩 200 一档
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';
import { audioEvents, resetAudioBus, setAudioSink, audioBusStats } from '../game/src/core/audio_bus.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const world = createWorld({
  data,
  seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24;
g.y = 6.5;
g.prevX = g.x;
g.prevY = g.y;
resetAudioBus();
setAudioSink(() => {});
const script = data.magics.find((m) => m.SEQUENCE === 3).SCRIPT;
const r = runSkill(world, 'A', script, 20, 6.5);
console.log(`script=${script} ok=${r.ok} 指令=${r.instructions} syscall=${r.syscalls}`);
console.log(`log=${r.log.join(' | ')}`);
console.log(`stats=${JSON.stringify(audioBusStats())}`);
console.log(`events=${JSON.stringify(audioEvents().filter((e) => e.kind === 'sfx'))}`);
