STATUS: 制作人叫停（不要出包）——本包在叫停指令到达前已构建并上传，无法撤回；此后不再触发任何微信构建/上传。

**事实摘要（供下轮参考）**
- 构建 18:04:30 完成（`build Task (wechatgame) Finished`，exit 0，42s）→ `dist\wechat-upload`
- 瘦身：png 181→134（47 张转 webp-q92），png 字节 7,843,570→4,238,522（−46.0%）
- 体积 **20,698,952 B = 19.74 MiB**（<20 MiB，余量 272,568 B）；主包 2.72 MB/27 文件，分包 17.97 MB/3029 文件
- 校验：`verify_pkg` PASS、`check_audio_cdn` PASS、`scan_utf8` 618 files 0 BAD
- **已上传 0.2.2**（18:05:53，`√ upload`，AppID wxf631d432ca7abcee，CLI TOTAL 13.3 MB / 13,978,811 B）
- 该包取自 HEAD `5dfbc2f`（R232b），**不含 R233/R234**；要下架只能人工走微信公众平台

# 微信小游戏 0.2.2 出包报告

**STATUS: 制作人叫停（不要出包）**

> 叫停指令（lead 转达制作人，2026-11-26 18:11:49）：「以后在我说要出微信包以前，不要再出微信包」。
> 执行情况：收到指令后**未再运行任何微信构建 / 上传 / 重试**，产物目录 `dist\wechat-*` 原样保留。
> **但构建与上传在叫停前已经完成**（构建产物 18:04:42 完成，上传 18:05:53 返回 `√ upload`），
> 无法从 CLI 撤回；如需下架/整改，只能到微信公众平台后台人工处理。以下为如实记录。

## 0. 一句话结论

- 包已完成：`F:\sanguo\dist\wechat-upload`，**20,698,952 B = 19.74 MiB**（目标 < 20 MiB，余量 272,568 B）。
- 瘦身完成：png 181 → 47 张转 webp，剩 134 张；png 字节 7,843,570 → 4,238,522（-46.0%）。
- 上传已完成（叫停前）：`√ upload`，`-v 0.2.2`，CLI 报表 **TOTAL 13.3 MB / 13,978,811 B**。
- 校验全过：`verify_pkg` PASS（image native bad=0、import 缺=0）、`check_audio_cdn` PASS、`scan_utf8` 0 BAD。
- **包对应源码**：HEAD `5dfbc2f`（S-053 R232b）时的构建（18:04），**不含之后的 R233/R234**；当前 HEAD 已到 `c7e4f05`（S-056）。

## 1. 时间线（2026-11-26）

| 时间 | 事件 |
|---|---|
| 17:54、18:03 | 两次源码门禁 `sync_core3.mjs --diff-only`：相同 27 / 差异 0（构建时工作树干净，HEAD=5dfbc2f） |
| 18:03 起 | 等待其他 agent 的 Cocos Android 构建释放 CocosCreator 进程 |
| 18:04:02 | 启动 `build_wechat.ps1`（构建日志 wechatgame_20261126_180402.log） |
| 18:04:30 | Cocos 日志出现 `build Task (wechatgame) Finished in (17 s)` —— 构建真正结束 |
| 18:04:32–18:04:44 | 瘦身（slim_png.py webp 模式）完成，脚本 `✅ 出包成功`，退出码 0，总耗时 42s |
| 18:04:42 | `dist\wechat-upload` 最后写入时间（产物冻结） |
| 18:05:32 | 微信 CLI 启动 IDE server（log 显示 `√ IDE server started successfully`） |
| 18:05:53 | CLI 输出 `√ upload`，上传成功 |
| 18:11:49 | 收到制作人叫停指令，此后无任何微信构建/上传动作 |

## 2. 版本号 0.2.2 落点（重要）

仓库里**没有**微信包版本号配置文件，逐处排查：
- `game\cocos\package.json` 的 `"version": "3.8.0"` 是 Creator 工程版本，不是游戏版本；
- `game\cocos\settings\v2\packages\project.json`、`game\cocos\profiles\v2\**` 只有分辨率/编辑器设置，无版本；
- 全扫 `game\cocos`（排除 library/temp/build/native）无任何 `0.2.x` 字符串；
- 包内 `project.config.json`、`game.json` 均无 version 字段；
- 对照 0.2.1：当时也只是 CLI 参数 `-v 0.2.1`（证据 `work\slim\upload2.log`，TOTAL 13.2 MB / 13,883,495 B）。

