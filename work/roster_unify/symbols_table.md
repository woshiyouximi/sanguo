# roster.ts 頂層符號差異表（自動生成）

- web 源：`game/src/core/roster.ts`
- cocos 鏡像：`game/cocos/assets/scripts/core/roster.ts`
- 統計：共 75 個頂層符號｜實現相同 24｜實現不同 27｜只 web 有 5｜只 cocos 有 19

> 判定口徑：去掉註釋行、壓縮空白後逐字比較（註釋差異不算實現不同）。

| 符號 | 可見性 | web 行 | cocos 行 | 狀態 |
|---|---|---|---|---|
| `DEAD` | export | 41 | 30 | 實現相同 |
| `RELEASED` | export | 57 | 46 | 實現相同 |
| `RosterRaw` | private | — | 59 | 只 cocos 有 |
| `ENEMY_HELD` | export | 68 | 56 | 實現相同 |
| `PostBattle` | export | 71 | — | 只 web 有 |
| `ApplyCapturesResult` | export | 74 | — | 只 web 有 |
| `ApplyPostBattleResult` | export | 79 | — | 只 web 有 |
| `RawRoster` | private | 85 | — | 只 web 有 |
| `rawRoster` | private | 90 | 61 | 實現不同（詞元 +2/-3） |
| `cityList` | private | 95 | 66 | 實現不同（詞元 +1/-1） |
| `cityKeys` | private | 104 | 75 | 實現不同（詞元 +1/-1） |
| `deadNames` | export | 113 | 84 | 實現不同（詞元 +4/-1） |
| `movedOf` | export | 126 | 97 | 實現不同（詞元 +3/-0） |
| `isDead` | export | 133 | 104 | 實現不同（詞元 +4/-1） |
| `releasedNames` | export | 145 | 116 | 實現相同 |
| `isReleased` | export | 151 | 122 | 實現相同 |
| `removeFromPools` | export | 163 | 134 | 實現不同（詞元 +8/-5） |
| `releaseFromPools` | export | 197 | 169 | 實現不同（詞元 +8/-5） |
| `applyCapturesToRoster` | export | 219 | 197 | 實現不同（詞元 +2/-5） |
| `markDefectedCapture` | export | 267 | 243 | 實現不同（詞元 +4/-11） |
| `applyPostBattle` | export | 304 | 280 | 實現不同（詞元 +5/-4） |
| `GENERAL_RECORD_MAX` | export | — | 318 | 只 cocos 有 |
| `GeneralRecordRow` | export | — | 321 | 只 cocos 有 |
| `EquipNames` | export | — | 327 | 只 cocos 有 |
| `saveBox` | private | — | 334 | 只 cocos 有 |
| `objectAt` | private | — | 339 | 只 cocos 有 |
| `mapAt` | private | — | 344 | 只 cocos 有 |
| `hasKey` | private | — | 348 | 只 cocos 有 |
| `SurrenderTier` | export | 358 | 507 | 實現相同 |
| `intOrNull` | private | — | 359 | 只 cocos 有 |
| `SurrenderDecision` | export | 361 | 510 | 實現不同（詞元 +2/-2） |
| `SurrenderCard` | export | 364 | 536 | 實現不同（詞元 +2/-0） |
| `equipText` | private | — | 366 | 只 cocos 有 |
| `generalRecordOf` | export | — | 379 | 只 cocos 有 |
| `SurrenderOpts` | export | 389 | 559 | 實現不同（詞元 +1/-0） |
| `noteGeneralResult` | export | — | 399 | 只 cocos 有 |
| `SurrenderResult` | export | 407 | 575 | 實現相同 |
| `moraleOf` | export | — | 418 | 只 cocos 有 |
| `tireOf` | export | — | 426 | 只 cocos 有 |
| `TIER_TEXT` | private | 427 | 588 | 實現相同 |
| `KING_TEXT` | private | 432 | 594 | 實現相同 |
| `KING_REASON` | private | 433 | 595 | 實現相同 |
| `NO_ROLL` | private | 436 | 598 | 實現不同（詞元 +3/-3） |
| `equipNamesOf` | export | — | 440 | 只 cocos 有 |
| `WINNER` | private | 441 | 603 | 實現不同（詞元 +3/-6） |
| `GeneralRow` | private | 443 | 468 | 實現不同（詞元 +4/-6） |
| `KingsRow` | private | 452 | — | 只 web 有 |
| `numOf` | private | 454 | 605 | 實現相同 |
| `generalLevelOf` | export | — | 458 | 只 cocos 有 |
| `clampInt` | private | 459 | 610 | 實現相同 |
| `nameListOf` | private | 463 | 614 | 實現相同 |
| `kingsInScenario` | export | 469 | 620 | 實現不同（詞元 +5/-4） |
| `staticEquipOf` | private | — | 471 | 只 cocos 有 |
| `surrenderCardExtras` | export | — | 481 | 只 cocos 有 |
| `rowOf` | private | 484 | 640 | 實現不同（詞元 +0/-1） |
| `statOf` | private | 494 | 650 | 實現不同（詞元 +5/-2） |
| `cardOf` | private | 514 | 667 | 實現不同（詞元 +5/-1） |
| `SurrenderCardExtras` | export | — | 518 | 只 cocos 有 |
| `kingCardOf` | private | 556 | 711 | 實現不同（詞元 +6/-1） |
| `surrenderCandidates` | export | 590 | 744 | 實現不同（詞元 +14/-11） |
| `needSurrenderPanel` | export | 638 | 786 | 實現不同（詞元 +3/-8） |
| `dropPending` | private | 647 | 792 | 實現不同（詞元 +7/-7） |
| `applySurrender` | export | 665 | 810 | 實現不同（詞元 +15/-9） |
| `rememberReleased` | private | 752 | 899 | 實現不同（詞元 +3/-2） |
| `BattleOutcome` | export | 792 | 947 | 實現相同 |
| `AiDisposalAction` | export | 812 | 967 | 實現相同 |
| `AiDisposalEntry` | export | 814 | 969 | 實現相同 |
| `AiDisposalInput` | export | 819 | 974 | 實現相同 |
| `AiDisposalResult` | export | 832 | 987 | 實現相同 |
| `readBattleOutcome` | export | 852 | 1007 | 實現相同 |
| `decideBattleWon` | export | 882 | 1037 | 實現相同 |
| `ourForceNames` | export | 906 | 1061 | 實現相同 |
| `markEnemyHeld` | export | 935 | 1090 | 實現相同 |
| `planAiDisposal` | export | 962 | 1117 | 實現相同 |
| `applyAiDisposal` | export | 991 | 1146 | 實現相同 |

