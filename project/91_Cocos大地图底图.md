# 91 Cocos 大地图底图（微信小游戏）— 定位结论

日期：2026-11-25 06:5x
执行：v1-map-ide
一句话：**底图问题在 `dist\wechat-upload`（06:36 构建，png）上已经不存在——微信 IDE 里 5 次打开全部正常显示羊皮纸地形底图 + 橙红城点；而旧产物 `dist\wechat-fix1`（webp）在同一台机器、同一 IDE、同一套代码下 100% 复现，连 Ctrl+B 重编译都无效。** 所以这不是 `game\cocos` 的代码/资源问题，也不是本次打包产物的落盘问题；上一轮的"仍不显示"针对的是 webp 那一版产物。

---

## 1. 判定链（每条带证据）

### 1.1 静态：包内交付 100% 一致 → 排除「落盘路径 vs config uuid 不一致」

工具：`work\map_ide\verify_pkg.js`（本次新写，只读，逐条解 config 自洽性）。

```
node F:\sanguo\work\map_ide\verify_pkg.js F:\sanguo\dist\wechat-upload --map > work\map_ide\verify_upload.txt
node F:\sanguo\work\map_ide\verify_pkg.js F:\sanguo\dist\wechat-fix1   --map > work\map_ide\verify_fix1.txt
```

两个包**都是** `image native ok=1398 bad=0，import 缺=0`，`RESULT: PASS`。

地图 7 张图的完整链路（都被脚本逐字节落到磁盘确认）：

| 包 | config 条目 | uuid | versions.native hash | 落盘文件 | 大小 |
|---|---|---|---|---|---|
| wechat-upload | `paths[279]=map/chinamap` | `2ba0c303-1e0a-4f21-a961-88e23e13cdbb` | `8fd4d` | `subpackages\res\native\2b\2ba0c303-….8fd4d.png` | 1,434,685 B |
| wechat-fix1 | `paths[828]=map/chinamap` | `886f99fb-e2b7-4644-9dd8-1573715a4076` | `63720` | `subpackages\res\native\88\886f99fb-….63720.webp` | 239,924 B |

另外 6 张（两包相同）：`map/city_1` 785 B、`city_2` 1,273 B、`city_3` 1,701 B、`city_4` 2,300 B、`map/point` 197 B、`bg/map_bg` 599,443 B，**全部 png、全部存在**。

⇒ 注意 `wechat-fix1` 那一版**也是自洽的**：报错串里那个 `...native/88/886f99fb-….63720.webp` 就在磁盘上、大小正确、import json 也在（`import\88\886f99fb-….ba492.json`，72 B，`{"fmt":"4"}` = webp）。
⇒ **「uuid 与落盘不一致」这条假设对两个产物都不成立**，可以彻底划掉。

### 1.2 错误产生点：不是解码，是「文件存在性判断」

- `F:\sanguo\dist\wechat-upload\engine-adapter.js`（20,342 B，单行）：
  ```js
  var e=window.fsUtils, r=e.exists; ...
  function x(t,e,n){ r(t,function(e){ e?n(null,t):n(new Error("file ".concat(t," does not exist!"))) }) }
  ```
  这是 `file ... does not exist!` 在全链上**唯一的产生点**，它先用 `fsUtils.exists(路径)` 判断，false 就抛错。
- `F:\sanguo\dist\wechat-upload\web-adapter.js`（90,055 B，单行，`exists` 在偏移 ~86900）：
  ```js
  exists:function(e,t){o.access({path:e,success:function(){t&&t(!0)},fail:function(){t&&t(!1)}})}
  ```
  `o` 是 `wx.getFileSystemManager()`。⇒ 判据就是 `wx.getFileSystemManager().access({path})` 的 fail 分支。
- 后续 `[ArtLayer] load('map/chinamap') 失敗，回退佔位：Bundle res doesn't contain map/chinamap` 是**第二次**尝试（SpriteFrame 兜底）的报错，不是独立故障。

⇒ 结论：坏的是「微信侧读这个包内文件」这一步，**不是 `ImageAsset` 解码**（解码失败不会走到这条错误）。

### 1.3 动态 A/B（决定性证据，GDI 截屏）

