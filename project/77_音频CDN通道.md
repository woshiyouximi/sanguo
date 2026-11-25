# 77 · 音频 CDN 通道（R83）

> 一句话：**10 首 BGM + 99 个音效（109 档 / 16.07 MB）不再进微信包**，改从 CDN 拉；包里只留一份 549 B 的
> `assets/bundles/res/audio-remote.json` 当开关。开关不填 = **静音但绝不崩**，填了 = 有声而包仍是 **15.82 MB**。

出包前后对比（同一台机、同一份工程）：

| | 音频在包内（`-Audio embed`） | 本轮（默认 `-Audio cdn`） |
|---|---|---|
| 主包 | 1.99 MB | **1.99 MB**（28 档） |
| `subpackages\res` | 27.9 MB 量级 | **13.83 MB**（2839 档） |
| 合计 | **31.88 MB** ✗ 超 20 MB | **15.82 MB** ✓（2867 档） |
| 音频 16.07 MB | 占配额 | 在 `dist\audio-cdn\`，上传 CDN，**0 配额** |

---

## 1. 改了什么

### 1.1 构建侧 `tools\build_wechat.ps1`（592 行，UTF-8 **with BOM**）

| 位置 | 内容 |
|---|---|
| `:44-47` | 头部注释换成三种音频模式的说明（原先写「音效默认剔除 9.2 MB / 102 个」已过时） |
| `:74` | 新参数 `[ValidateSet('cdn','none','embed')][string]$Audio = 'cdn'` |
| `:81` | `$script:AudioMode = if ($KeepAudio) { 'embed' } else { $Audio }`（`-KeepAudio` 保留为 `embed` 的别名） |
| `:83` | `$script:AudioExts = @('.mp3','.ogg','.wav','.m4a','.aac')`（剔除按扩展名做，不再写死 mp3） |
| `:155-175` | `$script:AudioPruned` / `Remove-UnusedAudio`；`:159` guard 改成 `if ($script:AudioMode -eq 'embed') { return }` |
| `:177` | `ConvertTo-JsonString`（只转义 `\` 与 `"`，够用且不引入 `ConvertTo-Json` 的格式化差异） |
| `:181` | `Get-Sha256Hex`（`SHA256.Create()` + `File.OpenRead` + `BitConverter.ToString().Replace('-','').ToLowerInvariant()`） |
| `:192-277` | **`Write-AudioCdn`**：枚举工程源目录 → 拷到 `dist\audio-cdn\` → 手拼 manifest 文本 → 同时写 `dist\audio-cdn\audio-manifest.json` 与 `包根\audio-manifest.json` |
| `:390-398` | 2.5 段：`embed` 保留音频并提示「20 MB 上限必超」；`cdn`/`none` 一律剔除，`remote` 模式连 `dist\cdn\remote` 一起剔 |
| `:401-411` | **2.6 段（新）**：`-Audio cdn` 时 `Step '音频 CDN'` → `Write-AudioCdn -AudioRoot …\res\audio -RelRoot …\res -PackageRoot $out` → 打印清单/目录两行 |
| `:449-453` | 原有体积校验不变（主包 < 4 MB、整体 < 20 MB） |
| `:509-517` | **新校验**：cdn 模式必须有 `dist\audio-cdn` 非空 + 包根 `audio-manifest.json`，否则 `Fail`；通过则打印 `✓ 音频清单 N 档 / X MB` |
| `:518-526` | **新校验**：`AudioMode -ne 'embed'` 时扫 `$out` 全树，只要有音频扩展名文件就 `Fail ("包里还残留 N 个音频文件：剔除没生效")`；通过则打印 `✓ 包内无音频文件` |
| `:539-543` | 体积表新增 `音频 CDN（不在包内）… 上传到 dist\audio-cdn，不占配额`（**不计入合计**）；`none` 模式退回旧的「（已剔除音效）」一行，不再重复两行 |
| `:552` | 产物段新增 `音频 CDN : F:\sanguo\dist\audio-cdn` |
| `:573-582` | 下一步新增 CDN 四步块 + 「不填 base / 不传 CDN = 静音，但绝不会崩」 |

三种模式语义：

| `-Audio` | 包内音频 | `dist\audio-cdn\` | 用途 |
|---|---|---|---|
| `cdn`（默认） | 剔除 | **生成**（109 档 + manifest） | 现在这条发布路 |
| `none` | 剔除 | 不生成 | 只想出个安静的小包 / 临时排障 |
| `embed` | **保留** | 不生成 | 本地对照；合计 31.88 MB，`:452` 会按 20 MB 上限 `Fail`（预期行为） |

> 兼容性：`-Mode upload` 的出包行为没变（仍是「主包 + subpackages/res」），只是多写了 manifest 与 CDN 目录；
> `-Mode preview` / `-Mode remote` 的老路径不受影响。

### 1.2 运行侧

**`game\cocos\assets\scripts\AudioBus.ts`**（490 行）

| 位置 | 内容 |
|---|---|
| `:121-131` | 新增 `export function audioPath(kind: 'sfx' \| 'bgm', name: string): string` —— 逻辑路径的**唯一拼法**（`audio/sfx/hit01`、`audio/bgm/04`），同时也是 manifest 的键；注释里写明「改这里等于改远端清单键」 |

**`game\cocos\assets\scripts\AudioHost.ts`**（595 行）

| 位置 | 内容 |
|---|---|
| `:17-35` | 头部加 CDN 段说明；import 增 `JsonAsset`、`assetManager`、`type Asset`、`audioPath`、`getResBundle`/`type Bundle` |
| `:50` / `:52` | `export const AUDIO_REMOTE_JSON = 'audio-remote'`、`AUDIO_MANIFEST_JSON = 'audio-manifest.json'` |
| `:134` | `AudioHostOptions.remoteBase?: string`（`undefined`=读包内配置；`''`=强制包内；URL=显式覆盖，探针用） |
| `:175` / `:189` | `private readonly remoteBase: string \| null`；ctor 里 `typeof opts.remoteBase === 'string' ? normalizeRemoteBase(...) : null` |
| `:181` | `stats` 增 `remote`（CDN 取到的档数）与 `base`（生效的 CDN 根，空=包内） |
| `:264` `:292` `:325` `:345` | `playBattleAmbience` / `playSfx` / `preload` / `playBgm` 四处拼路径改走 `audioPath()` |
| `:445-468` | `loadClip` 重写：**CDN 优先 → 失败回退包内 → 绝不 reject**，末尾一定写负缓存并清 pending 队列 |
| `:483-595` | 新增「CDN 远端加载」整节：`AudioRemoteFile`/`AudioRemoteManifest` 类型、模块级 `remote{base,manifests,warned}`、`normalizeRemoteBase:507`、`audioRemoteUrl:512`、`resetAudioRemote:520`、`warnRemoteOnce:527`、`readRemoteBase:534`、`loadBundleClip:542`（失败**完全静默**）、`loadAudioBase:552`、`ensureAudioBase:563`、`parseManifest:568`、`ensureManifest:583`、`loadRemoteAsset:599`、`loadRemoteClip:617` |

加载时序（全部 Promise，不阻塞任何帧）：

```
playSfx/preload/playBgm
   └─ getClip(path) ─ 未缓存? ─> loadClip(path)
                                   ├─ base = remoteBase ?? ensureAudioBase()   // 读包内 audio-remote.json
                                   ├─ base 空 ──────────────> loadBundleClip(path)         // 包内，失败=null 静默
                                   └─ base 非空 ─> ensureManifest(base)  // <base>/audio-manifest.json，每 base 一次
                                                     ├─ 命中清单 ─> <base>/<清单里的 path>
                                                     ├─ 清单缺失 ─> <base>/<逻辑名>.mp3
                                                     └─ 远端失败 ─> 回退 loadBundleClip(path) → 也失败就 null
