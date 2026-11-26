# -*- coding: utf-8 -*-
"""R226b：新局沒有重置時間/戰報 —— 用戶「開新的一局，直接進來已經第二年」。

原因：
- `GameState.initCampaign({fresh})` 只清 `owned/cities/seeded` 與局內戰後鍵（R214），**沒把 `month` 歸 1**；
- 戰報是獨立 localStorage 鍵 `sanguo_battlelog_v1`（`BATTLE_LOG_KEY`），新局照樣讀回上一局那 40 條；
- 時鐘 `clockT/clockPaused` 是 `CampaignRoot` 的實例欄位，新局沿用上一局剛歸零的 T。

修法：
1. `initCampaign()` 的 keyChanged 分支加 `save.month = 1;`（新局必從 1 月起算；年份仍由劇本錨點算）。
2. `CampaignRoot.start()` 認到 `freshRun` 時：清 `sanguo_battlelog_v1`、`clockT=3600 / clockAcc=0 / clockPaused=true`、清 `arrivedNoticed/stationNoticed`。
"""
import io

G = r'F:\sanguo\game\cocos\assets\scripts\GameState.ts'
g = io.open(G, encoding='utf-8').read()
old = """    clearRunScoped(save);
  }"""
new = """    clearRunScoped(save);
    // [R226b] 新局必須從 1 月起算：`month` 是存檔欄位，不歸 1 的話新局會接上一局的月份
    // （用戶實測：開新局進來已經是「第 2 年 1 月」）。年份由劇本起始年 + month 現算，不用另清。
    save.month = 1;
  }"""
assert g.count(old) == 1, 'initCampaign anchor missing'
g = g.replace(old, new, 1)
io.open(G, 'w', encoding='utf-8', newline='\n').write(g)
print('GameState patched')

C = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(C, encoding='utf-8').read()

anchor = "    const freshRun = consumeFreshStart();"
assert s.count(anchor) == 1, 'freshRun anchor missing'
s = s.replace(anchor, """    const freshRun = consumeFreshStart();
    // [R226b] 新局把「時間 / 戰報 / 對峙記錄」一併歸零，否則會沿用上一局的年份、戰報與時鐘。
    if (freshRun) {
      try {
        sys.localStorage.removeItem(BATTLE_LOG_KEY);
      } catch {
        // 原生 localstorage 不可用時忽略：下面 `this.battleLog` 也會清
      }
      this.battleLog = [];
      this.clockT = 3600;
      this.clockAcc = 0;
      this.clockPaused = true;
      this.arrivedNoticed.clear();
      this.stationNoticed.clear();
    }""", 1)
io.open(C, 'w', encoding='utf-8', newline='\n').write(s)
print('CampaignRoot patched')

# 版本 3.4
B = r'F:\sanguo\game\cocos\native\engine\android\app\build.gradle'
b = io.open(B, encoding='utf-8').read()
b2 = b.replace('versionCode 23', 'versionCode 24').replace('versionName "3.3"', 'versionName "3.4"')
io.open(B, 'w', encoding='utf-8', newline='\n').write(b2)
print('bumped', b != b2)
