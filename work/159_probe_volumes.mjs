// 159 §5 探针：110 条武将技在运行时真的送出的 sfx 音量集合。
//
// 用法：cd F:\sanguo\game && node ..\work\159_probe_volumes.mjs
//
// 目的：R52 那条断言（200/255 与 230/255 两档）原本靠 seq 3 的 `CreateSpoutAround`
// 内层循环里的 230；L1 极性修正后该循环的三次调用 arg1=0，230 点不可达（见 project/159 §5）。
// 这里扫一遍全部 110 条，找「运行时真能送出 ≥2 个不同音量」的技能，作为该断言的替身。
import { fileURLToPath } from 'node:url';
import { loadData } from '../game/src/data.ts';
import { createWorld, cast, step, QI_MAX } from '../game/src/core/battle.ts';
import { resetAudioBus, setAudioSink } from '../game/src/core/audio_bus.ts';

const data = loadData({ dir: fileURLToPath(new URL('../game/data/', import.meta.url)) });

const vols = [];
function armSink() {
  // `resetAudioBus()` 会把 sink 一起清掉，所以每条技能都要重装一次（与测试里的 run() 同序）。
  resetAudioBus();
  vols.length = 0;
  setAudioSink({
    sfx: (name, opts) => vols.push({ name, v: opts?.volume }),
    magic: () => {},
    flash: () => {},
    brightness: () => {},
  });
}

const rows = [];
for (const m of data.magics) {
  const seq = m.SEQUENCE;
  if (!seq) continue;
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  armSink();
  cast(world, 'A', seq, 20, 6.5);
  for (let i = 0; i < 600 && world.sessions.length > 0; i++) step(world);
  const v255 = [...new Set(vols.map((x) => Math.round(x.v * 255)))].sort((a, b) => a - b);
  if (v255.length >= 2) rows.push({ seq, name: m.NAME, v255, n: vols.length });
}

for (const r of rows) console.log(`seq=${String(r.seq).padStart(3)} ${r.name}  音量(0..255)=[${r.v255.join(',')}]  sfx=${r.n}`);
console.log(`RESULT 有 ≥2 档音量的技能 ${rows.length} 条`);
const with230 = rows.filter((r) => r.v255.includes(230));
console.log(`含 230 档的：${with230.length ? with230.map((r) => r.seq).join(',') : '（无）'}`);