| 时间 | 打开的工程 | 结果 | 截图 |
|---|---|---|---|
| 06:39 | `work\map_ide\pkg_fresh`（`dist\wechat-upload` 的整包 robocopy 副本，2962 文件 / 20,167,477 B） | **完全正常**：羊皮纸地形底图 + 全部橙红城点 + 道路 + 城名（控制台 ✖2 ⚠1） | `work\map_ide\shots\f01_boot.png` |
| 06:44 | `dist\wechat-upload`（原路径） | **完全正常** | `work\map_ide\shots\f04_upload_oldpath.png` |
| 06:46 | `dist\wechat-upload` 再开 | **完全正常** | `work\map_ide\shots\f06_sash.png` / `f07_errfilter.png` |
| 06:47 | `dist\wechat-preview`（资源内嵌口味） | **完全正常**（✖0 ⚠1） | `work\map_ide\shots\f05_preview.png` |
| 06:50 | `dist\wechat-fix1`（webp 时代） | **复现**：只有城名 + 极淡虚线道路，无底图、无城点（✖4 ⚠3） | `work\map_ide\shots\f08_fix1_webp.png` |
| 06:51 | 同上，按 **Ctrl+B 重新编译**后 | **仍复现**（控制台可见 `res doesn't contain map/chinamap`） | `work\map_ide\shots\f09_fix1_recompile.png` |
| 06:55 | `dist\wechat-upload` 再开（最终留档，IDE 现停在此工程） | **完全正常** | `work\map_ide\shots\f10_upload_final.png` |

⇒ 「同一个 IDE、同一天、同一个 `CampaignRoot.ts`/`ArtLayer.ts`：旧产物必坏、新产物必好」。差异只在那一张图的 **uuid + 扩展名（webp→png）**。

命令行（可复现）：
```
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' open --project 'F:\sanguo\dist\wechat-upload' --port 46032
（等约 18 s，看右侧模拟器）
```

### 1.4 为什么旧产物会「文件在包里、access 却 false」——[推测]，未定死

已排除的：
- `project.config.json` 里**没有** `packOptions.ignore`（两包逐字节看过）；
- `game.json` 分包声明一致（`{"name":"res","root":"subpackages/res/"}`）；
- native / import / uuid / hash 四者一致（1.1）；
- 路径长度、目录层级与其它 png 完全相同（都是 `subpackages/res/native/xx/<36位uuid>.<5位hash>.ext`）。

唯一的相关性：**fix1 里大地图屏那 7 张图，只有 `map/chinamap` 是 webp，其余 6 张全是 png，也都正常**；当前包 7 张全 png，全正常。但 hero 立绘 400 张全是 webp、`bg/policy/palais_*.webp` 也是 webp，而它们在前几轮 IDE 里是能显示的（内政页/编成页截图），所以**不能**推成「webp 普遍读不到」。

⇒ 我的判断（[推测]）：微信 IDE 对该工程的**编译产物/本地文件条目**是文件级缓存的，而这个文件在上一轮被「同名替换过」（webp 内容换过、同名同时长不同哈希），缓存条目陈旧后 `access()` 一直返回 false；Ctrl+B 只重编脚本/不变文件，不重拷该条目，所以免疫。换成新 uuid + png 等于换了一条新路径，缓存里没有旧条目，于是正常。**这条机制无法在旧产物上进一步证实，而且旧产物已被新产物取代，建议不再投入。**

### 1.5 城点图元为什么不显示（连带现象，不是第二个 bug）

`CampaignRoot.ts:900-921` 的城点分支本身**不**依赖底图状态；但底图失败时 `ArtBg.load()` 会 `state='failed'; node.active=false`（`ArtLayer.ts:144-148`），`drawFrame()` 走 no-art 分支把整片地图区涂成纯色块（`CampaignRoot.ts:850-855`）——fix1 截图上那片均匀深蓝灰就是它。城点在这张截图上确实也没出来，但**成因没有单独查清**（fix1 控制台没有 `map/city_*` 的报错，`cityFrames` 应该是拿到的），可能与「底图节点被置 inactive 后同屏重绘时机」有关，属于**已消失的旧产物现象**，新产物上城点正常（见 f01/f04/f10）。[推测]

---

## 2. 改了什么

**没有改任何文件。** 本次只新增了只读工具与证据：

| 路径 | 说明 |
|---|---|
| `work\map_ide\verify_pkg.js` | 新增。分包资源静态体检：config `paths`→`uuids`→`versions.native`→`native/`+`import/` 四段对齐，PASS/FAIL + exit code，可直接当构建后 gate |
| `work\map_ide\verify_upload.txt` / `verify_fix1.txt` | 新增。两个包的体检输出（都 PASS） |
| `work\map_ide\shots\f01,f04,f05,f08,f09,f10_*.png` | 新增。A/B 截屏 |

`game\cocos\assets\scripts\CampaignRoot.ts`、`ArtLayer.ts`、`bundles\res\map\**` **未动**（只读过）。

类型检查（回归确认，非本次改动引起）：
```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   → exit 0
```

为什么不做「备选修法」（SpriteFrame / 显式 loadBundle / 挪进 main / setRect）：失败点经证据定位在 `wx.getFileSystemManager().access()`，`bundle.load(path, SpriteFrame)` 走的是同一条下载/读取链，改了也是同一个 false；重试也没用（fix1 是**确定性**失败，重试只会多打两条 warn）。没有判据支撑的改动会掩盖真因。

