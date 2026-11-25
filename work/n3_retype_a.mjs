// R179：把 runtime.ts 丢掉（R171 事故）的类型标注按调用点反推补回。
// 只改类型面，不动任何可执行语句。所有替换都带出现次数断言，任何一条对不上就直接退出。
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'F:/sanguo/game/src/core/smartscript/runtime.ts';
const DRY = process.argv.includes('--dry');
const src = readFileSync(P, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let lines = src.split(eol);

const fail = [];
const stats = { line: 0, block: 0, imports: 0 };

// ── 1. import 行：补 type-only 导入（verbatimModuleSyntax 要求 import type）────────
const importAdds = [
  ['import { FX_TTL_DEFAULT, allRush as allRushSide } from "../battle.ts";',
   'import type { GeneralState, Side, Unit, World } from "../battle.ts";'],
  ['import { SoProgram } from "./so.ts";',
   'import type { Instruction, SoFunction, SoSymbols } from "./so.ts";'],
  ['import { ScriptVm } from "./vm.ts";',
   'import type { Slot, SlotValue, VmHost } from "./vm.ts";'],
  ['import { dispatchSyscall } from "./syscalls.ts";',
   'import type { SkillObject, SyscallContext } from "./syscalls.ts";'],
];
for (const [anchor, add] of importAdds) {
  const idx = lines.findIndex((l) => l === anchor);
  if (idx < 0) { fail.push(`import anchor not found: ${anchor}`); continue; }
  lines.splice(idx + 1, 0, add);
  stats.imports++;
}

// ── 2. 逐行替换：字段 / 方法签名 / 模块函数 / 函数内局部 ────────────────────────
// [旧行(含缩进), 新行(含缩进), 期望出现次数]
const TABLE = [
  // —— SkillRun 字段 ——
  ['    world;', '    world: World;', 1],
  ['    side;', '    side: Side;', 2],                 // SkillRun + SkillSession
  ['    scriptNum;', '    scriptNum: number;', 2],     // SkillRun + SkillSession
  ['    fnNum;', '    fnNum: number;', 1],
  ['    program;', '    program: SoProgram;', 1],
  ['    rootVm;', '    rootVm: ScriptVm;', 1],
  ['    instances: any[] = [];', '    instances: VmInstance[] = [];', 1],
  ['    current;', '    current: VmInstance | undefined;', 1],
  ['    opts;', '    opts: SkillRunOptions;', 1],
  ['    casterHandle;', '    casterHandle: number;', 1],
  ['    targetHandle;', '    targetHandle: number;', 1],
  ['    caster;', '    caster: Unit;', 1],
  ['    general;', '    general: GeneralState;', 1],
  ['    byUnit = new Map();', '    byUnit = new Map<Unit, number>();', 1],
  ['    byHandle = new Map();', '    byHandle = new Map<number, Unit>();', 1],
  ['    unitList = [];', '    unitList: Unit[] = [];', 1],
  ['    objects = new Map();', '    objects = new Map<number, SkillObject>();', 1],
  ['    resources = [];', '    resources: string[] = [];', 1],
  ['    sounds = [];', '    sounds: string[] = [];', 1],
  ['    unimplemented = new Set();', '    unimplemented = new Set<number>();', 1],
  ['    calls = [];', '    calls: string[] = [];', 1],
  ['    healTargets = new Set();', '    healTargets = new Set<number>();', 1],
  ['    cbFired = new Set();', '    cbFired = new Set<string>();', 1],
  ['    cbPrev = new Map();', '    cbPrev = new Map<number, { x: number; y: number }>();', 1],
  ['    hitUnits = new Set();', '    hitUnits = new Set<Unit>();', 1],
  ['    scriptFn;', '    scriptFn: SoFunction | undefined;', 1],
  ['    direction;', '    direction: number;', 1],
  ['    isHeal;', '    isHeal: boolean;', 1],
  ['    isSummon;', '    isSummon: boolean;', 1],
  ['    isWide;', '    isWide: boolean;', 1],
  ['    syso;', '    syso: SysoHost;', 1],
  ['    engineOverflow = new Map();', '    engineOverflow = new Map<number, number>();', 1],
  ['    seq;', '    seq: number;', 1],
  ['    run;', '    run: SkillRun;', 1],

  // —— SkillRun 构造/实例调度 ——
  ['    constructor(world, side, scriptNum, fnNum, tx, ty, program, opts) {',
   '    constructor(world: World, side: Side, scriptNum: number, fnNum: number, tx: number, ty: number, program: SoProgram, opts: SkillRunOptions) {', 1],
  ['    get vm() {', '    get vm(): ScriptVm {', 1],
  ['    makeVm(base) {', '    makeVm(base?: ScriptVm): ScriptVm {', 1],
  ['    spawnInstance(fn, args, vm, hitDamage) {', '    spawnInstance(fn: SoFunction, args: Slot[], vm: ScriptVm, hitDamage?: number): VmInstance {', 1],
  ['    pumpInstance(inst) {', "    pumpInstance(inst: VmInstance): 'wait' | 'done' {", 1],
  ['    allInstancesDone() {', '    allInstancesDone(): boolean {', 1],
  ['    tickInstanceWaits() {', '    tickInstanceWaits(): void {', 1],
  ['    totalSteps() {', '    totalSteps(): number {', 1],
  ['    totalSyscalls() {', '    totalSyscalls(): number {', 1],
  ['    get instanceCount() {', '    get instanceCount(): number {', 2],   // SkillRun + SkillSession
  ['    instanceStates() {', '    instanceStates(): InstanceSnapshot[] {', 1],
  ['    globalValue(index) {', '    globalValue(index: number): number {', 1],
  ['    valueFor() {', '    valueFor(): number {', 1],

  // —— SkillRun 执行 ——
  ['    execute() {', '    execute(): RunSkillResult {', 1],
  ['    executeSystemScript(name) {', '    executeSystemScript(name: string): SystemSoScriptResult {', 1],
  ['    drainInstancesSync() {', '    drainInstancesSync(): void {', 1],
  ['    beginFrames() {', '    beginFrames(): boolean {', 1],
  ['    pumpFrame(first) {', "    pumpFrame(first: boolean): 'wait' | 'done' {", 1],
  ['    settleFrame() {', '    settleFrame(): FrameStat {', 1],
  ['    finishFrames() {', '    finishFrames(): void {', 1],
  ['    advanceClock() {', '    advanceClock(): void {', 1],
  ['    get runOk() {', '    get runOk(): boolean {', 1],
  ['    get suspendedFrames() {', '    get suspendedFrames(): number {', 1],
  ['    get runError() {', '    get runError(): string {', 1],
  ['    get runTruncated() {', '    get runTruncated(): boolean {', 1],
  ['    get hasFx() {', '    get hasFx(): boolean {', 1],
  ['    get isHealSkill() {', '    get isHealSkill(): boolean {', 2],       // SkillRun + SkillSession
  ['    scriptFunction() {', '    scriptFunction(): SoFunction | undefined {', 1],
  ['    missingScript() {', '    missingScript(): string {', 1],
  ['    recordError(err) {', '    recordError(err: unknown): void {', 1],
  ['    statsOf(hits) {', '    statsOf(hits: number): RunStats {', 1],
  ['    writeLog(stats, fx) {', '    writeLog(stats: RunStats, fx: number): void {', 1],
  ['    objectSummaries() {', '    objectSummaries(): ObjectInfo[] {', 1],

  // —— VmHost ——
  ['    get clock() {', '    get clock(): number {', 2],                   // SkillRun + SkillSession
  ['    syscall(id, args) {', '    syscall(id: number, args: Slot[]): Slot | undefined {', 1],
  ['    wait(frames) {', '    wait(frames: number): void {', 1],
  ['    tickClock(n) {', '    tickClock(n: number): void {', 1],
  ['    waitFor(name) {', '    waitFor(name: string): void {', 1],

  // —— SyscallContext（端口实现）——
  ['    posOf(handle) {', '    posOf(handle: number): { x: number; y: number; z: number } | undefined {', 1],
  ['    unitOf(handle) {', '    unitOf(handle: number): { x: number; y: number; z: number; side: number; alive: boolean } | undefined {', 1],
  ['    isUnit(handle) {', '    isUnit(handle: number): boolean {', 1],
  ['    handleOfObject(handle) {', '    handleOfObject(handle: number): number {', 1],
  ['    sideUnitHandle(camp) {', '    sideUnitHandle(camp: number): number {', 1],
  ['    unitSide(handle) {', '    unitSide(handle: number): number {', 1],
  ['    unitAlive(handle) {', '    unitAlive(handle: number): boolean {', 1],
  ['    aliveCount(camp) {', '    aliveCount(camp: number): number {', 1],
  ['    unitPx(handle) {', '    unitPx(handle: number): { x: number; y: number; z: number } {', 1],
  ['    setTargetPx(x, y) {', '    setTargetPx(x: number, y: number): void {', 1],
  ['    targetPx() {', '    targetPx(): { x: number; y: number } {', 1],
  ['    globalGet(index) {', '    globalGet(index: number): number {', 1],
  ['    instanceHitDamage() {', '    instanceHitDamage(): number {', 1],
  ['    generalOf(handle) {', '    generalOf(handle: number): number {', 1],
  ['    unitAtPx(x, y) {', '    unitAtPx(x: number, y: number): number {', 1],
  ['    unitsInRect(camp, x0, y0, x1, y1) {',
   '    unitsInRect(camp: number, x0: number, y0: number, x1: number, y1: number): number[] {', 1],
  ['    unitAtTile(gx, gy) {', '    unitAtTile(gx: number, gy: number): number {', 1],
  ['    collideCallbacks() {', '    collideCallbacks(): HitPoint[] {', 1],
  ['    spawnObject(resource, x, y, z, unit) {',
   '    spawnObject(resource: number, x: number, y: number, z: number, unit: number): number {', 1],
  ['    objectOf(handle) {', '    objectOf(handle: number): SkillObject | undefined {', 1],
  ['    setObjectPx(handle, x, y, z) {', '    setObjectPx(handle: number, x: number, y: number, z: number): void {', 1],
  ['    setObjectMotion(handle, angle, speed) {',
   '    setObjectMotion(handle: number, angle: number, speed: number): void {', 1],
  ['    setObjectFrames(handle, frames) {', '    setObjectFrames(handle: number, frames: number): void {', 1],
  ['    applyHpDelta(handle, delta) {', '    applyHpDelta(handle: number, delta: number): void {', 1],
  ['    readHp(handle) {', '    readHp(handle: number): number {', 1],
  ['    maxHp(handle) {', '    maxHp(handle: number): number {', 1],
  ['    summon(a, b, c) {', '    summon(a: number, b: number, c: number): number {', 1],
  ['    spawnSoldier(side, x, y) {', '    spawnSoldier(side: number, x: number, y: number): number {', 1],
  ['    engineGet(index) {', '    engineGet(index: number): number {', 1],
  ['    engineSet(index, value) {', '    engineSet(index: number, value: number): void {', 1],
  ['    rand(min, max) {', '    rand(min: number, max: number): number {', 1],
  ['    sound(name, volume, unit) {', '    sound(name: string, volume: number, unit?: number): void {', 1],
  ['    loadResource(pattern) {', '    loadResource(pattern: string): void {', 1],
  ['    brightness(value) {', '    brightness(value: number): void {', 1],
  ['    brightnessOf() {', '    brightnessOf(): number {', 1],
  ['    screenFlash(on) {', '    screenFlash(on: boolean): void {', 1],
  ['    allRush(side) {', '    allRush(side: number): boolean {', 1],
  ['    text(speaker, line) {', '    text(speaker: number, line: string): void {', 1],
  ['    callScript(name, args) {', '    callScript(name: string, args: SlotValue[]): SlotValue | undefined {', 1],
  ['    spawnScript(name, args) {', '    spawnScript(name: string, args: SlotValue[]): SlotValue | undefined {', 1],
  ['    trace(line) {', '    trace(line: string): void {', 1],
  ['    markUnimplemented(id, why) {', '    markUnimplemented(id: number, why: string): void {', 1],

  // —— 命中判定 ——
  ['    resolveHits() {', '    resolveHits(): HitPoint[] {', 1],
  ['    resolveFrameHits() {', '    resolveFrameHits(): HitPoint[] {', 1],
  ['    unhitUnits(pts) {', '    unhitUnits(pts: HitPoint[]): HitPoint[] {', 1],
  ['    applyHits(hits) {', '    applyHits(hits: HitPoint[]): void {', 1],
  ['    pushFx(hits) {', '    pushFx(hits: HitPoint[]): number {', 1],

  // —— 诊断 ——
  ['    debugState() {', '    debugState(): { pc: number; depth: number; steps: number; nestedWaits: number } {', 1],
  ['    debugLocal(offset) {', '    debugLocal(offset: number): number {', 1],
  ['    dumpObjects() {', '    dumpObjects(): string {', 1],

  // —— SkillSession ——
  ['    constructor(run, seq) {', '    constructor(run: SkillRun, seq: number) {', 1],
  ['    start() {', '    start(): void {', 1],
  ['    advance() {', '    advance(): FrameStat | undefined {', 1],
  ['    drain() {', '    drain(): void {', 1],
  ['    pump() {', '    pump(): void {', 1],
  ['    finish() {', '    finish(): void {', 1],
  ['    get debug(): { pc: number; callDepth: number; instructions: number; [key: string]: any } {',
   '    get debug(): { pc: number; depth: number; steps: number; nestedWaits: number } {', 1],
  ['    get syso(): { spawns: InstanceSnapshot[]; [key: string]: any } {', '    get syso(): SysoHost {', 1],

  // —— 模块级函数 ——
  ["export async function initMagicProgram(base = 'data/') {",
   "export async function initMagicProgram(base = 'data/'): Promise<void> {", 1],
  ['export function setMagicProgram(program) {', 'export function setMagicProgram(program: SoProgram | undefined): void {', 1],
  ['export function loadMagicProgram() {', 'export function loadMagicProgram(): SoProgram {', 1],
  ['export function runSkill(world: any, side: any, scriptNum: any, tx?: any, ty?: any, opts: SkillRunOptions = {}): RunSkillResult {',
   'export function runSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): RunSkillResult {', 1],
  ['export function startSkill(world: any, side: any, scriptNum: any, tx?: any, ty?: any, opts: SkillRunOptions = {}): SkillSession {',
   'export function startSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): SkillSession {', 1],
  ['function newSkillRun(world, side, scriptNum, tx, ty, opts) {',
   'function newSkillRun(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions): SkillRun {', 1],
  ['export function setSystemProgram(program) {', 'export function setSystemProgram(program: SoProgram | undefined): void {', 1],
  ['export function systemProgram() {', 'export function systemProgram(): SoProgram | undefined {', 1],
  ['export function runSystemSoFunction(world, side, name, opts = {}) {',
   'export function runSystemSoFunction(world: World, side: Side, name: string, opts: SystemSoRunOptions = {}): SystemSoScriptResult {', 1],
  ['export function createBattleSysoHost(world, side, opts = {}) {',
   'export function createBattleSysoHost(world: World, side: Side, opts: SysoHostOptions = {}): SysoHost {', 1],

  // —— 模块级 let / const / 箭头函数 ——
  ['let cachedProgram;', 'let cachedProgram: SoProgram | undefined;', 1],
  ['let preloaded;', 'let preloaded: { bin: ArrayBuffer | Uint8Array; symbols: SoSymbols } | undefined;', 1],
  ['        const getText = (u) => {', '        const getText = (u: string): string => {', 1],
  ['const WARNED = new Set();', 'const WARNED = new Set<number>();', 1],
  ['const clampX = (x) => Math.max(0, Math.min(70, Number.isFinite(x) ? x : 0));',
   'const clampX = (x: number): number => Math.max(0, Math.min(70, Number.isFinite(x) ? x : 0));', 1],
  ['const clampY = (y) => Math.max(0, Math.min(13, Number.isFinite(y) ? y : 0));',
   'const clampY = (y: number): number => Math.max(0, Math.min(13, Number.isFinite(y) ? y : 0));', 1],
  ['let cachedSystemProgram;', 'let cachedSystemProgram: SoProgram | undefined;', 1],

  // —— 函数内局部（隐式 any 的推断源头）——
  ['        let best;', '        let best: Unit | undefined;', 1],
  ['        const filled = [];', '        const filled: Slot[] = [];', 1],
  ['        let hits = [];', '        let hits: HitPoint[] = [];', 1],
  ['        const found = [];', '        const found: Array<{ h: number; x: number; y: number }> = [];', 1],
  ['        const hits = [];', '        const hits: HitPoint[] = [];', 1],
  ['            const seen = new Set();', '            const seen = new Set<number>();', 1],
  ['                    const args = [', '                    const args: Slot[] = [', 1],
  ["        const slots = args.map((v) => (typeof v === 'string' ? { value: v, type: 2 } : { value: v, type: 0 }));",
   "        const slots: Slot[] = args.map((v) => (typeof v === 'string' ? { value: v, type: 2 } : { value: v, type: 0 }));", 2],
  ['        const pts = [];', '        const pts: HitPoint[] = [];', 2],
  ['        const out = [];', '        const out: HitPoint[] = [];', 2],
  ['        let kind;', "        let kind: 'heal' | 'aoe' | 'strike';", 1],

  // —— 类声明：让 implements 把 SyscallContext / VmHost 的契约变成编译期检查 ——
  ['class SkillRun {', 'class SkillRun implements VmHost, SyscallContext {', 1],
];

for (const [oldLine, newLine, want] of TABLE) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) if (lines[i] === oldLine) hits.push(i);
  if (hits.length !== want) {
    fail.push(`expected ${want} occurrence(s) of ${JSON.stringify(oldLine)} but found ${hits.length}`);
    continue;
  }
  for (const i of hits) lines[i] = newLine;
  stats.line += hits.length;
}

