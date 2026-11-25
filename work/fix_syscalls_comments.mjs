// 一次性修复：syscalls.ts 被 GBK 往返破坏后，有些注释把后面的代码行吞进了注释。
// 破坏形态是 U+FFFD + "?" + 若干空格，这里把它还原成"句号 + 换行 + 缩进"。
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'F:/sanguo/game/src/core/smartscript/syscalls.ts';
let text = readFileSync(path, 'utf8');

// 注释行尾吞掉了 6 空格缩进的代码行
text = text.replace(/\uFFFD\?\s{6}/g, '。\n      ');
// 文件头注释里吞掉了 " *" 续行
text = text.replace(/\uFFFD\? \*/g, '。\n *');
// 剩下的孤立损坏标记（都是注释里的标点）
text = text.replace(/\uFFFD\?/g, '，');

writeFileSync(path, text, 'utf8');
console.log('remaining U+FFFD:', (text.match(/\uFFFD/g) ?? []).length);
