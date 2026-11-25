# 探针页归档（project/115 发布卫生）

任务要求把 `game\web\_bgprobe.html` / `game\web\_genprobe.html` 移到本目录。

**核对结果：这两个文件在本次任务开始时就已经不在树里了**，全库 `**/*probe*.html` 只剩
`work\gen_sprites\probe_pages.html`、`work\gen_sprites\probe_weapon.html`、`work\saves70\dom_probe.html`
三处（都不在发布目录 `game\web\` 下），`game\web\` 里一个 probe 页都没有。

所以这里做的是**可逆归档**：把还活着的证据（两张探针截图）、还活着的生成器（`_mkprobe.py`）、
以及同类探针页的可运行副本收在一起，并把他们各自断言过什么记录下来 —— 这样「以后想复现」
不用再去猜。

## 清单

| 文件 | 原来在哪 | 现在是什么 |
| --- | --- | --- |
| `_bgprobe.png` | `work\_bgprobe.png` | `_bgprobe.html` 的截图（页面本体已不存在） |
| `_genprobe.png` | `work\_genprobe.png` | `_genprobe.html` 的截图（页面本体已不存在） |
| `_mkprobe.py` | `work\_mkprobe.py` | 原件副本：生成 `game\web\_probe_{items,deploy}.html` 的探针注入器 |
| `probe_pages.html` | `work\gen_sprites\probe_pages.html` | 动画图集逐页加载探针（副本；只把 `../../game/web/` 改成 `../../../game/web/`，因为归档后深了一层） |
| `probe_weapon.html` | `work\gen_sprites\probe_weapon.html` | 武器/身体图元叠加探针（同上，4 处路径各多一层 `../`） |

`work\saves70\dom_probe.html` 属于同一个「用完即弃」家族，但它在 `work\` 下、不在发布目录里，
也不是本任务的交付物，**没动**。

## 它们原来各断言什么

### 1. `_bgprobe.html`（截图 `_bgprobe.png`，900×400）
从截图逐字复原，它读的是背景图预加载器的内部状态：

```
elapsed=8101ms
readyCount=12 / 12        ← 12 张背景图全部预加载完成
ready7=true               ← 第 7 号背景（floor07）可用
probe:probe onload 256x256 ← 探针图真的解码出来了，尺寸 256×256
url=assets/bg/orig/floor07.png
```

断言：**背景图 12/12 全部 load 成功、floor07 能解码出 256×256**。顺带暴露了一个
事实：当时的首屏资源预热要 **8.1 秒**（`elapsed=8101ms`）—— 这是「首屏路径长」的原始证据。

### 2. `_genprobe.html`（截图 `_genprobe.png`，1100×300）

```
elapsed=8100ms
ready=true
state=general atlas: ok base=anim/general/ pages=35 frames=3270
index.json HTTP 200 bytes=309137
```

断言：**`anim/general/index.json` 能 200 拿到（309137 字节）、能解析成 35 页 / 3270 帧、
游戏状态里 `state=general atlas: ok`**。同样是 8.1s 预热。

> 这两页的 `elapsed` 都在 8100ms 左右，不是巧合：它们都是「等 GameData + 图集 ready 再报数」
> 的页面，8.1s 就是当时（无缓存冷启动）的 ready 时间。

### 3. `_probe_items.html` / `_probe_deploy.html`（由 `_mkprobe.py` 生成）

`_mkprobe.py` 读 `game/web/items.html` 与 `game/web/deploy.html`，在 `</head>` 前插一段探针脚本，
写到 `game/web/_probe_items.html` / `_probe_deploy.html`（注释原话：「截完图即删」）。探针做的事：

- 顶部插一条 `#__errbox`：**全绿 = `PROBE ALL CLEAR`，全红 = `PROBLEM`**；
- `addEventListener('error', …, true)` 抓两类失败：`<img>` 404（`imgFail`）与 JS 抛错（`jsErr`）；
- `unhandledrejection` 也计入 `jsErr`；
- 在 `DOMContentLoaded+2500ms`、`2600ms`、`3500ms` 各打印一次
  `PROBE ALL CLEAR|PROBLEM  jsErr=N imgFail=N rows=<.irow, .grid .it, .pick .it 的数量>`。