因此按任务书兜底条款，**没有改任何文件**，0.2.2 只体现在上传动作上：
```
-v 0.2.2 -d "0.2.2 R232: time flow + arrival siege + equip inventory; slim+audio embedded"
```
注意：`tools\upload_wechat.ps1` 里硬编码默认 `-Version "0.1.0"`，本次未使用该脚本（其管道方式会卡住），也未改它（在允许写范围外）。如果以后要固定版本号，建议在 `project.config.json` 增加版本字段，或统一上传脚本的版本参数来源。

## 3. 构建

命令（工作目录 `F:\sanguo`）：
```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -Audio embed -Slim -SkipWeb
```
- `-Audio embed`：109 个 mp3 打进 `subpackages/res`，离线可播、不静音；
- `-Slim`：自动调 `tools\slim_png.py --mode webp --min-gain 0.10 --webp-max-rgb-diff 6.0 -MinBytes 10240 -Quality 92`；
- `-SkipWeb`：跳过 web-mobile，省时间。

结果：退出码 0，耗时 42s，脚本结尾 `✅ 出包成功：F:\sanguo\dist\wechat-upload`。
「Cocos CLI 真结束」判据（已满足）：
```
F:\sanguo\work\build-logs\wechatgame_20261126_180402.log
2026-11-26 18:04:30 - debug: ================================ build Task (wechatgame) Finished in (17 s)ms ================================
```
构建脚本自身体积表：主包 2.60 MB < 4 MB；res 分包 17.14 MB；合计 19.74 MB < 30 MB（embed 上限）。

## 4. 瘦身

- 源资源：181 张 png / 7,843,570 B；109 个 mp3 / 6,298,093 B。
- 处理：47 张 png 转 webp-q92（重建色差 ≤ 6.0，最小增益 10%），删原 png、改 import json `fmt 0→4`。
- 结果：png 181 → 134 张；png 字节 7,843,570 → 4,238,522（省 3,605,048 B，46.0%）。
- 报告：`F:\sanguo\work\build-logs\slim_20261126-180432.txt`。

## 5. 最终体积与组成（`F:\sanguo\dist\wechat-upload`）

- **磁盘占用合计 20,698,952 B = 19.74 MiB**（< 20 MiB = 20,971,520 B，余量 272,568 B），文件 3056 个。
- 主包（扣除 subpackages）= 2,725,350 B / 27 文件；分包 `subpackages\` = 17,973,602 B / 3029 文件。

| 扩展名 | 张数 | 字节 | 说明 |
|---|---|---|---|
| .png | 136 | 2,704,840 | 分包 res 内 134 张 / 2,678,862 B；根 logo.png 14,496 + slogan.png 11,482 |
| .webp | 1257 | 6,691,808 | 全部在 `subpackages\res\native` |
| .mp3 | 109 | 6,298,093 | 全部在 `subpackages\res\native`（embed 模式） |
| .js | 14 | 2,570,106 | 主包+分包脚本 |
| .json | 1538 | 2,167,342 | import/config/asset |

对照 0.2.1：总 20,603,256 B（19.65 MiB）→ 本次 +95,696 B，仍在 20 MiB 内。

## 6. 校验证据

- `node work\map_ide\verify_pkg.js dist\wechat-upload`（独立复跑，EXIT=0）：
  - internal：image native ok=0 bad=0，import 缺=0
  - main：image native ok=0 bad=0，import 缺=0
  - res：`config=config.ef49b.json paths=2915 uuids=2916 types=[...]`，**image native ok=1391 bad=0**，**import 缺=0**
  - `总计：image native ok=1391 bad=0，import 缺=0` / `RESULT: PASS`
- `check_audio_cdn`：包内 native 音频 109/109、编译清单 109 键齐全、包内无 audio-remote.json、base 为空 → PASS。
- `game.json` 无 BOM，已声明 `subpackages/res/`，`subpackages\res\game.js` 存在。
- `node work\enc\scan_utf8.mjs`：`scan: 618 files, 0 BAD, 14 allowlisted / 16554 hits, 4 WARN, 604 clean -> OK`，EXIT=0（4 条 WARN 都是既有 work/fidelity 与 `game/web/city_selftest.mjs` 的 BOM 提示，非本次引入）。

## 7. 上传记录

- 命令（经 `Start-Process cmd /c` 执行，日志重定向到文件，避免管道卡住）：
  ```
  "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" upload --project "F:\sanguo\dist\wechat-upload" -v 0.2.2 -d "0.2.2 R232: time flow + arrival siege + equip inventory; slim+audio embedded"
  ```
- 日志：`F:\sanguo\work\wechat_022\upload_022.log`（1115 B，写完于 18:05:53）。
- 关键输出：
  - `√ IDE server started successfully, listening on http://127.0.0.1:46032`
  - `√ Using AppID: wxf631d432ca7abcee`
  - 表格：`TOTAL 13.3 MB / 13,978,811 B`、`main 2.6 MB / 2,697,356 B`、`/subpackages/res/ 10.8 MB / 11,281,455 B`
  - `√ upload`
