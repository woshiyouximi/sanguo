| Execute | 名称 | 分类 | v4 说落在哪 | 实际状态写入 | 原作证据 | 裁决 |
|---|---|---|---|---|---|---|
| 1 | 降敵士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale | dis:0x44D529 | **有** |
| 2 | 降敵士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale | dis:0x44D567 | **有** |
| 3 | 降敵士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale（−12） | dis:0x44D5A5 | **有** |
| 4 | 鼓舞士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale | dis:0x44D5E4 | **有** |
| 5 | 鼓舞士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale | dis:0x44D623 | **有** |
| 6 | 鼓舞士氣 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale | dis:0x44D662 | **有** |
| 7 | 亂陣 | 戰中 | battle.ts:1536（v4；實測 1641） | strategy.ts:applyOp→敵兵散開+formation 0 | dis:0x44D6A9 | **有** |
| 8 | 太公陣 | 戰中 | battle.ts:1536（v4；實測 1641） | strategy.ts:applyOp→己兵收攏+formation 0 | dis:0x44D6E3 | **有** |
| 9 | 擾亂敵將 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D717（原作置 0x1000/±1） | **有·代理** |
| 10 | 擾亂敵將 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D74B（原作置 0x1000/±2） | **有·代理** |
| 11 | 擾亂敵將 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D77F（原作置 0x1000/±3） | **有·代理** |
| 12 | 減少疲勞 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D7B3（原作置 0x1000/−1） | **有·代理** |
| 13 | 減少疲勞 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D7E7（原作置 0x1000/−2） | **有·代理** |
| 14 | 減少疲勞 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:84→g.tire（settle 讀） | dis:0x44D81B（原作置 0x1000/−3） | **有·代理** |
| 15 | 增加體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→hp_max（+15） | dis:0x44D8A0（原作 +20% maxHp） | **有** |
| 16 | 增加體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→hp_max（+25） | dis:0x44D8F5（原作 +35% maxHp） | **有** |
| 17 | 增加體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→hp_max（+40） | dis:0x44D92F（原作 +50% maxHp） | **有** |
| 18 | 增加技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mp_max（+12） | dis:0x44D9A2（原作 +25% mpMax） | **有** |
| 19 | 增加技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mp_max（+20） | dis:0x44DA15（原作 +40% mpMax） | **有** |
| 20 | 增加技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mp_max（+30） | dis:0x44DA88（原作 +60% mpMax） | **有** |
| 21 | 增強攻擊 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（+10） | dis:0x44DAE8 | **有** |
| 22 | 增強攻擊 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（+20） | dis:0x44DB0F | **有** |
| 23 | 增強攻擊 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（+30） | dis:0x44DB36 | **有** |
| 24 | 強化士兵 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（−10） | dis:0x44DB5D | **有** |
| 25 | 強化士兵 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（−20） | dis:0x44DB84 | **有** |
| 26 | 強化士兵 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | strategy.ts:applyOp→army.atkMod（battle.ts:1335 讀）（−30） | dis:0x44DBAB | **有** |
| 27 | 混亂敵軍 | 戰中 | battle.ts:1233（v4；實測 1335） | strategy.ts:applyOp→army.atkMod ±5 | dis:0x44DBD2 | **有** |
| 28 | 混亂敵軍 | 戰中 | battle.ts:1233（v4；實測 1335） | strategy.ts:applyOp→army.atkMod ±10 | dis:0x44DC0A | **有** |
| 29 | 混亂敵軍 | 戰中 | battle.ts:1233（v4；實測 1335） | strategy.ts:applyOp→army.atkMod ±15 | dis:0x44DC42 | **有** |
| 30 | 離間計 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:87→g.loyal（settle→capture 讀）（−8） | dis:0x44DC7A | **有** |
| 31 | 離間計 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:87→g.loyal（settle→capture 讀）（−15） | dis:0x44DCB8 | **有** |
| 32 | 離間計 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:87→g.loyal（settle→capture 讀）（−25） | dis:0x44DCF6 | **有** |
| 33 | 勸降 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:persuade→army.flags 0x400+g.loyal−15 | dis:0x44DD40-0x44DE3F（原作只置 0x400） | **有·代理** |
| 34 | 後選出陣 | 一次性 | project/94 §5（battle.ts:1590 派發、只日誌） | 無（只 push 0x491900 成功） | dis:0x44DE44-0x44DE58（763-768 行） | **阻塞** |
| 35 | 恢復體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:hp_regen→army.hpRegen=40/flags 1 | dis:0x44DE5A（+0x88=40） | **有** |
| 36 | 恢復體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:hp_regen→army.hpRegen=60/flags 1 | dis:0x44DE9F（+0x88=60） | **有** |
| 37 | 恢復體力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:hp_regen→army.hpRegen=80/flags 1 | dis:0x44DEE4（+0x88=80） | **有** |
| 38 | 恢復技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:mp_regen→army.mpRegen=30/flags 2 | dis:0x44DF29（+0x88=30） | **有** |
| 39 | 恢復技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:mp_regen→army.mpRegen=50/flags 2 | dis:0x44DF6E（+0x88=50） | **有** |
| 40 | 恢復技力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:mp_regen→army.mpRegen=70/flags 2 | dis:0x44DFB3（+0x88=70） | **有** |
| 41 | 強化武將 | 戰中 | battle.ts:1233（v4；實測 992/1335） | strategy.ts:applyOp→army.generalAtk=10/flags 0x200 | dis:0x44E007 | **有** |
| 42 | 強化武將 | 戰中 | battle.ts:1233（v4；實測 992/1335） | strategy.ts:applyOp→army.generalAtk=15/flags 0x200 | dis:0x44E03E | **有** |
| 43 | 強化武將 | 戰中 | battle.ts:1233（v4；實測 992/1335） | strategy.ts:applyOp→army.generalAtk=20/flags 0x200 | dis:0x44E075 | **有** |
| 44 | 十面埋伏 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises_effects.ts:no_retreat→敵 army.flags 0x4 | dis:0x44E09D（有馬則破解） | **有** |
| 45 | 詐敗 | 戰中 | battle.ts:1607（v4；實測 1713） | strategy.ts:applyOp→army.flags（battle.ts:1687/1713/1715 讀）（mayRetreat 0x8） | dis:0x44E0FE | **有** |
| 46 | 保護主將 | 戰中 | battle.ts:1461（v4；實測 1566） | strategy.ts:applyOp→flags 0x10+takenMul 0.75 | dis:0x44E129（原作只置 0x10） | **有** |
| 47 | 包圍敵軍 | 戰中 | battle.ts:1407（v4；實測 1512） | strategy.ts:applyOp→army.posture+moveMul（battle.ts:1512 讀）（我方 3/1.15、敵方 2/0.9） | dis:0x44E154 | **有** |
| 48 | 偷襲敵軍 | 戰中 | battle.ts:1407（v4；實測 1512） | strategy.ts:applyOp→army.posture+moveMul（battle.ts:1512 讀）（寫成我方 1.2；原作寫敵方 +0x68=4） | dis:0x44E188（方向相反） | **有·代理** |
| 49 | 逼近敵軍 | 戰中 | battle.ts:1407（v4；實測 1512） | strategy.ts:applyOp→army.posture+moveMul（battle.ts:1512 讀）（我方 1/1.1） | dis:0x44E1A8 | **有** |
| 50 | 快速集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→army.qiTier+1 | dis:0x44E1C8 | **有** |
| 51 | 快速集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→army.qiTier+2 | dis:0x44E20A | **有** |
| 52 | 快速集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→army.qiTier+3 | dis:0x44E24B | **有** |
| 53 | 增加經驗 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod exp_bonus（+15%） | dis:0x44E28D（+0x3c=30） | **有** |
| 54 | 增加經驗 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod exp_bonus（+25%） | dis:0x44E2BE（+0x3c=50） | **有** |
| 55 | 增加經驗 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod exp_bonus（+40%） | dis:0x44E2EF（+0x3c=100） | **有** |
| 56 | 金蟬脫殼 | 戰中 | battle.ts:1607（v4；實測 1715） | strategy.ts:applyOp→army.flags（battle.ts:1687/1713/1715 讀）（fleeAnytime 0x40） | dis:0x44E320 | **有** |
| 57 | 化解計策 | 戰中 | battle.ts:1590（v4 §5；實測 tickStrategy） | wises_effects.ts:dispel→敵 army.seq=null | dis:0x44E34B（原作只 push 491ac4） | **有·代理** |
| 58 | 喝阻敵軍 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale（−4）+ 戰中抽 10% | dis:0x44E361（foeGen+0x44/−10%） | **有** |
| 59 | 喝阻敵軍 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale（−6）+ 戰中抽 15% | dis:0x44E3F4 | **有** |
| 60 | 喝阻敵軍 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→sides[].morale（−9）+ 戰中抽 25% | dis:0x44E472 | **有** |
| 61 | 保留氣力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod qi_cost（−20%） | dis:0x44E53D（+0x88=66） | **有** |
| 62 | 保留氣力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod qi_cost（−30%） | dis:0x44E575（+0x88=50） | **有** |
| 63 | 保留氣力 | 戰前 | wises.ts:SPECS（v4 §2 R69；applySpec 293-338） | wises.ts:applySpec→mod qi_cost（−45%） | dis:0x44E5AC（+0x88=25） | **有** |
| 64 | 封武將技 | 戰中 | battle.ts:1762（v4；實測 1978） | strategy.ts:applyOp→army.flags=0x100（battle.ts:1978 讀） | dis:0x44E5E5 | **有** |
| 65 | 減緩集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→敵 army.qiTier−1 | dis:0x44E63A | **有** |
| 66 | 減緩集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→敵 army.qiTier−2 | dis:0x44E679 | **有** |
| 67 | 減緩集氣 | 戰中 | battle.ts:1711（v4；實測 2073 tickSkills） | strategy.ts:applyOp→敵 army.qiTier−3 | dis:0x44E6B7 | **有** |
