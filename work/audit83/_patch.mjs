const fs = require('fs');
const f = 'project/80_对照复查R83.md';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('miss: ' + a.slice(0, 50));
  s = s.split(a).join(b);
};
rep('`game/dist/core/battle.js` 仍是 04:38 旧版',
  '`game/dist/core/*.js` 已在 **05:36:15 重建**（`battle.js` 78,082 B，晚于 `battle.ts` 05:33:29）→ 网页跑的就是这份带在途单挑代码的 dist');
rep('| **B0b** | **web 跑的是旧 dist**：`game/dist/core/*.js` 11 个文件全是 **04:38:16**，而 `src/core/battle.ts` 已 05:24:13 → 出包/试玩都看不到 R81 之后的 core 改动 | **0.5h** | 〔自估〕`cd game && npm run build` + 校验 11 个 js 的 mtime 全部晚于 src；**必须等 B0 修完再重建**，否则把挂死代码打进包 |',
  '| **B0b** | **修完必须重建 + 真机复验**：`game/dist/core/*.js` 已在窗口内被重建到 **05:36:15**（11 个 js，`battle.js` 78,082 B）→ **网页正在跑的就是让 `battle.test.ts` 挂死的那份代码**；测试挂死可以只是测试问题，也可能是网页战斗真卡死 | **0.5h** | 〔自估〕B0 修完后重跑 `cd game && npm run build`，核对 11 个 js mtime 全部晚于对应 src，再在网页里真打一场确认不卡 |');
rep('但新增了「测试挂死 4h + dist 重建 0.5h」', '但新增了「测试挂死 4h + 重建复验 0.5h」');
rep('附带事实：`game/dist/core/*.js` 11 个文件仍停在 **04:38:16**，比 `src` 旧 ~55 分钟 → 网页/出包跑的是**旧 core**（这既是「为什么现在玩家还能玩」，也是「R81 之后的修复没进包」）。',
  '附带事实：`game/dist/core/*.js` 11 个文件在窗口内被重建到 **05:36:15**（晚于 `src/core/battle.ts` 05:33:29、`syso_host.ts` 05:34:38）→ **网页现在跑的就是带在途单挑代码的 dist**。挂死如果不止在测试里，玩家点开战斗就会卡；这条必须有人真机点一次。');
rep('| 2 | **重建 `game/dist/core/*.js`**（等 1 修完再跑 `npm run build`） | dist 停在 04:38:16，比 src 旧 55 min；不重建，网页/出包里永远看不到 R81 之后的修复（0.5h） |',
  '| 2 | **修完 B0 后重建 dist + 真机点一次战斗**（`npm run build` → 核对 11 个 js mtime → 打开 web 打一场） | dist 已重建到 05:36:15、含在途单挑代码；若死循环不只在测试里，网页会卡在战斗（0.5h） |');
rep('、`dist/core` 比 `src` 旧 55 分钟；', '、而 `dist/core` 已在 05:36:15 把这份代码打进网页；');
fs.writeFileSync(f, s, 'utf8');
console.log('ok', s.length);
