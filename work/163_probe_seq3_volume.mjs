/**
 * 163 探针（验收门槛 6）：seq 3 的 230 音量到底能不能打出来。
 *
 * 原作 `CreateSpoutAround`（`func #222 @0x23438`，`magic_so.dis.txt:20107-20258`）里有两档音量：
 *   - 入口 `0x301("m026snd01", 200)`（dis:20112 附近）
 *   - 主循环体内 `0x301("m026snd01", 230)`（dis:20222-20224）
 * 主循环上界是 `CreateSpoutAround` 的 arg1，它来自调用方 `Spout`（`func #223 @0x2388C`）的
 * `CALL CreateSpoutAround(loc1, loc2, arg1*2)`；`Spout` 的 arg1 又来自根脚本：
 *   Magic4(num 504) = `PUSHI 0; CALL Spout`   → arg1 = 0 → 主循环 0 趟
 *   Magic16(num 516) = `PUSHI 1; CALL Spout`  → arg1 = 1 → 主循环 2 趟
 *   Magic32(num 532) = `PUSHI 2; CALL Spout`  → arg1 = 2 → 主循环 4 趟
 * 所以 seq 3（SCRIPT 504）在原作里也打不出 230；seq 18（516）/ seq 26（532）才打得出。
 * 这个探针把三条都跑一遍，打印 `m026snd01` 收到的音量序列，作为地址级结论的证据。
 */
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';
import { resetAudioBus, setAudioSink } from '../game/src/core/audio_bus.ts';

const data = loadData();

function staged(seed = 7) {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

const scriptOf = (seq) => {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  return m ? m.SCRIPT : 0;
};

function run(seq) {
  const calls = [];
  resetAudioBus();
  setAudioSink({
    sfx: (name, opts) => calls.push({ kind: 'sfx', name, volume: opts?.volume }),
    magic: (dir, opts) => calls.push({ kind: 'magic', dir, volume: opts?.volume }),
    flash: () => {},
    brightness: () => {},
  });
  const world = staged();
  const r = runSkill(world, 'A', scriptOf(seq), 20, 6.5);
  const vols230 = calls
    .filter((c) => c.kind === 'sfx')
    .map((c) => ({ name: c.name, vol255: Math.round(c.volume * 255), vol: c.volume }));
  return { seq, script: scriptOf(seq), ok: r.ok, calls: vols230, stats: r.stats };
}

const out = [];
for (const seq of [3, 18, 26]) {
  const r = run(seq);
  const spout = r.calls.filter((c) => c.name === 'm026snd01').map((c) => c.vol255);
  const has230 = spout.includes(230);
  out.push({ seq, script: r.script, ok: r.ok, spout, has230 });
  console.log(
    `seq ${String(seq).padStart(3)} (脚本 ${r.script})  m026snd01 音量序列 = [${spout.join(', ')}]` +
      `  ${has230 ? '✓ 出现 230' : '✗ 只有 200'}`,
  );
  console.log(
    `         全部发声 = [${r.calls.map((c) => `${c.name}:${c.vol255}`).join(', ')}]  ` +
      `hits=${r.stats.hits} objects=${r.stats.objects}`,
  );
}

const seq3 = out.find((o) => o.seq === 3);
const seq18 = out.find((o) => o.seq === 18);
const seq26 = out.find((o) => o.seq === 26);
console.log('\n结论：');
console.log(`  seq 3  脚本 ${seq3.script}（Magic4 → Spout(0)）  : 230 ${seq3.has230 ? '出现' : '不出现'}（主循环 0 趟）`);
console.log(`  seq 18 脚本 ${seq18.script}（Magic16 → Spout(1)） : 230 ${seq18.has230 ? '出现' : '不出现'}`);
console.log(`  seq 26 脚本 ${seq26.script}（Magic32 → Spout(2)） : 230 ${seq26.has230 ? '出现' : '不出现'}`);