断言：**页面加载后无 JS 错误、无裂图、列表真的渲染出行（rows>0）**。这三条正好是
「道具页/编成页一改就白给」的三个老坑。

### 4. `probe_pages.html` / `probe_weapon.html`（动画图集）

- `probe_pages.html`：`fetch('…/anim/general/index.json')`，把 `pages[*].file` 逐张 load，
  输出 `pages=N failed=M` + 每页 `file unit OK|FAIL WxH first=<sprite>`，并把每页首帧拼成 contact sheet。
  断言：**图集每页都能加载、尺寸非 0、首帧名对得上**。
- `probe_weapon.html`：核对 5 个具名图元 `A1W10001 / A1A10006 / A1A10007 / B1W20001 / D1W40001`
  是否都在图集里（不在就是 `NOT-IN-ATLAS`），并把 `L1A10007`（身体）+ `A1A10007`（武器）
  按 `ox/oy` 叠在一起画一次。断言：**武器图元存在、且锚点 `ox/oy` 对齐**。

## 怎么复现

### A. 动画图集两页（不碰 `game\web\`，随便跑）

```powershell
cd F:\sanguo
python -m http.server 5180
# 打开 http://127.0.0.1:5180/work/release/probe_pages/probe_pages.html
#      http://127.0.0.1:5180/work/release/probe_pages/probe_weapon.html
```

根目录必须是 `F:\sanguo`（页面里写的是 `../../../game/web/…`，从 `work/release/probe_pages/` 往上三层）。

### B. items / deploy 探针（会临时往 `game\web\` 写文件，必须清干净）

```powershell
cd F:\sanguo
python work\release\probe_pages\_mkprobe.py        # 生成 game\web\_probe_items.html / _probe_deploy.html
cd game; node web\serve.mjs                        # http://127.0.0.1:5173/web/_probe_items.html
# 截图/看完以后立刻：
Remove-Item F:\sanguo\game\web\_probe_items.html, F:\sanguo\game\web\_probe_deploy.html
```

探针必须和老页面**同目录**（它要 `./audio.js`、`./items_model.js`、`assets/…` 这些相对路径），
所以不能把它搬到别处跑 —— 这也是它一直是个「生成 → 截图 → 删除」的一次性工具的原因。

**别忘最后一步**：`game\web\` 里留下任何 `*probe*` 都会让
`node web\release_check.mjs` 的 C1 直接 FAIL（这是故意的，见 `project/115_发布卫生.md`）。

### C. `_bgprobe.html` / `_genprobe.html`

页面本体已不在树里，`work\*.py|*.ps1|*.mjs` 里也搜不到 `bgprobe|genprobe`（生成脚本当年没留下来），
**无法原样重跑**。要重建等价断言，最小做法是照上面第 1、2 节的字段写一段 5 行脚本去读同样的两个内部状态：

```js
// 背景：断言 12/12 ready + floor07 解码 256×256
// 图集：断言 anim/general/index.json 200 / pages=35 / frames=3270
```

（也就是 `_bgprobe.png` / `_genprobe.png` 里逐字记录的那几个数。）

## 为什么必须搬出 `game\web\`

`game\web\` 是发布目录：`serve.mjs` 的 ROOT 就是 `game\`，`/web/` 下的一切都会被一起发布。
探针页里含内部实现细节（预加载器字段名、图集结构、错误条），既不该给玩家，也不该被当成产品页。
搬走以后 `release_check.mjs` 的 C1/C2 会一直守着这条线。

## 恢复原状

本目录没有删除/覆盖任何原件：`_mkprobe.py`、两张 png 都是从 `work\` 复制来的，
`work\gen_sprites\probe_*.html` 原件也还在原处。要撤销这次归档，直接删掉整个
`work\release\probe_pages\` 即可，`game\web\` 与 `work\` 都不会受影响。