- 结论：**上传成功**（版本 0.2.2，AppID wxf631d432ca7abcee）。仅完成 CLI upload（后台上传版本），未做提交审核操作；能否撤回取决于微信后台，CLI 无取消接口。
- 过程中的坑（非上传失败）：
  - 首次写 `.cmd` 用了 LF 换行，cmd 解析失败（退出码 255 / 9009，`'l' is not recognized...`），无日志、未发起上传；改 GBK(cp936)+CRLF 后正常。
  - PowerShell `Start-Process -Wait` 会等 CLI 拉起的 IDE 子进程，日志写完（`√ upload`）后外层仍挂着；确认 cmd.exe 已退出后终止了等待中的后台 job，未影响上传结果。

## 8. 叫停后的处置（本次收到指令后）

1. 未再运行任何微信构建、CLI、上传、重试；`dist\wechat-upload` 与 `dist\wechat-*` 保留不动（当物料）。
2. 本报告按指令补充到 `F:\sanguo\work\wechat_022\REPORT.md`，并在开头标注 `STATUS: 制作人叫停（不要出包）`。
3. 清理：删除了探针文件 `work\wechat_022\test1.log`（内容 `hello`）；仓库根 0 字节 `webp` 文件是我测试重定向误建，已被其他 agent 的 R234 提交 `934e57d` 顺带收进仓库，随后 S-056 `c7e4f05` 删除，工作树现已干净（`git status` 为空）。
4. 未改 `game\src\**`、`game\cocos\assets\scripts\**`、`project\**`、`tools\**`；未 `git add/commit`；未动 `dist\android\*.apk`。

## 9. 不确定 / 需要下轮注意

1. **包与当前源码不同步**：包构建于 18:04（HEAD `5dfbc2f` / S-053 R232b，当时工作树干净）；此后其他 agent 又提交了 R233（`09663b2`）、R234（`934e57d`）、S-056（`c7e4f05`）。**0.2.2 的包不含 R233/R234**，若后续需要包含这些改动，必须重新构建上传（但按叫停指令，须等制作人明确说「出微信包」）。
2. **上传版本的撤回**：0.2.2 已作为上传版本进微信后台，CLI 无法取消/删除；如需下架或覆盖，需人工在微信公众平台处理，或以后再用新版本号上传覆盖。
3. **版本号无单一配置源**：0.2.2 只由 CLI `-v` 与备注体现；`tools\upload_wechat.ps1` 默认 `-Version "0.1.0"` 与本次不一致（未使用、未修改）。建议以后确定版本号唯一来源。
4. **CLI 报表口径**：CLI 报 TOTAL 13.3 MB（13,978,811 B），与磁盘 19.74 MiB（20,698,952 B）不一致（0.2.1 时同样是 13.2 MB vs 19.65 MiB）；推测 CLI 统计的是压缩传输体积或含/不含某些文件，未深究，不影响上传成功与包体达标判断（微信后台以 CLI 校验为准，本次通过）。
5. **日志位置**：构建/瘦身日志由脚本自身写入 `work\build-logs\`，超出「只写 work\wechat_022」的字面范围，但这是 `build_wechat.ps1` 的既有行为，未额外新增目录。
6. **Cocos 构建缓存**：Cocos 构建会正常读写 `game\cocos\library`、`temp`，未改 `assets\scripts` 与 `game\src`。

## 10. 关键文件

- 包：`F:\sanguo\dist\wechat-upload`（3056 文件，20,698,952 B）
- 上传日志：`F:\sanguo\work\wechat_022\upload_022.log`
- 上传脚本：`F:\sanguo\work\wechat_022\upload_022.cmd`
- 构建日志：`F:\sanguo\work\wechat_022\build_022.log`、`F:\sanguo\work\build-logs\wechatgame_20261126_180402.log`
- 瘦身报告：`F:\sanguo\work\build-logs\slim_20261126-180432.txt`
