/**
 * 一次性验证脚本：技力（MP）到底回不回、回多快。
 *
 * 运行：node work\jili\probe.mjs            （工作目录 F:\sanguo 或任意位置均可）
 * 依赖：node >= 22.18（原生支持 .ts 类型擦除；本机 v24.21.0 实测通过）
 * 说明：**不改 game/**，只 import 其源码；不依赖浏览器/UI/模拟器。
 *
 * 输出三组曲线：
 *   [1] 不带军师技：开战满技力 → 第 300 tick 人为扣 30 点（模拟放一次武将技）→ 之后一直平。
 *   [2] 带军师技「恢復技力」L1（wises.json SEQUENCE=12，参数 30）→ 观察每 tick 的回复。
 *   [3] 用同样的 tick 数直接对比两种口径的理论速率（原作 vs 我们现在的实现）。
 */

import { loadData } from '../../game/src/data.ts';
import { createWorld, step, TICK_HZ, MP_BASE } from '../../game/src/core/battle.ts';
import { installArmyOrders } from '../../game/src/core/army_cmd.ts';

const dataDir = new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir: dataDir });

/**
 * 让仗真的打起来（复刻 game/tests/_engage.ts 的夹具）：
 * 原作默认是「待機」（8 个命令槽全清），所以 createWorld() 之后双方站着不动，
 * 必须先下「全軍前進 + 全軍突擊」两条命令，和旧测试保持一致。
 */
function engage(world) {
  installArmyOrders(world);
  for (const side of ['A', 'B']) {
    world.aiCommand?.(world, side, 'advance');
    world.aiCommand?.(world, side, 'rush');
  }
  return world;
}

const SIDE_A = { soldiers: 100, troop: 0, formation: 0 };
const SIDE_B = { soldiers: 100, troop: 0, formation: 0 };

function mpOf(world) {
  const A = world.sides.A.general;
  const B = world.sides.B.general;
  return `t=${String(world.tick).padStart(5)}  A ${String(A.mp).padStart(3)}/${A.mpMax}  B ${String(B.mp).padStart(3)}/${B.mpMax}`;
}

function run(title, sideAExtra, ticks, castAtTick = 300) {
  console.log(`\n=== ${title} ===`);
  const world = createWorld({
    data,
    seed: 12345,
    aiSides: { A: false, B: false }, // 关掉 AI 放技，避免 B 侧 AI 消耗技力干扰读数
    a: { ...SIDE_A, ...sideAExtra },
    b: { ...SIDE_B },
  });
  engage(world);
  const a = world.sides.A.general;
  console.log(`开战：${mpOf(world)}   (mpMax 公式 baseMp=${a.baseMp} str=80 int=60 level=1)`);
  let casted = false;
  const samples = [];
  for (let i = 0; i < ticks; i++) {
    step(world);
    if (!casted && world.tick >= castAtTick) {
      // 模拟放一次 30 点技力的武将技（原作 0x43BAE3 从 general+0x16 扣）
      for (const side of ['A', 'B']) {
        const g = world.sides[side].general;
        g.mp = Math.max(0, g.mp - 30);
      }
      casted = true;
      console.log(`[事件] ${mpOf(world)}  ← 双方各扣 30 点（模拟放技）`);
      samples.push({ tick: world.tick, a: world.sides.A.general.mp });
    }
    if (world.tick % 600 === 0) {
      console.log(`      ${mpOf(world)}`);
      samples.push({ tick: world.tick, a: world.sides.A.general.mp });
    }
    if (world.over) {
      console.log(`      战斗结束 endReason=${world.endReason}  ${mpOf(world)}`);
      break;
    }
  }
  const first = samples.find((s) => s.tick >= castAtTick);
  const last = samples[samples.length - 1];
  if (first && last && last.tick > first.tick) {
    const dTick = last.tick - first.tick;
    const dMp = last.a - first.a;
    console.log(
      `[观测] 扣技力后 ${dTick} tick（${(dTick / TICK_HZ).toFixed(1)} s）A 主将技力变化 ${dMp >= 0 ? '+' : ''}${dMp} ⇒ ${(dMp / (dTick / TICK_HZ)).toFixed(3)} 点/秒`,
    );
  }
  return { world, samples };
}

// ---------------------------------------------------------------------------
// 1) 不带军师技
// ---------------------------------------------------------------------------
const r1 = run('① 不带军师技（正常游玩路径：army.flags = 0）', {}, 2400);

// ---------------------------------------------------------------------------
// 2) 带「恢復技力」L1：SEQUENCE=12 → Execute=38 → 参数 30
// ---------------------------------------------------------------------------
const r2 = run('② 带军师技「恢復技力」L1（a.strategy = 12）', { strategy: 12 }, 2400);

// ---------------------------------------------------------------------------
// 3) 理论速率对比
// ---------------------------------------------------------------------------
const mpMax = r1.world.sides.A.general.mpMax;
const value = 30; // 军师技「恢復技力」L1 的参数（strategy.ts: exec 38 → 30）
const origPerSec = value / 100; // 原作：每 tick 累加 value，满 6000(0x1770) 回 1 点；60Hz ⇒ value/100 点/秒
// 我们当前实现（battle.ts strategyRegen + strategy.ts REGEN_PERIOD_TICKS=120）：
// 每 120 tick 回 max(1, round(mpMax*value/1000)) 点
const REGEN_PERIOD_TICKS = 120;
const oursPerTick = Math.max(1, Math.round((mpMax * value) / 1000));
const oursPerSec = (oursPerTick / REGEN_PERIOD_TICKS) * TICK_HZ;

console.log('\n=== ③ 速率口径对比（军师技「恢復技力」L1，param=30，mpMax=' + mpMax + '）===');
console.log(`原作 : 每 tick +${value} 累加，满 6000 回 1 点 ⇒ ${origPerSec.toFixed(2)} 点/秒（= 参数/100），与 mpMax 无关`);
console.log(`现行 : 每 ${REGEN_PERIOD_TICKS} tick（${(REGEN_PERIOD_TICKS / TICK_HZ).toFixed(1)} s）回 ${oursPerTick} 点 ⇒ ${oursPerSec.toFixed(2)} 点/秒，随 mpMax 线性放大`);
console.log(`误差 : 现行 / 原作 = ${(oursPerSec / origPerSec).toFixed(1)}×`);
console.log(`整场 : 战斗 ${(11880 / TICK_HZ).toFixed(0)} s（原作 0x2E68=11880 帧@60Hz），原作 L1 最多回 ${Math.floor((11880 / TICK_HZ) * origPerSec)} 点，现行最多回 ${Math.floor((11880 / TICK_HZ) * oursPerSec)} 点`);
console.log(`常量 : MP_BASE = ${MP_BASE}（game/src/core/battle.ts）`);
