# -*- coding: utf-8 -*-
"""R225b：时钟在走时，右下按钮不能还是「內 政 終 了」（点了会把 T 重置、白等一年）。"""
import io
import re

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()

# 1) doAction('advance')：时钟在走时忽略（原作里这颗按钮只属于内政场景）
old = """    if (kind === 'advance') {
      // [F4] 內政終了 = 推進一年（web `campaign.html:2517-2533 endMonth()` → `advanceMonth(12)`）。
      // 舊碼這裡只走一個月（`GameState.advanceMonth` 一次），原生包因此「按月推進」，
      // 用戶實測抱怨的就是這點。全年推進的逐月結算搬到 `endInterior()`。
      this.endInterior();
      return;
    }"""
new = """    if (kind === 'advance') {
      // [R225] 原作這顆按鈕只屬於內政場景（`0x41BBF5`：T 重設 3600 後切回大地圖）。
      // 時鐘在走（不在內政）時點它 → 忽略，否則會把 T 歸零、白等一年。
      if (!this.clockPaused) {
        this.hintText = this.clampHint('時間正在流動：等內政時間到了再處理內政。', 160);
        this.refresh();
        return;
      }
      this.endInterior();
      return;
    }"""
assert old in s, 'advance branch anchor missing'
s = s.replace(old, new, 1)

# 2) bottomActions：右侧那颗按钮的文案按「时钟是否停」切换
old2 = "        title: '內 政 終 了',"
count = s.count(old2)
assert count > 0
s = s.replace(old2, "        title: this.clockPaused ? '內 政 終 了' : '時 間 流 動',")
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('patched CampaignRoot, bottomActions hits =', count)

# 3) 版本号 3.1（单独文件，避免命令行引号）
G = r'F:\sanguo\game\cocos\native\engine\android\app\build.gradle'
g = io.open(G, encoding='utf-8').read()
g = g.replace('versionCode 20', 'versionCode 21')
g = g.replace('versionName "3.0"', 'versionName "3.1"')
io.open(G, 'w', encoding='utf-8', newline='\n').write(g)
print('bumped gradle')
