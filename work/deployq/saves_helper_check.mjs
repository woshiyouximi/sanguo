// 舊檔兼容性抽查：saves.js 的 deployQueue 輔助 + v2→v3 升級不丟字段（project/162 §4）
import * as S from '../../game/web/saves.js';

const base = {
  v: 3, scenario: 1, month: 1, gold: 100, wins: 0, losses: 0,
  owned: [], cities: {}, armies: {}, generalLevel: {}, generalExp: {}, learned: {},
  loyal: {}, tire: {}, morale: {}, generalStatus: {}, weapon: {}, horse: {}, thing: {},
  year: 1, yearFlag: 0,
};
const q = [{ general: '張飛', troop: '槍', troops: 80 }, { general: '關羽', troop: '刀', troops: 100 }];

const s1 = { ...base };
console.log('missing ->', JSON.stringify(S.deployQueueOf(s1, ['A', 'B', 'C'])));
console.log('has(missing) ->', S.hasDeployQueue(s1));
S.setDeployQueue(s1, q);
console.log('roundtrip ->', JSON.stringify(S.deployQueueOf(s1)));
console.log('has ->', S.hasDeployQueue(s1));
const up = S.upgradeSnapshot(s1);
console.log('upgrade keeps ->', JSON.stringify(up.snapshot.deployQueue), '| from', up.from, 'to', up.to, 'changed', up.changed);

const v2 = { ...base, v: 2 };
delete v2.year;
delete v2.generalStatus;
S.setDeployQueue(v2, q);
const up2 = S.upgradeSnapshot(v2);
console.log('v2->v3 keeps ->', JSON.stringify(up2.snapshot.deployQueue), '| steps', JSON.stringify(up2.steps));

const empty = { ...base };
S.setDeployQueue(empty, []);
console.log('empty deletes ->', 'deployQueue' in empty);