```

要点：

* **`remoteBase` 的来源只有一个**：`game\cocos\assets\bundles\res\audio-remote.json`（进 `res` bundle，运行时
  `bundle.load('audio-remote', JsonAsset)`）。**没有这个文件 / `base` 为空 → 直接走包内**，一次网络都不发。
* manifest 只在**远端**拉（包根那份是给构建期核对的），这样你在 CDN 上重命名文件只需改 manifest，不必重新出包。
* manifest 缺失/格式不对时按 `<base>/<逻辑名>.mp3` 拼，仍然能响 —— **manifest 是可选优化，不是硬依赖**。
* 每次失败只 `console.warn` 一次（`warned` 集合去重），不刷屏、不抛异常。
* 全程 `.then` 链，**没有 async/await**（规避 Cocos Babel 的 regenerator 风险）；也没有 `for (const x of cond ? A : B)` 这类会踩 Babel 的写法。

**新建 `game\cocos\assets\bundles\res\audio-remote.json`**（549 B）

```json
{
  "base": "",
  "_readme": "CDN 音频根地址。留空 = 走包内 resources（当前出包已剔除音频 → 静音，但绝不报错、不卡战斗）。要开 CDN：…（四步说明）"
}
```

### 1.3 探针（`work\audio_cdn\`）

| 文件 | 作用 |
|---|---|
| `build_sim.cjs`（1.9 KB） | 用 `ts.transpileModule`（TS 5.9.3 @ `F:\sanguo\game\node_modules\typescript`）把 `AudioBus.ts` / `AudioHost.ts` / `DataLoader.ts` 转成 CommonJS 到 `_sim\`。**不用 `tsc -p`**：`AudioBus` 的 `import type './core/battle'` 会把整个 `core/` 拉进 program，而探针只需要这三个文件 |
| `_sim\node_modules\cc\index.js` | 手写引擎桩：`Asset/AudioClip/JsonAsset/Component/Node/AudioSource/assetManager{getBundle,loadBundle,loadRemote}` + 控制面 `__setBundle/__setRemote/__clip/__json/__calls/__log`。异步一律 `setTimeout(…,0)`，`assetManager.loadRemote` 逐条记录 `{url, ext}` |
| `remote_probe.cjs`（11.9 KB） | 47 条断言，分 P0–P4 五段（见 §7.2） |
| `key_check.cjs` | 交叉核对：代码里硬编码点名的音效名 / BGM 曲号，是否都在 manifest 里 |

---

## 2. manifest 样例（`dist\wechat-upload\audio-manifest.json`，10,786 B）

```json
{
  "version": 1,
  "bundle": "res",
  "source": "assets/bundles/res/audio",
  "count": 109,
  "bytes": 16851271,
  "files": {
    "audio/bgm/03": {"path":"audio/bgm/03.mp3","bytes":980950,"sha256":"e32ff5ae9b6c"},
    "audio/bgm/04": {"path":"audio/bgm/04.mp3","bytes":2651115,"sha256":"b3d0d2e1e758"},
    "audio/bgm/05": {"path":"audio/bgm/05.mp3","bytes":2141204,"sha256":"30c27e71b123"},
    "audio/bgm/06": {"path":"audio/bgm/06.mp3","bytes":2025848,"sha256":"6fa18031cd7f"},
    "audio/bgm/10": {"path":"audio/bgm/10.mp3","bytes":975516,"sha256":"62ffffdbe1d0"},
    …共 109 条，末尾 "audio/sfx/yell04": {"path":"audio/sfx/yell04.mp3","bytes":5016,"sha256":"1460f4e8698c"}
  }
}
```

* 键 = 运行时逻辑路径（`audioPath()` 的产物）；`path` = 相对 CDN 根的路径；`sha256` 只取前 12 位，够人眼比对/脚本抽检。
* **无时间戳**，所以两次构建的 manifest 字节完全一致：本轮连跑两次，`sha256 = DE975DC045FFB4EF9C803456FCAC2985859A81C2746F953CE9E7CE08D39AD3AF`（改前改后相同 = 幂等）。
* 同一份内容写两处：`dist\audio-cdn\audio-manifest.json`（要上传的那份）与 `dist\wechat-upload\audio-manifest.json`（构建期核对用）。

## 3. `dist\audio-cdn\`（可直接整目录上传）

```
dist\audio-cdn\
├─ audio-manifest.json        10,786 B
└─ audio\
   ├─ bgm\   03.mp3 04.mp3 05.mp3 06.mp3 10.mp3 11.mp3 12.mp3 13.mp3 14.mp3 17.mp3
   └─ sfx\   99 个 *.mp3（hit01/hit02/defense/death/death3/yell01-04/horse01-02/bg03a…/m000snd01…）