---

## 3. 需要 lead 做的事

1. **发布用 `dist\wechat-upload`**（2962 文件 / 20,167,477 B = 19.24 MB；主包 2.02 MB / 分包 17.21 MB；`project.config.json` projectname=`sanguo-vertical`，appid `wxf631d432ca7abcee`）。
   **不要再上传 `dist\wechat-fix1`**——它可以稳定复现底图缺失，属于坏产物，建议归档或删掉以免误传。
2. 复验（本机已跑 5 次，任选其一）：
   - GUI：微信开发者工具打开 `F:\sanguo\dist\wechat-upload`，等编译完成，看「大地图」屏：应有羊皮纸/水墨地形底图 + 橙红城点 + 金色道路 + 城名。
   - CLI：`& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' open --project 'F:\sanguo\dist\wechat-upload' --port 46032`，等 ~18 s。
   - 预期控制台：**不出现** `file ... does not exist!`，**不出现** `[ArtLayer] ... 失敗`，不出现 `Bundle res doesn't contain`。当前实测角标是 ✖2 ⚠1（两条错误与资源无关，见 §4）。
3. 建议补一次**真机预览**（模拟器的分包 FS 实现与真机不同，这是唯一还没覆盖的环境）。
4. 建议把 gate 加进构建脚本（属于 `tools\**`，我没动）：
   `node work\map_ide\verify_pkg.js dist\wechat-upload` → 非 0 就中止上传。它能抓住「config 说 A、磁盘上是 B」这类整包级错配。
5. 若以后又看到 `file ... does not exist!`：先「清缓存 → 重新编译」或把包复制到新目录再开（我实测新目录可绕过）；但对 fix1 这条 Ctrl+B 免疫，说明是文件级陈旧条目，别再花时间追。

---

## 4. 没做到 / 残留

- **微信 IDE 控制台文本没抽出来**。本版布局的控制台面板只有 ~100 px 高，拖分割条（窗口相对 600,848→600,470）三次都拿不到 sash，剪贴板法无效；所以 console 侧证据是**截图**，不是文本。旧文本证据仍在 `work\wechat_ide\logs\v3_console_all.txt`（fix1 时代：`file subpackages/res/native/88/886f99fb-….63720.webp does not exist!`）。
- **`dist\wechat-upload` 那 ✖2 是什么没查明**（`dist\wechat-preview` 只有 ⚠1、✖0），但我已用截图确认大地图渲染完全正常，且与本问题无关。
- **§1.4 的微观原因未定死**（[推测]），只能确认它不是落盘/config 错配，而是微信侧对该文件的读取/存在性判断；旧产物已废弃，无继续取证价值。
- 未逐屏复验 hero（400 张 webp）/ `bg/policy`（webp）在**当前**产物上的表现；未真机。
- 未改 `tools\**`；如需把 gate 接进 `tools\build_wechat.ps1`，由 lead 决定（建议补丁：构建末尾跑 `node work\map_ide\verify_pkg.js dist\wechat-upload`，非 0 则写 `BUILD FAILED` 并不产出上传包）。

---

## 5. 证据/工具清单

| 类型 | 路径 |
|---|---|
| 静态体检（新） | `work\map_ide\verify_pkg.js`、`verify_upload.txt`、`verify_fix1.txt` |
| 截屏 | `work\map_ide\shots\f01_boot.png`（新路径副本·正常）、`f04_upload_oldpath.png`（原路径·正常）、`f05_preview.png`（preview 口味·正常）、`f08_fix1_webp.png`（旧产物·复现）、`f09_fix1_recompile.png`（旧产物 Ctrl+B 后·仍复现）、`f10_upload_final.png`（最终留档） |
| 对比基线 | `work\cocos_verify3\01_campaign.png`（web-mobile 浏览器，本来就正常）、`work\wechat_ide\shots\v3_01_map.png`（fix1 历史实拍，同样缺底图） |
| 引擎侧代码 | `dist\wechat-upload\engine-adapter.js`（`x()`/`fsUtils.exists`）、`dist\wechat-upload\web-adapter.js`（`exists`→`FileSystemManager.access`） |
| 业务代码 | `game\cocos\assets\scripts\CampaignRoot.ts:213-220`（建 ArtBg 并 load）、`:847`（底图 ready 判定）、`:890-921`（城点）、`game\cocos\assets\scripts\ArtLayer.ts:74-117`（loadAsset/loadFrame）、`:142-161`（ArtBg.load 失败即 inactive） |
| 包统计 | `dist\wechat-upload`：png native 188 / webp 1210 / bin 1；`items` 57 png、`map` 6 png、`anim` 34 png、`hero` 400 webp；`config.e1757.json` 221,445 B（paths 2929 / uuids 2930） |