// ── 3. 导出接口：按名字整块替换 ───────────────────────────────────────────────
const BLOCKS = {
  FrameStat: [
    'export interface FrameStat {',
    '    frame: number;',
    '    instructions: number;',
    '    syscalls: number;',
    '    hits: number;',
    '    killed: number;',
    '    healed: number;',
    '}',
  ],
  ObjectInfo: [
    'export interface ObjectInfo {',
    '    resource: number;',
    '    x: number;',
    '    y: number;',
    '    angle: number;',
    '    dead: boolean;',
    '}',
  ],
  RunStats: [
    'export interface RunStats {',
    '    script: number;',
    '    fn: string;',
    '    instructions: number;',
    '    syscalls: number;',
    '    objects: number;',
    '    hits: number;',
    '    killed: number;',
    '    healed: number;',
    '    unimplemented: number[];',
    '}',
  ],
  RunSummary: [
    'export interface RunSummary {',
    '    ok: boolean;',
    '    log: string[];',
    '    stats: RunStats;',
    '    objects: ObjectInfo[];',
    '}',
  ],
  InstanceSnapshot: [
    'export interface InstanceSnapshot {',
    '    fn: string;',
    '    done: boolean;',
    '    pending: number;',
    '    steps: number;',
    '    pc: number;',
    '    started: boolean;',
    '}',
  ],
  RunSkillResult: [
    'export interface RunSkillResult {',
    '    ok: boolean;',
    '    log: string[];',
    '    stats: RunStats;',
    '    objects: ObjectInfo[];',
    '}',
  ],
  SkillRunOptions: [
    'export interface SkillRunOptions {',
    '    /** 指令预算（超过按截断收尾）。 */',
    '    budget?: number;',
    '    /** 特效寿命（虚拟帧），`cast()` 传法术的 life。 */',
    '    ttl?: number;',
    '    /** 逐条指令/WAIT 的调试输出。 */',
    '    trace?: (text: string) => void;',
    '    /** 每条指令执行前的回调（反汇编工具用）。 */',
    '    onInstruction?: (ins: Instruction) => void;',
    '}',
    '/** 本地命中点（格坐标）。命中判定/resolveHits 与 `applyHits` 之间的内部形状。 */',
    'interface HitPoint {',
    '    x: number;',
    '    y: number;',
    '    r: number;',
    '}',
    '/** 一条脚本实例：根实例 + `0x312 / 0x314` 起的子实例。 */',
    'interface VmInstance {',
    '    vm: ScriptVm;',
    '    fn: SoFunction;',
    '    args: Slot[];',
    '    done: boolean;',
    '    pending: number;',
    '    started: boolean;',
    '    hitDamage?: number;',
    '}',
    '/** `executeSystemScript()` 的返回（SYSTEM.SO 战斗级函数）。 */',
    'interface SystemSoScriptResult {',
    '    ok: boolean;',
    '    ran: boolean;',
    '    log: string[];',
    '    instructions: number;',
    '    syscalls: number;',
    '}',
    '/** `runSystemSoFunction()` 的可选项。 */',
    'interface SystemSoRunOptions {',
    '    program?: SoProgram;',
    '    trace?: (text: string) => void;',
    '    onInstruction?: (ins: Instruction) => void;',
    '    budget?: number;',
    '}',
    '/** `createBattleSysoHost()` 的可选项。 */',
    'interface SysoHostOptions {',
    '    log?: string[];',
    '    trace?: (line: string) => void;',
    '}',
  ],
};

for (const [name, body] of Object.entries(BLOCKS)) {
  const start = lines.findIndex((l) => l === `export interface ${name} {`);
  if (start < 0) { fail.push(`interface ${name} not found`); continue; }
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) if (lines[i] === '}') { end = i; break; }
  if (end < 0) { fail.push(`interface ${name} has no closing brace`); continue; }
  lines.splice(start, end - start + 1, ...body);
  stats.block++;
}

// ── 4. 校验与落盘 ────────────────────────────────────────────────────────────
if (fail.length) {
  console.error('ABORT: ' + fail.length + ' mismatch(es)');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
const out = lines.join(eol);
const before = Buffer.byteLength(src, 'utf8');
console.log(`imports +${stats.imports} / lines ${stats.line} / blocks ${stats.block}`);
console.log(`bytes ${before} -> ${Buffer.byteLength(out, 'utf8')}`);
console.log(`@ts-nocheck occurrences in result: ${(out.match(/@ts-nocheck/g) || []).length}`);
if (DRY) { console.log('DRY RUN — not written'); process.exit(0); }
writeFileSync(P, out, 'utf8');
console.log('written ' + P);
