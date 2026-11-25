// battle.ts 作为入口时的 import 环探针：battle → strategy → garrison → levels → battle(未完成)
const B = await import('../../game/src/core/battle.ts');
const G = await import('../../game/src/core/garrison.ts');
const L = await import('../../game/src/core/levels.ts');
console.log('battle-entry: createWorld', typeof B.createWorld);
console.log('battle-entry: battleSetup 空城', G.battleSetup({}, 0, '不存在', 100).enemyTroops);
console.log('battle-entry: startLevelOf 關羽', L.startLevelOf({ STR: 99, INT: 85 }));
console.log('battle-entry: levelFromExp 200', L.levelFromExp(200), B.levelFromExp === L.levelFromExp);