```

* 文件数 **110**（109 mp3 + 1 manifest），合计 **16,862,057 B = 16.08 MB**；其中 mp3 部分 **16,851,271 B = 16.07 MB**。
* 目录结构 = **相对 `assets/bundles/res` 的路径**，所以 `audio\` 与 `audio-manifest.json` 原样铺到 CDN 根即可，
  运行时拼出来的 URL 与目录一一对应。
* **为什么从工程源目录拷、不从构建产物拷**：构建产物里音频叫 `assets\res\native\<uuid前2>\<uuid>.<hash>.mp3`，
  哈希名不可读、每次构建还会变；源目录名才是稳定的逻辑名。

## 4. 出包三个数字（最终一次，36 s，`EXIT=0`）

```
主包（扣除分包/CDN）           1.99 MB        28
subpackages\res               13.83 MB      2839  微信分包
合计                          15.82 MB      2867
音频 CDN（不在包内）          16.07 MB       109  上传到 dist\audio-cdn，不占配额
限额：主包 ≤ 4 MB，总计 ≤ 20 MB。

✅ 出包成功：F:\sanguo\dist\wechat-upload
```

校验段全绿：主包 1.99 MB < 4 MB ✓ / 整体 15.82 MB < 20 MB ✓ / game.json 首字节 0x7B ✓ /
分包声明 ✓ / `subpackages\res\game.js` ✓ / **音频清单 109 档 ✓ / 包内无音频文件 ✓**。

另外确认 `audio-remote.json` 真的进了 bundle：
`subpackages\res\config.5f8c7.json` 里有 `["audio-remote",0,1]` 条目，载荷在
`subpackages\res\import\b8\b81ff5a3-dd93-418f-8a6e-0baf94c9941f.25cbf.json`（632 B，`cc.JsonAsset`，name=`audio-remote`）。

## 5. 四步操作（上传 CDN → 填地址 → 重新出包 → 验证）

1. **上传**：把 `F:\sanguo\dist\audio-cdn\` 里的 **`audio\` 目录** 与 **`audio-manifest.json`** 原样传到 CDN 根，
   例 `https://cdn.your.com/sanguo/audio-cdn/`。保持 `audio/sfx/*.mp3`、`audio/bgm/*.mp3` 层级；
   建议 `Cache-Control: max-age=31536000`（文件名不含哈希，但音频内容基本不变；换了音频就换目录或改 base）。
