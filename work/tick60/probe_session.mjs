/**
 * 鎺㈤拡锛氭棆榫?554 鐨勪細璇濆湪鏂拌妭鎷嶄笅鍒板簳瑕佸灏?tick 鎵嶆敹灏撅紙r87_waitfor.test.ts 鐨?400 涓婇檺涓轰綍涓嶅锛夈€? * 璺戞硶锛歝d F:\sanguo; node work\tick60\probe_session.mjs
 */
import { loadData } from '../../game/src/data.ts';
import { createWorld, cast, step } from '../../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

const world = createWorld({
  data,
  seed: 7,
  a: { troop: 2, formation: 0, soldiers: 100, general: { name: '闂滅窘', str: 97, int: 75, level: 6 } },
  b: { troop: 10, formation: 3, soldiers: 100, general: { name: '寮佃', str: 70, int: 88, level: 5 } },
});
world.sides.A.general.qi = 999999;
const r = cast(world, 'A', 51, 20, 6.5);
const s = world.sessions[0];
console.log('cast', r.ok, r.reason ?? '', 'session life', s?.life, 'tick', world.tick);
let t = 0;
while (world.sessions.length > 0 && t < 3000) {
  step(world);
  t++;
}
console.log('closed after', t, 'ticks; done=', s?.done, 'ok=', s?.ok, 'reason=', s?.reason);
console.log('frames', s?.frames?.length, 'tick now', world.tick);

