// 刀劍亂 553 音效计数探针：判断 R52 期望值 11 是哪个改动带来的。
import { createWorld } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { runSkill } from '../../game/src/core/smartscript/runtime.ts';
import { resetAudioBus, setAudioSink } from '../../game/src/core/audio_bus.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
resetAudioBus();
const names = [];
setAudioSink({
  sfx: (name) => names.push(name),
  magic: (dir) => names.push(dir),
  flash: () => {},
  brightness: () => {},
});

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
world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);

const r = runSkill(world, 'A', 553, 20, 6.5);
const snd02 = names.filter((n) => n === 'm036snd02').length;
console.log('RESULT ' + JSON.stringify({ ok: r.ok, names: names.length, snd02, list: names.join(' '), instr: r.stats.instructions, objects: r.objects.length }));