2. **填地址**：`game\cocos\assets\bundles\res\audio-remote.json` → `"base": "https://cdn.your.com/sanguo/audio-cdn"`
   （末尾斜杠可有可无，`normalizeRemoteBase` 会归一）。
3. **重新出包**：`powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -SkipWeb`
   —— base 是运行时从包里读的，**改完必须重新构建**；构建会顺带刷新 `dist\audio-cdn\`（可选重新上传）。
4. **验证**：微信公众平台 → 开发设置 → **「downloadFile 合法域名」加上 CDN 域名**（不加则 `wx.downloadFile` 直接失败）→
   微信开发者工具「预览」→ 进战斗应听到 BGM 与打击音；Network 面板应看到
   `GET <base>/audio-manifest.json` 与一串 `<base>/audio/sfx/*.mp3`。若只有 manifest 没有 mp3，
   多半是域名白名单没配或 CDN 上路径层级不对。

## 6. 完全不改 = 静音，但绝不崩

`base` 留空（当前状态）时逐层降级，**没有任何一条路径会抛异常或阻塞战斗**：

1. `ensureAudioBase()` 读包内 `audio-remote` → `base` 是 `''` → **一次网络请求都不发**；
2. 直接 `loadBundleClip(path)` → `bundle.load(...)` 失败（音频已被剔除）→ **静默** `resolve(null)`，连 `console.warn` 都不打；
3. 结果写进 `clips` 负缓存（`null`），同一路径不会反复重试；`stats.missing` 记一笔，仅此而已；
4. 战斗侧调用是 `this.audio?.playSfx(...)` 这类同步丢弃：没有 `await`、没有 Promise 冒泡到帧逻辑，
   所以打击音缺失不影响 `pump()`、不影响回合推进、不影响结算；
5. 只有显式配了非空 `base` 才会 `console.warn` 一类的远端失败日志（且每条只一次）。

所以「先上传包、CDN 以后再说」是安全的；反过来「CDN 挂了」也只是回到静音（远端失败会先回退包内，包内也没有才静音）。

## 7. 验收证据

### 7.1 构建

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE
Get-Process CocosCreator* | Stop-Process -Force          # 不先杀，构建 5 秒内静默失败
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -SkipWeb
# → ✅ 出包成功：F:\sanguo\dist\wechat-upload    EXIT=0  elapsed=36s
# 日志：F:\sanguo\work\build-logs\wechatgame_20261125_052537.log
```

### 7.2 mock 探针：**47 条断言，失败 0 条**

```powershell
cd F:\sanguo\work\audio_cdn
node build_sim.cjs          # 编译真产物到 _sim\（AudioBus/AudioHost/DataLoader）
node remote_probe.cjs       # → ALL PASS: 47 条断言
```

| 段 | 条数 | 断言了什么 |
|---|---|---|
| P0 URL 拼法（纯函数） | 6 | `normalizeRemoteBase` 去空白/去尾斜杠、空 base 归一为空、`audioRemoteUrl` 拼接、base 为空只回相对路径、`audioPath('sfx','hit01')==='audio/sfx/hit01'`、`audioPath('bgm','04')==='audio/bgm/04'` |
| P1 `remoteBase: ''`（走包内） | 11 | 生效 base 为空 / 包内载入路径正确 / **0 次 remote 请求** / 缓存命中真播 / 缺档首声不出声 / 负缓存为 `null` / 第二次记 `stats.missing` / **缺档不刷 warn（0 条）** / 8 声部 / 10 个 AudioSource（8 声部 + BGM + 底噪） |
| P2 不传 `remoteBase`（读包内配置） | 5 | 配置里的 base 生效并归一 / **先取 `<base>/audio-manifest.json`** / 清单 404 → 退回 `<base>/audio/sfx/hit01.mp3` / `stats.remote===1` / 清单失败只 warn 一次 |
| P3 显式 base（跑清单） | 14 | 第一个请求就是清单 / base 归一 / **URL = base + '/' + 清单里的 path**（清单里故意写 `hit01.v2.mp3`，实取到 `…/audio/sfx/hit01.v2.mp3` = 证明走的是清单不是硬拼）/ 清单只拉一次 / 走 CDN 时不读包内同路径 / 清单缺键回退 `base + 逻辑名.mp3` 且**不重拉清单** / BGM `audio/bgm/04` → `…/audio/bgm/04.v2.mp3` 并接到 `bgmVoice.source.clip` / CDN 缺档**回退包内并播出** / 失败 URL 只 warn 一次 / 回退不污染 `stats.remote` |
| P4 声部池与节流 | 11 | `voices.length===8` / 10 个 AudioSource / 10 次播放全部落到 AudioSource / 用到的声部数 ≤ 8 / 节点恰为 `Voice0..Voice7` / **同名 60 ms 内只响一次** / 预算耗尽后的声音被丢弃 / 一帧 5 个事件（命中 1 + 阵亡 2 + 离场 2）/ **`pump` 每 tick 只放 2 声** / 一帧 5 事件时有 3 声被预算挡掉 / `dispose` 后 root 已销毁 |

探针里 3 条 `console.warn` 全是**预期**的失败路径样本（清单 404、清单格式不对、`hit02` 的 404），不是异常。

### 7.3 类型检查

```powershell
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# → tsconfig.check.json: exit 0（TypeScript 5.9.3）
```

### 7.4 名字覆盖交叉核对

```powershell
node F:\sanguo\work\audio_cdn\key_check.cjs
# manifest 键总数 109 / 代码点名音效 44 → 命中 44 缺 0 / 代码点名 BGM 3 → 命中 3 缺 0 / KEYCHECK PASS
```

（余下 62 档不是漏，而是由 `playBgm(track)`、`playSfx(动态名)` 从别的调用点点名；清单保留全部 109 档就是
为了「不管谁点都能命中」。）

## 8. 没做到的

1. **没在微信开发者工具 / 真机上验证**。本机是 headless 环境，只到「构建静态校验 + mock 探针」这一层；
   `wx.downloadFile` 真实行为、真机音频解码、`InnerAudioContext` 生命周期都未实测。
2. **downloadFile 合法域名要人工在公众平台配**，脚本无法代劳（配不上就是 404/白名单报错，音频静音）。
3. **`InnerAudioContext` 数量**：8 声部 + BGM + 底噪 = 10 个实例，正好在微信常见的上限附近。若真机报
   `createInnerAudioContext` 失败或声音丢失，把 `AudioHost.ts:28` 的 `VOICES` 从 8 降到 6 即可（节流逻辑不用改）。
4. **首次进战斗有额外延迟**：CDN 走「downloadFile 落临时文件 → 交给 InnerAudioContext」，首声可能晚几百毫秒；
   `BATTLE_PRELOAD` 的 15 档同样是 CDN。没做预下载进度条，也没量化延迟。
5. **运行时不做 sha256 校验**：manifest 里的 `sha256`（前 12 位）目前只给人工/后续脚本比对用，
   `AudioHost` 不会拿它验证下载到的文件（微信端拿到的是临时文件路径，校验需要额外 `FileSystemManager` 异步读，
   本轮没做）。
6. **`dist\audio-cdn\` 不做 prune**：只覆盖/新增，不删旧档。源目录删了某个音效，CDN 目录里的旧文件会留着，
   需要手动清（manifest 的 `count/bytes` 会正确反映当前档数，不会把旧档算进去）。
7. **`-Audio embed` / `-Audio none` 没跑全量构建**：`embed` 会让合计到 31.88 MB，`:452` 必然 `Fail`（预期）；
   只在隔离 fixture 上验过 `Write-AudioCdn` 与剔除分支。默认 `cdn` 路径是本轮唯一跑通的完整构建。
8. **音频没逐档试听**：只核对了「清单键 = 运行时逻辑名」「包内 0 音频」「109 档字节数与源目录一致」，
   没有对 109 个 mp3 做可播放性检查。

## 9. 附：本轮动过的文件

| 文件 | 性质 |
|---|---|
| `tools\build_wechat.ps1` | 改（`-Audio` + `Write-AudioCdn` + 校验/表格/结束语） |
| `game\cocos\assets\scripts\AudioBus.ts` | 改（只加 `audioPath`，:121-131） |
| `game\cocos\assets\scripts\AudioHost.ts` | 改（`remoteBase` + CDN 加载节，:17-35、:50/:52、:134、:175-189、:181、:264/292/325/345、:445-468、:483-595） |
| `game\cocos\assets\bundles\res\audio-remote.json` | **新建**（549 B，`base` 留空） |
| `work\audio_cdn\build_sim.cjs` `_sim\node_modules\cc\index.js` `remote_probe.cjs` `key_check.cjs` | **新建**（探针与桩） |
| `dist\wechat-upload\` `dist\audio-cdn\` | 构建产物（可重建） |

未触碰（按约定）：`game\web\**`、`game\src\**`、其它 `game\cocos\assets\scripts\*.ts`、`CampaignRoot/CityPanel/BattleRoot`、`project\37a|31|44`。
