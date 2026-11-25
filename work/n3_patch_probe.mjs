// 在 probe 副本里给 runtime.ts 打补丁（不动仓库里的 game/src）。
// 用法：node work/n3_patch_probe.mjs <none|log|verbose|guard|reorder>
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'F:/sanguo/work/n3_probe/game/src/core/smartscript/runtime.ts';
const src0 = readFileSync('F:/sanguo/game/src/core/smartscript/runtime.ts', 'utf8');
const mode = process.argv[2] || 'none';

let s = src0;
const assert = (cond, msg) => { if (!cond) { console.error('PATCH FAIL: ' + msg); process.exit(1); } };
assert(s.includes('            this.fallbackApplied = true;'), 'anchor fallbackApplied');
assert(s.includes('        const cbHits = this.ok ? this.collideCallbacks() : [];'), 'anchor cbHits');
assert(s.includes('    fallbackApplied = false;'), 'anchor field');

if (mode === 'log') {
  s = s.replace(
    '            this.fallbackApplied = true;',
    '            this.fallbackApplied = true;\n            console.error("[FB] seq=" + this.scriptNum + " f=" + this.framesSeen + " aim=" + this.castAim.x + "," + this.castAim.y + " tp=" + this.targetPoint.x + "," + this.targetPoint.y + " th=" + this.targetHandle);');
}
if (mode === 'verbose') {
  s = s.replace(
    '        const frameHits = hits.concat(cbHits);',
    '        const frameHits = hits.concat(cbHits);\n        if (this.scriptNum === 605) console.error("[V] f=" + this.framesSeen + " hits=" + hits.length + " cb=" + cbHits.length + " total=" + this.totalHits + " killed=" + this.killed + " objs=" + this.objects.size + " cbFired=" + this.cbFired.size);');
}
if (mode === 'guard') {
  s = s.replace('    fallbackApplied = false;', '    fallbackApplied = false;\n    cbHitTotal = 0;');
  s = s.replace(
    '        const cbHits = this.ok ? this.collideCallbacks() : [];',
    '        const cbHits = this.ok ? this.collideCallbacks() : [];\n        this.cbHitTotal += cbHits.length;');
  s = s.replace('&& !this.fallbackApplied) {', '&& !this.fallbackApplied && this.cbHitTotal === 0) {');
}
if (mode === 'nofb') {
  s = s.replace('&& !this.fallbackApplied) {', '&& !this.fallbackApplied && false) {');
}
// 只允许「脚本跑完那一帧」兜底（去掉 framesSeen>=3 这条提前量）
if (mode === 'end') {
  const before = '            && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {';
  assert(s.includes(before), 'anchor fallback cond');
  s = s.replace(before, '            && this.lastFrameEndedScript && !this.fallbackApplied) {');
}
// 「脚本跑完 且 本会话到此刻一次都没命中过」才兜底
if (mode === 'totalzero') {
  const before = '            && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {';
  assert(s.includes(before), 'anchor fallback cond');
  s = s.replace(before, '            && this.lastFrameEndedScript && this.totalHits === 0 && !this.fallbackApplied) {');
}
// 兜底改成按 targetPoint（g3 = 对面主将 / 脚本锚点）而不是玩家落点 castAim
if (mode === 'tpoint') {
  const before = '            pts.push({ x: this.castAim.x / 96, y: this.castAim.y / 72, r: 1.4 });';
  assert(s.includes(before), 'anchor castAim fallback');
  s = s.replace(before, '            pts.push({ x: this.targetPoint.x / 96, y: this.targetPoint.y / 72, r: 1.4 });');
}
// 诊断：end 模式 + 打 finishFrames 是否被调用、会话是否 done
if (mode === 'endlog') {
  s = s.replace('    finishFrames(): void {',
    '    finishFrames(): void {\n        console.error("[FF] seq=" + this.scriptNum + " totalHits=" + this.totalHits + " done=" + this.allInstancesDone() + " frames=" + this.framesSeen + " objs=" + this.objects.size);');
  s = s.replace('            && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {',
    '            && this.lastFrameEndedScript && !this.fallbackApplied) {');
}
// 兜底只在「脚本跑完那一帧 + 本会话至今 0 命中」触发（且仍不许第 0/1/2 帧）
if (mode === 'obj') {
  const a = '    finishFrames(): void {';
  assert(s.includes(a), 'anchor finishFrames');
  s = s.replace(a, a + `
        if (this.scriptNum === 501 || this.scriptNum === 605) {
            const objs = [...this.objects.values()].slice(0, 4).map((o) => o.handle + ':' + Math.round(o.x) + ',' + Math.round(o.y) + ' res' + o.resource + ' ang' + o.angle + ' sp' + o.speed);
            console.error('[OBJ] seq=' + this.scriptNum + ' n=' + this.objects.size + ' tp=' + this.targetPoint.x + ',' + this.targetPoint.y + ' aim=' + this.castAim.x + ',' + this.castAim.y + ' dead=' + [...this.objects.values()].filter((o) => o.dead).length + ' :: ' + objs.join(' | '));
        }`);
}
// 延迟兜底：去掉逐帧兜底，只保留会话末尾（finishFrames）那次，并把它的战果计入会话统计
if (mode === 'defer') {
  s = s.replace('&& !this.fallbackApplied) {', '&& !this.fallbackApplied && false) {');
  const before = `    finish(): void {
        this.run.finishFrames();`;
  assert(s.includes(before), 'anchor finish');
  s = s.replace(before, `    finish(): void {
        const k0 = this.run.killed;
        const h0 = this.run.healed;
        const t0 = this.run.totalHits;
        this.run.finishFrames();
        this.killed += this.run.killed - k0;
        this.healed += this.run.healed - h0;
        this.hits += this.run.totalHits - t0;`);
}
// 「脚本安静 3 帧」才允许兜底：脚本还在跑（本帧有 syscall）时不许兜底
if (mode === 'quiet') {
  s = s.replace('    fallbackApplied = false;', '    fallbackApplied = false;\n    lastActFrame = 0;');
  const sy = '    syscall(id: number, args: Slot[]): Slot | undefined {';
  assert(s.includes(sy), 'anchor syscall');
  s = s.replace(sy, sy + '\n        this.lastActFrame = this.framesSeen;');
  s = s.replace('&& (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {',
    '&& (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied\n            && this.framesSeen - this.lastActFrame >= 3 && this.totalHits === 0) {');
}
// 延迟兜底 v2：f>=3 时抓候选敌单位，会话结束仍 0 命中才按候选结算（计入会话统计）
if (mode === 'defer2') {
  s = s.replace('    fallbackApplied = false;', '    fallbackApplied = false;\n    pendingFallback: Unit[] = [];');
  const before = `        if (pts.length === 0 && !this.isHeal && !this.isSummon
            && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {
            this.fallbackApplied = true;
            pts.push({ x: this.castAim.x / 96, y: this.castAim.y / 72, r: 1.4 });
        }`;
  assert(s.includes(before), 'anchor defer2 fallback');
  s = s.replace(before, `        if (!this.isHeal && !this.isSummon && this.framesSeen >= 3 && this.totalHits === 0
            && !this.fallbackApplied) {
            this.fallbackApplied = true;
            const ax = this.castAim.x / 96;
            const ay = this.castAim.y / 72;
            this.pendingFallback = this.world.units.filter((u) => u.alive && u.side !== this.side
                && (u.x - ax) ** 2 + (u.y - ay) ** 2 <= 1.4 * 1.4);
            if (this.scriptNum === 501) console.error('[D2] seq=501 f=' + this.framesSeen + ' aim=' + ax + ',' + ay + ' cand=' + this.pendingFallback.length + ' enemies=' + this.world.units.filter((u) => u.alive && u.side !== this.side).length);
        }`);
  const ff = `        if (this.ok && this.totalHits === 0 && !this.isHeal && !this.isSummon) {
            this.applyHits([{ x: this.targetPoint.x / 96, y: this.targetPoint.y / 72, r: 1.4 }]);
            this.totalHits = 1;
        }`;
  assert(s.includes(ff), 'anchor finishFrames fallback');
  s = s.replace(ff, `        if (this.ok && this.totalHits === 0 && !this.isHeal && !this.isSummon) {
            const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
            const atk = m?.ATTACK ?? 20;
            const generalDmg = 8 + Math.floor(atk / 2);
            let n = 0;
            for (const u of this.pendingFallback) {
                if (!u.alive || this.hitUnits.has(u))
                    continue;
                this.hitUnits.add(u);
                this.applyHpDelta(this.byUnit.get(u) ?? 0, u.isGeneral ? -generalDmg : -1);
                n += 1;
            }
            this.totalHits = n;
        }`);
  const fin = `    finish(): void {
        this.run.finishFrames();`;
  assert(s.includes(fin), 'anchor finish');
  s = s.replace(fin, `    finish(): void {
        const k0 = this.run.killed;
        const h0 = this.run.healed;
        const t0 = this.run.totalHits;
        this.run.finishFrames();
        this.killed += this.run.killed - k0;
        this.healed += this.run.healed - h0;
        this.hits += this.run.totalHits - t0;`);
}
if (mode === 'why') {
  const a = '        for (const o of this.objects.values()) {\n            if (o.dead)\n                continue;';
  assert(s.includes(a), 'anchor obj loop');
  s = s.replace(a, `        let nDead = 0, nExp = 0, nRes = 0, nPos = 0, nKeep = 0;
        for (const o of this.objects.values()) {
            if (o.dead) { nDead++; continue; }`);
  const b = '            if (o.resource < 1000 || o.resource > 90000)\n                continue;';
  assert(s.includes(b), 'anchor res');
  s = s.replace(b, '            if (o.resource < 1000 || o.resource > 90000) { nRes++; continue; }');
  const c = '            if (!cur)\n                continue;';
  assert(s.includes(c), 'anchor pos');
  s = s.replace(c, '            if (!cur) { nPos++; continue; }');
  const d = '            if (this.clockValue >= o.expiresAt)';
  assert(s.includes(d), 'anchor exp');
  s = s.replace(d, '            if (this.clockValue >= o.expiresAt) { nExp++; continue; }');
  const e = '        // 兜底：与同步模型';
  assert(s.includes(e), 'anchor tail');
  s = s.replace(e, `        if (this.scriptNum === 501 || this.scriptNum === 605) console.error('[WHY] seq=' + this.scriptNum + ' f=' + this.framesSeen + ' clock=' + this.clockValue + ' dead=' + nDead + ' exp=' + nExp + ' res=' + nRes + ' nopos=' + nPos + ' pts=' + pts.length + ' units=' + this.world.units.filter((u) => u.alive && u.side !== this.side).length);
        // 兜底：与同步模型`);
}
// 兜底只在「脚本跑完那一帧 + 本会话至今 0 命中」触发（且仍不许第 0/1/2 帧）
if (mode === 'lastframe') {
  const before = `        if (pts.length === 0 && !this.isHeal && !this.isSummon
            && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {`;
  assert(s.includes(before), 'anchor lastframe cond');
  s = s.replace(before, `        if (!this.isHeal && !this.isSummon && this.framesSeen >= 3 && this.totalHits === 0
            && this.lastFrameEndedScript && !this.fallbackApplied) {`);
}
if (mode === 'reorder') {
  s = s.replace('    fallbackApplied = false;', '    fallbackApplied = false;\n    cbHitTotal = 0;');
  s = s.replace(
    `        const hits = this.ok ? this.resolveFrameHits() : [];
        if (hits.length && this.ok)
            this.applyHits(hits);`,
    `        const cbHits = this.ok ? this.collideCallbacks() : [];
        this.cbHitTotal += cbHits.length;
        const hits = this.ok ? this.resolveFrameHits() : [];
        if (hits.length && this.ok)
            this.applyHits(hits);`);
  s = s.replace(
    `        const cbHits = this.ok ? this.collideCallbacks() : [];
        const frameHits = hits.concat(cbHits);`,
    `        const frameHits = hits.concat(cbHits);`);
  s = s.replace('&& !this.fallbackApplied) {', '&& !this.fallbackApplied && this.cbHitTotal === 0) {');
}

writeFileSync(P, s, 'utf8');
console.log('patched mode=' + mode + ' bytes=' + s.length);