## 只看「實現不同」的符號

- `rawRoster`（web:90 / cocos:61）實現不同（詞元 +2/-3）
- `cityList`（web:95 / cocos:66）實現不同（詞元 +1/-1）
- `cityKeys`（web:104 / cocos:75）實現不同（詞元 +1/-1）
- `deadNames`（web:113 / cocos:84）實現不同（詞元 +4/-1）
- `movedOf`（web:126 / cocos:97）實現不同（詞元 +3/-0）
- `isDead`（web:133 / cocos:104）實現不同（詞元 +4/-1）
- `removeFromPools`（web:163 / cocos:134）實現不同（詞元 +8/-5）
- `releaseFromPools`（web:197 / cocos:169）實現不同（詞元 +8/-5）
- `applyCapturesToRoster`（web:219 / cocos:197）實現不同（詞元 +2/-5）
- `markDefectedCapture`（web:267 / cocos:243）實現不同（詞元 +4/-11）
- `applyPostBattle`（web:304 / cocos:280）實現不同（詞元 +5/-4）
- `SurrenderDecision`（web:361 / cocos:510）實現不同（詞元 +2/-2）
- `SurrenderCard`（web:364 / cocos:536）實現不同（詞元 +2/-0）
- `SurrenderOpts`（web:389 / cocos:559）實現不同（詞元 +1/-0）
- `NO_ROLL`（web:436 / cocos:598）實現不同（詞元 +3/-3）
- `WINNER`（web:441 / cocos:603）實現不同（詞元 +3/-6）
- `GeneralRow`（web:443 / cocos:468）實現不同（詞元 +4/-6）
- `kingsInScenario`（web:469 / cocos:620）實現不同（詞元 +5/-4）
- `rowOf`（web:484 / cocos:640）實現不同（詞元 +0/-1）
- `statOf`（web:494 / cocos:650）實現不同（詞元 +5/-2）
- `cardOf`（web:514 / cocos:667）實現不同（詞元 +5/-1）
- `kingCardOf`（web:556 / cocos:711）實現不同（詞元 +6/-1）
- `surrenderCandidates`（web:590 / cocos:744）實現不同（詞元 +14/-11）
- `needSurrenderPanel`（web:638 / cocos:786）實現不同（詞元 +3/-8）
- `dropPending`（web:647 / cocos:792）實現不同（詞元 +7/-7）
- `applySurrender`（web:665 / cocos:810）實現不同（詞元 +15/-9）
- `rememberReleased`（web:752 / cocos:899）實現不同（詞元 +3/-2）
