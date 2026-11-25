// 叫阵/结算冻结期间会不会「假挥砍」：开始 tick=0 有多少单位带 lastAttackTick；战斗结束时又冻结了多少个挥砍窗口
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
const { attackAgeOf } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const data = loadData({ dir: path.join(GAME, 'data') });

// 1) 开局（叫阵时 tick 恒为 0）
const w0 = createWorld({ data, seed: 7, a: { soldiers: 60, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 60, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
const at0 = w0.units.filter((u) => u.lastAttackTick != null).length;
const swingAt0 = w0.units.filter((u) => attackAgeOf(u, w0.tick, 24) !== null).length;

// 2) 打到结束，看最后那一 tick 有几个单位卡在挥砍窗口
const w = createWorld({ data, seed: 7, a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
installArmyOrders(w);
for (const s of ['A', 'B']) { w.aiCommand?.(w, s, 'advance'); w.aiCommand?.(w, s, 'rush'); }
let guard = 0;
while (!w.over && guard < 6000) { step(w); guard += 1; }
const swingAtEnd = w.units.filter((u) => attackAgeOf(u, w.tick, 24) !== null).length;
const aliveAtEnd = w.units.filter((u) => u.alive).length;
console.log(JSON.stringify({ tick0: { units: w0.units.length, withLastAttack: at0, swinging: swingAt0 }, end: { tick: w.tick, over: w.over, units: w.units.length, alive: aliveAtEnd, swinging: swingAtEnd, enemiesLeft: w.units.filter((u) => u.alive && u.side === 'B').length } }, null, 1));
