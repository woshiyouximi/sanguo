// [R231] 裝配與背包的唯一性：一件東西只能掛在一個武將身上。
//
// 現象（制作人實機回報）：背包裡給 A 武將裝上刀，刀還留在背包裡，可以再給 B 裝一次；
// 切到 B 時背包不清、同一把刀同時出現在兩個人身上。
//
// 根因：`ItemsPanel.setEquip()` 舊寫法不管「裝」還是「卸」最後都 `this.bag.add(seq)`，
// 等於裝上去的同時又放回背包。現在：裝 → `bag.delete(seq)`（並先把別人身上的同件摘掉），
// 卸 → `bag.add(seq)`。
//
// 這一支測試用「源碼契約」釘住行為，避免又被改回去（面板是 Cocos 組件，單獨跑不起來）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'cocos/assets/scripts/ItemsPanel.ts');

function source(): string {
  return readFileSync(SRC, 'utf8');
}

/** 取出 `private setEquip(` 起的函式本體（到同縮排的 `}` 為止）。 */
function setEquipBody(src: string): string {
  const start = src.indexOf('private setEquip(');
  assert.ok(start >= 0, 'ItemsPanel.ts 裡找不到 setEquip()');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error('setEquip() 本體沒找到結尾');
}

test('R231 裝上去要從背包移除：setEquip 的「裝」分支有 bag.delete(seq)', () => {
  const body = setEquipBody(source());
  assert.match(body, /this\.bag\.delete\(seq\)/, '裝上裝備後必須把 seq 從背包刪掉');
});

test('R231 不可以再無條件 bag.add(seq)：舊 bug 的寫法不能回來', () => {
  const body = setEquipBody(source());
  // 舊寫法：setEquipsOf(...) 之後緊接一行無條件 `this.bag.add(seq);`
  assert.doesNotMatch(
    body,
    /this\.setEquipsOf\(name,\s*[^)]*\);\s*\n\s*this\.bag\.add\(seq\);/,
    'setEquipsOf 之後不該無條件把 seq 放回背包',
  );
});

test('R231 卸下才回背包：setEquip 的「卸」分支有 bag.add(seq)', () => {
  const body = setEquipBody(source());
  const elseIdx = body.indexOf('} else {');
  assert.ok(elseIdx >= 0, 'setEquip 應該有 on / else 兩條分支');
  assert.match(body.slice(elseIdx), /this\.bag\.add\(seq\)/, '卸下裝備要把 seq 放回背包');
});

test('R231 同一件不能同時掛兩個人：裝之前先掃其他武將並摘掉', () => {
  const body = setEquipBody(source());
  assert.match(body, /Object\.keys\(this\.save\.equip/, '要掃 save.equip 的所有武將');
  assert.match(body, /equippedSlot\(table, seq\)/, '要用 equippedSlot 判斷別人身上有沒有同一件');
  assert.match(body, /this\.setEquipsOf\(owner, unequipSlot\(table, found\)\)/, '要把別人身上的同件摘掉');
});

test('R231 換掉本槽原有裝備時，舊的那件要回背包', () => {
  const body = setEquipBody(source());
  assert.match(
    body,
    /if \(typeof current === 'number' && current !== seq\) this\.bag\.add\(current\);/,
    '本槽原本那件（current）要被放回背包',
  );
});

test('R231 背包顯示跟著背包走：entries() 仍然只列 bag 內的件', () => {
  const src = source();
  assert.match(
    src,
    /return seq !== null && this\.bag\.has\(seq\);/,
    'entries() 要把不在背包（已被別人裝上）的件過濾掉，切武將才會自動刷新列表',
  );
});
