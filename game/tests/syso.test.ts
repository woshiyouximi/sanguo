/**
 * R79：`SYSTEM.SO` 39 个函数的宿主侧重写（`src/core/syso_host.ts`）。
 *
 * 上游：`project/62_SYSTEM_SO实装.md`、`work/syso_map.md`、`work/system_so/funcs.txt`
 * （从 `extract/pak/SCRIPT/SYSTEM.SO` 反汇编出来的 39 段指令流）。
 *
 * 这组测试的原则：**每条实装函数至少一条"断言行为"的用例**，不是只断言不抛错——
 *   - 内存族：写进去读出来必须相等，而且要能穿透字节/半字/字的对齐组合；
 *   - 镜头族：轨迹必须逐步逼近并精确落在目标点；
 *   - 布景族：物件数量、资源号、坐标区间必须落在字节码常量里；
 *   - 随机族：**同一个种子两次跑出完全一样的结果**（`SysoHost` 自带 mulberry32；
 *     接进 `Runtime` 后走 `world.rng`，同 seed 同样可复现）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { createWorld } from '../src/core/battle.ts';
import { startSkill } from '../src/core/smartscript/runtime.ts';
import {
  STRCPY_STUB_ADDR,
  STRING_PTR_SLOT,
  SYSTEM_SO_BASE,
  SYSTEM_SO_FUNCTIONS,
  SYSTEM_SO_NAMES,
  SYSO_HOST_NAMES,
  SYSO_PORT_GAPS,
  SYSO_UNSUPPORTED,
  SysoHost,
  SparseWordStore,
  SysoMemory,
  WEATHER_RESOURCE_BASE,
  isSystemSoHostName,
  type SysoPorts,
} from '../src/core/syso_host.ts';

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/** 造一个宿主，随机数用固定种子。 */
function host(seed = 0x51c0, ports: SysoPorts = {}): SysoHost {
  return new SysoHost(ports, { seed });
}

/** 取返回值（`SysoCallResult.value` 是 `number | string | undefined`）。 */
function valueOf(h: SysoHost, name: string, ...args: number[]): number {
  const r = h.call(name, args);
  assert.equal(r.handled, true, `${name} 应该由宿主接管`);
  assert.equal(typeof r.value, 'number', `${name} 应该返回数值`);
  return r.value as number;
}

// ── 0. 清单本身 ───────────────────────────────────────────────────────
describe('SYSTEM.SO 函数清单', () => {
  it('39 行总表：索引连续、名字唯一、状态分布 = 35 host + 4 audio_bus + 0 无据', () => {
    assert.equal(SYSTEM_SO_FUNCTIONS.length, 39);
    assert.equal(SYSTEM_SO_NAMES.length, 39);
    assert.equal(new Set(SYSTEM_SO_NAMES).size, 39, '函数名不能重复');
    SYSTEM_SO_FUNCTIONS.forEach((f, i) => {
      assert.equal(f.idx, i, `第 ${i} 行的 idx 应为 ${i}`);
      assert.ok(f.addr > 0, `${f.name} 缺地址`);
      assert.ok(f.note.length > 0, `${f.name} 缺说明`);
    });
    const hosts = SYSTEM_SO_FUNCTIONS.filter((f) => f.status === 'host');
    const audio = SYSTEM_SO_FUNCTIONS.filter((f) => f.status === 'audio_bus');
    const none = SYSTEM_SO_FUNCTIONS.filter((f) => f.status === 'unsupported');
    assert.equal(hosts.length, 35, 'R137 起 35 个宿主实现（AllRush 从 audio_bus 搬来）');
    assert.equal(audio.length, 4);
    assert.equal(none.length, 0, 'R84 之后没有"无据"的了');
    assert.deepEqual(
      audio.map((f) => f.name),
      ['LoadingBattleMap', 'DownBrightness', 'RaiseBrightness', 'MajorDeath'],
      'audio_bus 的 4 个必须与 callSystemSo 的 SYSTEM_SO_IMPLEMENTED 一致',
    );
    assert.equal(hosts.find((f) => f.name === 'AllRush')?.status, 'host', 'R137：AllRush 归宿主');
    // 地址单调递增：目录顺序就是文件里的物理顺序（docs/04d:317-330）
    for (let i = 1; i < SYSTEM_SO_FUNCTIONS.length; i++) {
      assert.ok(
        SYSTEM_SO_FUNCTIONS[i].addr > SYSTEM_SO_FUNCTIONS[i - 1].addr,
        `${SYSTEM_SO_FUNCTIONS[i].name} 的地址应当大于前一个函数`,
      );
    }
  });

  it('无据表已清空；9 条新实装的"端口缺口"逐条写清（不是空字符串）', () => {
    assert.equal(SYSO_UNSUPPORTED.length, 0, 'R84 之后 SYSO_UNSUPPORTED 必须为空');
    assert.equal(SYSO_PORT_GAPS.length, 9, '9 条各有一条缺口说明');
    const nameSet = new Set(SYSO_HOST_NAMES);
    for (const g of SYSO_PORT_GAPS) {
      assert.ok(nameSet.has(g.name), `${g.name} 必须已经由宿主接管`);
      assert.ok(g.why.length >= 12, `${g.name} 的缺口说明太短：${g.why}`);
    }
    const byName = new Map(SYSO_PORT_GAPS.map((g) => [g.name, g]));
    // 三条"原作自己就是空壳"的必须写明不需要端口
    for (const name of ['Battle2', 'CheckGround', 'ReportResult']) {
      assert.equal(byName.get(name)?.port, '—', `${name} 不该再有端口缺口`);
    }
    // 依赖台词表的四条必须点名 msg 端口
    for (const name of ['BattleYield', 'StartBattle', 'BattleEndTalk', 'SearchTalk']) {
      assert.match(byName.get(name)?.port ?? '', /msg/, `${name} 应当点名 msg 端口`);
    }
  });

  it('isSystemSoHostName 只认 35 个托管名，别的名字回落到脚本层', () => {
    assert.equal(SYSO_HOST_NAMES.length, 35);
    assert.equal(isSystemSoHostName('GetByte_Old'), true);
    assert.equal(isSystemSoHostName('EnterWar5'), true);
    // R84 收编的 9 条
    for (const name of ['Battle2', 'CheckGround', 'BattleYield', 'StartBattle', 'BattleEndTalk', 'ReportResult', 'SearchTalk', 'ChildGenTalkNew', 'YieldGeneral']) {
      assert.equal(isSystemSoHostName(name), true, `${name} 现在由宿主接管`);
    }
    assert.equal(isSystemSoHostName('AllRush'), true, 'R137：AllRush 归宿主（要写 world.rush）');
    assert.equal(isSystemSoHostName('DownBrightness'), false, 'DownBrightness 归 audio_bus');
    assert.equal(isSystemSoHostName('NoSuchFunc'), false);
    assert.deepEqual(host().call('MajorDeath', [0, 0]), { handled: false });
  });
});

// ── 1. 内存族（9 个）────────────────────────────────────────────────
describe('内存族：GetByte / GetShort / GetInt / SetXxx / SetString_Old', () => {
  it('GetByte_Old 按字节偏移寻址同一个字（小端），四种对齐都要对', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 64;
    h.mem.putWord(addr, 0x11223344);
    assert.deepEqual(
      [0, 1, 2, 3].map((k) => valueOf(h, 'GetByte_Old', addr + k)),
      [0x44, 0x33, 0x22, 0x11],
    );
    // 同一个字：字节地址不同但落在同一 word 上，说明 (addr-base)>>2 生效
    assert.equal(valueOf(h, 'GetByte_Old', addr + 0), valueOf(h, 'GetByte_Old', addr + 0));
    assert.equal(valueOf(h, 'GetByte_Old', addr + 4), 0, '下一个字应当是 0');
  });

  it('GetByte_Signed_Old 做 8 位符号扩展：0x80 → -128，0x7F → 127', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 128;
    h.mem.putWord(addr, 0x00000080);
    assert.equal(valueOf(h, 'GetByte_Signed_Old', addr), -128);
    h.mem.putWord(addr, 0x0000007f);
    assert.equal(valueOf(h, 'GetByte_Signed_Old', addr), 127);
    h.mem.putWord(addr, 0x0000ff80);
    assert.equal(valueOf(h, 'GetByte_Signed_Old', addr + 1), -1, '0xFF 应符号扩展成 -1');
  });

  it('GetShort_Old 读 16 位，含 addr&3==3 的跨字分支', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 256;
    h.mem.putWord(addr, 0x11223344);
    h.mem.putWord(addr + 4, 0x55667788);
    assert.equal(valueOf(h, 'GetShort_Old', addr), 0x3344);
    assert.equal(valueOf(h, 'GetShort_Old', addr + 2), 0x1122);
    // 跨字（0x1A0 分支）：低字节 = 本字最高位 0x11，高字节 = 下一字最低位 0x88 → 0x8811
    assert.equal(valueOf(h, 'GetShort_Old', addr + 3), 0x8811);
  });

  it('GetShort_Signed_Old 做 16 位符号扩展', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 320;
    h.mem.putWord(addr, 0x11223344);
    h.mem.putWord(addr + 4, 0x55667788);
    assert.equal(valueOf(h, 'GetShort_Signed_Old', addr + 3), 0x8811 - 0x10000);
    h.mem.putWord(addr, 0x00003344);
    assert.equal(valueOf(h, 'GetShort_Signed_Old', addr), 0x3344, '正数不该被改');
  });

  it('GetInt_Old 按字节拼字：offset 0/1/3 精确，offset 2 复刻原作的丢位 bug', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 384;
    h.mem.putWord(addr, 0x11223344);
    h.mem.putWord(addr + 4, 0x55667788);
    assert.equal(valueOf(h, 'GetInt_Old', addr) >>> 0, 0x11223344);
    assert.equal(valueOf(h, 'GetInt_Old', addr + 1) >>> 0, 0x88112233);
    assert.equal(valueOf(h, 'GetInt_Old', addr + 3) >>> 0, 0x66778811);
    // 原作 GetInt_Old 的 `addr&3==2` 分支是 `((w1>>16)&0xFFFF)|(w2<<24)`，
    // 第 16..23 位恒为 0（0x2A0 的 L0038C 段）。这是原作的 bug，重制版照抄，
    // 保证同一个地址在原作/重制版读出同一个值。
    assert.equal(valueOf(h, 'GetInt_Old', addr + 2) >>> 0, 0x88001122);
  });

  it('SetInt_Old(addr, value) 四种对齐都能写进去，且不越界改邻居字节', () => {
    const v = 0x0a0b0c0d;
    for (const off of [0, 1, 2, 3]) {
      const h = host();
      const base = SYSTEM_SO_BASE + 448;
      const addr = base + off;
      h.mem.putWord(base, 0xaaaaaaaa);
      h.mem.putWord(base + 4, 0xbbbbbbbb);
      h.call('SetInt_Old', [addr, v]);
      // 参数顺序就是源码顺序（addr, value）——写反的话下面每一条都会失败
      assert.deepEqual(h.events[h.events.length - 1], {
        kind: 'memory-write',
        addr,
        value: v,
      });
      // 内存镜像必须逐字节正确（写侧没有 bug，四种对齐都对）
      const bytes = [0x0d, 0x0c, 0x0b, 0x0a];
      for (let k = 0; k < 4; k++) {
        assert.equal(valueOf(h, 'GetByte_Old', addr + k), bytes[k], `对齐 ${off} 的第 ${k} 字节写错`);
      }
      // 读回：offset 0/1/3 精确；offset 2 会被 GetInt_Old 的 bug 截掉第 16..23 位
      // （v=0x0a0b0c0d 的低 16 位 0x0c0d 保留，byte2=0x0b 被挪到 bit24，byte3 丢掉）
      const back = valueOf(h, 'GetInt_Old', addr) >>> 0;
      const expect = off === 2 ? 0x0b000c0d : v;
      assert.equal(back, expect, `对齐 ${off} 的读回不一致`);
      // 被写区间之外的字节保持原样
      for (let k = 0; k < 8; k++) {
        const abs = base + k;
        if (abs >= addr && abs < addr + 4) continue;
        const same = k < 4 ? 0xaa : 0xbb;
        assert.equal(valueOf(h, 'GetByte_Old', abs), same, `第 ${k} 个邻居字节被改坏`);
      }
    }
  });

  it('SetByte_Old 只改目标字节（读-改-写），SetShort_Old 只改目标半字', () => {
    const h = host();
    const addr = SYSTEM_SO_BASE + 512;
    h.mem.putWord(addr, 0x11223344);
    h.call('SetByte_Old', [addr + 1, 0xaa]);
    assert.equal(valueOf(h, 'GetInt_Old', addr) >>> 0, 0x1122aa44);
    h.call('SetShort_Old', [addr + 2, 0x1234]);
    assert.equal(valueOf(h, 'GetInt_Old', addr) >>> 0, 0x1234aa44);
    assert.equal(valueOf(h, 'GetShort_Old', addr), 0xaa44, '低半字不该被动过');
  });

  it('SetString_Old 写函数指针槽 + 逐字节 strcpy，GetByte 能读回每个字符', () => {
    const h = host();
    const dest = SYSTEM_SO_BASE + 0x100;
    h.call('SetString_Old', [dest, 'OK!']);
    // 自举：先把 0x46DA60 写进 0x4A71FC（docs/04:574-582 的老技巧）
    assert.equal(h.mem.readInt(STRING_PTR_SLOT), STRCPY_STUB_ADDR);
    assert.equal(h.mem.readString(dest), 'OK!');
    assert.deepEqual(
      [0, 1, 2, 3].map((k) => valueOf(h, 'GetByte_Old', dest + k)),
      [0x4f, 0x4b, 0x21, 0x00],
      '字符串末尾必须补 0',
    );
    // 覆盖写：旧内容不能残留
    h.call('SetString_Old', [dest, 'A']);
    assert.equal(h.mem.readString(dest), 'A');
    assert.equal(valueOf(h, 'GetByte_Old', dest + 1), 0);
  });

  it('SysoMemory 默认用稀疏字表：不写就不占格，写 0 会回收', () => {
    const store = new SparseWordStore();
    const mem = new SysoMemory(store);
    mem.writeInt(SYSTEM_SO_BASE, 7);
    assert.equal(store.size, 1);
    assert.equal(mem.readInt(SYSTEM_SO_BASE), 7);
    mem.writeInt(SYSTEM_SO_BASE, 0);
    assert.equal(store.size, 0);
    // 基址以下（函数指针槽）落在负下标上也能存
    mem.writeInt(STRING_PTR_SLOT, STRCPY_STUB_ADDR);
    assert.equal(mem.readInt(STRING_PTR_SLOT), STRCPY_STUB_ADDR);
  });
});

// ── 2. 镜头族 ────────────────────────────────────────────────────────
describe('镜头族：MoveCamera / EnterMapMoveCamera', () => {
  it('MoveCamera 按帧数逐步插值，最后一步精确落在目标点', () => {
    const h = host();
    h.call('MoveCamera', [300, 200, 5]);
    assert.equal(h.cameraTrace.length, 5, '5 帧就该有 5 个轨迹点');
    assert.deepEqual(h.cameraTrace[0], { x: 60, y: 40 });
    assert.deepEqual(h.cameraTrace[4], { x: 300, y: 200 });
    assert.deepEqual(h.camera, { x: 300, y: 200 });
    // 单调递增：每一步都要更近
    for (let i = 1; i < h.cameraTrace.length; i++) {
      assert.ok(h.cameraTrace[i].x > h.cameraTrace[i - 1].x, `第 ${i} 步 x 没有前进`);
    }
  });

  it('MoveCamera 已经在目标点时第一帧就收尾；帧数 0 直接归位', () => {
    const h = host();
    h.call('MoveCamera', [300, 200, 5]);
    h.cameraTrace.length = 0;
    h.call('MoveCamera', [300, 200, 5]);
    assert.equal(h.cameraTrace.length, 1, '零位移应当在第 1 帧提前收尾');
    const h2 = host();
    h2.call('MoveCamera', [10, 20, 0]);
    assert.deepEqual(h2.camera, { x: 10, y: 20 }, 'frames<=0 时直接归位，不能除零');
    assert.equal(h2.cameraTrace.length, 1);
  });

  it('EnterMapMoveCamera 从屏幕中心 (160,120) 出发，按步长夹到目标点并清守卫', () => {
    const seen: Array<{ x: number; y: number }> = [];
    const h = host(0x51c0, { setMapCamera: (x, y) => seen.push({ x, y }) });
    h.call('EnterMapMoveCamera', [200, 140, 5]);
    assert.deepEqual(h.mapCamera, { x: 200, y: 140 });
    assert.equal(h.mapPanGuard, false, '走完必须把 g2 守卫清回 0');
    assert.equal(h.mapCameraTrace.length, seen.length, '轨迹与 0x205 调用必须一一对应');
    assert.deepEqual(h.mapCameraTrace[0], { x: 165, y: 125 }, '第一步 = 中心 + 步长');
    assert.deepEqual(h.mapCameraTrace[h.mapCameraTrace.length - 1], { x: 200, y: 140 });
    // 原作每次都从屏幕中心 0x203/0x204（160,120）重新起步（0x4580 里 loc1/loc2 是常量），
    // 所以第二次同参数调用会再走一遍同样的 8 步，而不是原地不动。
    const before = h.mapCameraTrace.length;
    h.call('EnterMapMoveCamera', [200, 140, 5]);
    assert.equal(h.mapCameraTrace.length, before * 2, '第二次调用重新从中心起步');
    assert.deepEqual(h.mapCameraTrace[before], { x: 165, y: 125 });
    assert.equal(h.mapPanGuard, false);
  });

  it('EnterMapMoveCamera 的重入守卫：g2 非 0 时直接返回', () => {
    const h = host();
    h.mapPanGuard = true;
    h.call('EnterMapMoveCamera', [300, 200, 10]);
    assert.equal(h.mapCameraTrace.length, 0, '守卫开着就不该动镜头');
    assert.deepEqual(h.mapCamera, { x: 160, y: 120 });
  });
});

// ── 3. 天气族 ────────────────────────────────────────────────────────
describe('天气族：ProduceRain / ProduceSnow / ProduceFog / WeatherObjectDeath', () => {
  it('ProduceRain 生成 3..10 个 9994..9996 物件，x/y 落在 0..1024', () => {
    const h = host(11);
    h.call('ProduceRain', []);
    assert.equal(h.weather, 1);
    assert.ok(h.spawns.length >= 3 && h.spawns.length <= 10, `雨滴数越界：${h.spawns.length}`);
    assert.equal(h.weatherObjects.length, h.spawns.length);
    for (const s of h.spawns) {
      assert.equal(s.kind, 'rain');
      assert.ok(
        s.resource >= WEATHER_RESOURCE_BASE && s.resource <= WEATHER_RESOURCE_BASE + 2,
        `资源号越界：${s.resource}`,
      );
      assert.ok(s.x >= 0 && s.x <= 1024);
      assert.ok(s.y >= 0 && s.y <= 1024);
      assert.ok(s.motion >= 300 && s.motion <= 500, `下落速度越界：${s.motion}`);
      assert.ok(s.frames >= 2 && s.frames <= 5, `寿命越界：${s.frames}`);
    }
  });

  it('ProduceRain 同种子两次结果完全一致（可复现）', () => {
    const a = host(4242);
    const b = host(4242);
    a.call('ProduceRain', []);
    b.call('ProduceRain', []);
    assert.deepEqual(a.spawns, b.spawns);
    assert.deepEqual(
      a.events.filter((e) => e.kind === 'weather'),
      b.events.filter((e) => e.kind === 'weather'),
    );
    // 换种子必须不同（否则说明 rng 根本没被用到）
    const c = host(99);
    c.call('ProduceRain', []);
    assert.notDeepEqual(a.spawns, c.spawns);
  });

  it('ProduceSnow 带风力/变体/SHP 与运动速度，且帧数落在 2..4', () => {
    const h = host(7);
    h.call('ProduceSnow', []);
    assert.equal(h.weather, 2);
    assert.ok(h.snow.wind >= 0 && h.snow.wind <= 255, `风力越界：${h.snow.wind}`);
    assert.ok(h.snow.variant >= 1 && h.snow.variant <= 3, `变体越界：${h.snow.variant}`);
    assert.equal(h.snow.animation, 'MAGIC\\M013WingA6.SHP');
    assert.ok(h.spawns.length >= 3 && h.spawns.length <= 10);
    for (const s of h.spawns) {
      assert.equal(s.kind, 'snow');
      assert.ok(s.frames >= 2 && s.frames <= 4, `寿命越界：${s.frames}`);
      assert.ok(s.motion >= 40960 && s.motion <= 65536, `运动速度越界：${s.motion}`);
    }
    const other = host(7);
    other.call('ProduceSnow', []);
    assert.deepEqual(h.spawns, other.spawns, '同种子必须一致');
  });

  it('ProduceFog 只生成 1 个物件，换 GAMEOVER.SHP，尺寸 300..500', () => {
    const h = host(3);
    h.call('ProduceFog', []);
    assert.equal(h.weather, 3);
    assert.equal(h.spawns.length, 1);
    assert.equal(h.spawns[0].kind, 'fog');
    assert.ok(
      h.spawns[0].resource >= WEATHER_RESOURCE_BASE && h.spawns[0].resource <= WEATHER_RESOURCE_BASE + 2,
    );
    assert.ok(h.fog.size >= 300 && h.fog.size <= 500, `雾尺寸越界：${h.fog.size}`);
    assert.equal(h.fog.animation, 'MENU\\GAMEOVER.SHP');
    assert.equal(h.weatherObjects.length, 1);
  });

  it('WeatherObjectDeath 回收最近一批天气物件并把天气清回晴', () => {
    const h = host(5);
    h.call('ProduceFog', []);
    assert.equal(h.weather, 3);
    h.call('WeatherObjectDeath', []);
    assert.equal(h.weather, 0);
    assert.equal(h.weatherObjects.length, 0);
    // 没有天气物件时再调一次不能抛
    h.call('WeatherObjectDeath', []);
    assert.equal(h.weather, 0);
  });
});

// ── 4. 布景/阵型标记 ─────────────────────────────────────────────────
describe('布景族：EnterWar4 / EnterWar5 / EnterWar7', () => {
  it('EnterWar5 无随机：22 个标记（11 组 403 + 404），坐标可精确推算', () => {
    const h = host(1);
    h.call('EnterWar5', []);
    assert.equal(h.spawns.length, 22);
    assert.deepEqual(h.spawns[0], {
      handle: h.spawns[0].handle,
      resource: 403,
      x: 48,
      y: 15 * 72 + 36,
      z: 0,
      motion: 0,
      frames: 0,
      kind: 'war-marker',
    });
    assert.deepEqual(
      { resource: h.spawns[1].resource, x: h.spawns[1].x, y: h.spawns[1].y },
      { resource: 404, x: 48, y: 15 * 72 + 36 + 70 },
      '404 必须比 403 低 70 像素',
    );
    // 列间距 7 格 → 672 像素
    assert.equal(h.spawns[20].x, 48 + 10 * 672);
    // 无随机：换种子结果不变
    const other = host(999);
    other.call('EnterWar5', []);
    assert.deepEqual(h.spawns, other.spawns);
  });

  it('EnterWar4 生成 6 个定点 + rand(6,9) 个散布的 402 标记', () => {
    const h = host(8);
    h.call('EnterWar4', []);
    assert.ok(h.spawns.length >= 12 && h.spawns.length <= 15, `标记数越界：${h.spawns.length}`);
    for (const s of h.spawns) {
      assert.equal(s.resource, 402);
      assert.equal(s.kind, 'war-marker');
      assert.ok(s.y >= 14 * 72 + 36 && s.y <= 17 * 72 + 36 + 72, `行越界：${s.y}`);
      assert.ok(s.motion >= 32768 && s.motion <= 65536, `运动速度越界：${s.motion}`);
    }
    // 第一个标记来自列区间 rand(-2,3)：像素 -144..384
    assert.ok(h.spawns[0].x >= -2 * 96 + 48 && h.spawns[0].x <= 3 * 96 + 48 + 96);
    const again = host(8);
    again.call('EnterWar4', []);
    assert.deepEqual(h.spawns, again.spawns, '同种子必须一致');
  });

  it('EnterWar7 生成 60 个 400/401 标记，资源号只能是这两者', () => {
    const h = host(13);
    h.call('EnterWar7', []);
    assert.equal(h.spawns.length, 60);
    const resources = new Set(h.spawns.map((s) => s.resource));
    assert.deepEqual([...resources].sort(), [400, 401]);
    for (const s of h.spawns) {
      assert.ok(s.x >= 0 && s.x <= 71 * 96 + 48 + 96, `列越界：${s.x}`);
      assert.ok(s.y >= 14 * 72 + 36 && s.y <= 17 * 72 + 36 + 72, `行越界：${s.y}`);
    }
  });
});

// ── 5. 武将生灭 / 调试 ───────────────────────────────────────────────
describe('武将族：KillGeneral / FreeGeneral / Test01', () => {
  it('KillGeneral 用 rand(0,10) 选偶数对槽（910/911 起），并写全局 7/8 号', () => {
    const writes: Array<[number, number, number]> = [];
    const h = host(21, {
      global: (i) => (i === 7 ? 1234 : i === 8 ? 5678 : 0),
      engineWrite: (a, b, c) => writes.push([a, b, c]),
    });
    h.call('KillGeneral', []);
    const ev = h.events.find((e) => e.kind === 'general-kill');
    assert.ok(ev && ev.kind === 'general-kill');
    assert.equal(ev.general, 1234, 'g7 应当是主将');
    assert.ok(ev.slot >= 0 && ev.slot <= 10, `槽号越界：${ev.slot}`);
    assert.deepEqual(ev.slots, [910 + ev.slot * 2, 911 + ev.slot * 2]);
    assert.deepEqual(writes[0], [0, 1234, 910 + ev.slot * 2]);
    assert.deepEqual(writes[1], [1, 5678, 911 + ev.slot * 2]);
    assert.equal(h.texts.length, 1, '0x3 说一句 %E%（空台词）');
    assert.equal(h.texts[0].line, '');
  });

  it('KillGeneral 同种子两次选中同一个槽', () => {
    const a = host(77, { global: () => 1 });
    const b = host(77, { global: () => 1 });
    a.call('KillGeneral', []);
    b.call('KillGeneral', []);
    const sa = a.events.find((e) => e.kind === 'general-kill');
    const sb = b.events.find((e) => e.kind === 'general-kill');
    assert.deepEqual(sa, sb);
  });

  it('FreeGeneral 用 rand(940,945) 选释放槽，并记下是哪位武将', () => {
    const h = host(31, { global: (i) => (i === 7 ? 4321 : 0) });
    h.call('FreeGeneral', []);
    const ev = h.events.find((e) => e.kind === 'general-free');
    assert.ok(ev && ev.kind === 'general-free');
    assert.equal(ev.general, 4321);
    assert.ok(ev.slot >= 940 && ev.slot <= 945, `槽号越界：${ev.slot}`);
  });

  it('Test01 对 g2 打 10000 点伤害（0x125 的唯一调试入口）', () => {
    const hits: Array<[number, number]> = [];
    const h = host(1, {
      global: (i) => (i === 2 ? 1005 : 0),
      applyHpDelta: (handle, delta) => hits.push([handle, delta]),
    });
    h.call('Test01', []);
    assert.deepEqual(hits, [[1005, 10000]]);
    assert.deepEqual(h.hpDeltas, [{ handle: 1005, delta: 10000 }]);
  });
});

// ── 6. 菜单/流程 ─────────────────────────────────────────────────────
describe('流程族：EnterWarprep / EnterMapmode / EnterPolicy / EnterBattle', () => {
  it('EnterWarprep 载入 5 组备战菜单资源（顺序与字节码一致）', () => {
    const loaded: string[] = [];
    const h = host(1, { loadResource: (p) => loaded.push(p) });
    h.call('EnterWarprep', []);
    const expect = ['MENU\\D0_*', 'MENU\\D1_2A', 'MENU\\D1_2B', 'MENU\\D12*', 'MENU\\WARPREP*'];
    assert.deepEqual(h.resources, expect);
    assert.deepEqual(loaded, expect);
  });

  it('EnterMapmode 先清 g2，再载入 6 组地图菜单资源', () => {
    const globals = new Map<number, number>([[2, 9]]);
    const h = host(1, { setGlobal: (i, v) => globals.set(i, v) });
    h.call('EnterMapmode', []);
    assert.equal(globals.get(2), 0, 'STG g2=0 是原作的第一条指令');
    assert.deepEqual(h.resources, [
      'MENU\\D3*',
      'MENU\\D4*',
      'MENU\\D28',
      'MENU\\D1_2A',
      'MENU\\D1_2B',
      'MENU\\D12*',
    ]);
  });

  it('EnterPolicy 载入 3 组内政菜单资源', () => {
    const h = host(1);
    h.call('EnterPolicy', []);
    assert.deepEqual(h.resources, ['MENU\\S0*', 'MENU\\C3_B*', 'MENU\\D1*']);
  });

  it('EnterBattle 就是 CALLS InitializeBattle(0,0,0,0)', () => {
    const calls: Array<{ name: string; args: number[] }> = [];
    const h = host(1, {
      callScript: (name, args) => {
        calls.push({ name, args });
      },
    });
    h.call('EnterBattle', []);
    assert.deepEqual(calls, [{ name: 'InitializeBattle', args: [0, 0, 0, 0] }]);
  });
});

// ── 7. R84 台词族（最后 9 条）─────────────────────────────────────────
describe('R84 台词族：Battle2 / CheckGround / BattleYield / StartBattle / BattleEndTalk / ReportResult / SearchTalk / ChildGenTalkNew / YieldGeneral', () => {
  it('Battle2 与 CheckGround 是原作自带的空函数：接管、但没有副作用', () => {
    const h = host(3);
    assert.deepEqual(h.call('Battle2', []), { handled: true });
    assert.deepEqual(h.call('CheckGround', [0]), { handled: true });
    assert.equal(h.events.length, 0, '两条都不该产生事件');
    assert.equal(h.texts.length, 0);
  });

  it('BattleYield：三段镜头 + 三句原文（层号 = arg3/arg2），收尾 0x139(0)+0x114(0)', () => {
    const h = host(11, {
      unitAt: (handle) => ({ x: handle * 10, y: handle * 10 + 64, col: 3, row: 4 }),
    });
    // 源序 (arg1..arg7) = (0, 2, 3, 4, 5, 60, 70)
    assert.deepEqual(h.call('BattleYield', [70, 60, 5, 4, 3, 2, 0]), { handled: true });
    assert.deepEqual(
      h.texts.map((t) => [t.speaker, t.general, t.line]),
      [
        [3, 0, '%S2%將軍，請加入我方，共創統一大業!!%k%%e%'],
        [2, 0, '就讓我們共創統一大業吧!!%k%%e%'],
        [3, 0, '將軍真是明智之舉!!%k%%e%'],
      ],
      '三句 0x3 的层号依次是 arg3 / arg2 / arg3',
    );
    // 三段镜头都推到 (x, y-128)：第一/三段是被招降方（句柄 70），第二段是招降方（60）
    assert.deepEqual([h.camera.x, h.camera.y], [700, 764 - 128]);
    const flags = h.events.flatMap((e) => (e.kind === 'battle-flag' ? [e] : []));
    assert.deepEqual(flags.map((e) => e.flag), [0x200, 0x1000], '0x139(0) → 0x200|0x1000');
    assert.equal(flags[flags.length - 1]?.state, 0x1200);
    const resets = h.events.flatMap((e) => (e.kind === 'engine-reset' ? [e] : []));
    assert.deepEqual(resets.map((e) => [e.what, e.arg]), [['overlay', 0]], '0x114(0)：清闪白，不触发暗场');
  });

  it('StartBattle(1)：先四组 0x6，再 BattleYield(g3,g2,g8,g7,2,3,1)', () => {
    const h = host(5, { global: (i) => ({ 2: 1002, 3: 1003, 7: 1007, 8: 1008 }[i] ?? 0) });
    assert.deepEqual(h.call('StartBattle', [1]), { handled: true });
    assert.deepEqual(
      h.acts.map((a) => [a.layer, a.action, a.general]),
      [
        [3, 1, 1007],
        [2, 1, 1008],
        [3, 2, 1008],
        [2, 2, 1007],
      ],
      '四条 0x6 的实参顺序与字节码一致',
    );
    assert.deepEqual(h.texts.map((t) => t.speaker), [1008, 1002, 1008], 'BattleYield 的层号 = arg3=g8 / arg2=g2');
    assert.equal(h.lines.length, 0, '这条分支走原文，不查 MSG 表');
  });

  it('StartBattle(0)：两段叫阵编号都落在 MSG300-409，且 do{}while 保证两段不同', () => {
    const h = host(5, {
      global: (i) => ({ 2: 1002, 3: 1003, 7: 1007, 8: 1008 }[i] ?? 0),
      unitAt: (handle) => ({ x: handle, y: handle + 200, col: 10, row: 10 }),
    });
    h.call('StartBattle', [0]);
    assert.equal(h.lines.length, 2, '两段叫阵各一句');
    assert.deepEqual(h.lines.map((l) => l.layer), [2, 3]);
    for (const l of h.lines) assert.ok(l.id >= 300 && l.id <= 409, `编号越界：${l.id}`);
    assert.notEqual(h.lines[0].id, h.lines[1].id, 'loc4 == loc3 要重掷');
    // 两段镜头：先是 g3 的战场（30 帧），再是 g2 的己方（60 帧）
    assert.deepEqual([h.camera.x, h.camera.y], [1002, 1202 - 128]);
    const resets = h.events.flatMap((e) => (e.kind === 'engine-reset' ? [e] : []));
    assert.deepEqual(resets.map((e) => e.arg), [1], '0x114(1) 在非战斗态会请求暗场淡入');
  });

  it('BattleEndTalk(1)：0x206 分区选 MSG500-568，两层 0x6 + 0x124 收尾', () => {
    const h = host(9, {
      global: (i) => ({ 7: 1007, 8: 1008 }[i] ?? 0),
      unitAt: (handle) =>
        handle === 1008
          ? { x: 0, y: 0, col: 10, row: 10 }
          : { x: 0, y: 0, col: 95, row: 95 },
    });
    h.call('BattleEndTalk', [1]);
    // loc3 = 0x206(g8) = 2（屏内）、loc4 = 0x206(g7) = 0（出屏）⇒ loc2 = 1
    assert.deepEqual(h.acts.map((a) => [a.layer, a.action, a.general]), [
      [2, 1, 1008],
      [2, 2, 1007],
    ]);
    assert.equal(h.lines.length, 1);
    assert.equal(h.lines[0]?.layer, 2);
    assert.ok((h.lines[0]?.id ?? 0) >= 500 && (h.lines[0]?.id ?? 0) <= 568, '追击败逃档');
    const resets = h.events.flatMap((e) => (e.kind === 'engine-reset' ? [e] : []));
    assert.deepEqual(resets.map((e) => e.what), ['talk'], '0x124 置 0x4A8A28=1');
  });

  it('BattleEndTalk(256)：loc2 = -1 ⇒ 不发台词，但照样 0x124 收尾', () => {
    const h = host(9, { global: (i) => ({ 7: 1, 8: 2 }[i] ?? 0) });
    h.call('BattleEndTalk', [256]);
    assert.equal(h.lines.length, 0);
    assert.equal(h.events.filter((e) => e.kind === 'engine-reset').length, 1);
  });

  it('ReportResult：8 条战报都是函数内常量，不依赖台词表', () => {
    const cases: Array<[number, string, number]> = [
      [1, '很遺憾，我軍戰敗了....%K%%E%', 1009],
      [2, '我軍勝利!!%K%%E%', 1007],
      [4, '我軍戰敗，%S1%將軍被俘了....%K%%E%', 1009],
      [8, '我軍大勝!俘虜敵將%S2%!!%K%%E%', 1007],
      [256, '%S1%將軍投靠敵方了....%K%%E%', 1009],
      [512, '說服%S2%將軍加入我方!!%K%%E%', 1007],
      [16, '雙方平手....%K%%E%', 1007],
      [0, '結果不明.......%K%%E%', 1007],
    ];
    for (const [arg, line, general] of cases) {
      const h = host(2, { global: (i) => ({ 7: 1007, 8: 1008, 9: 1009 }[i] ?? 0) });
      h.call('ReportResult', [arg]);
      assert.deepEqual(
        h.texts.map((t) => [t.speaker, t.general, t.line]),
        [[0, general, line]],
        `arg1=${arg}`,
      );
      assert.equal(h.acts.length, 3, '0x6(0,1|2|3, …) 三个槽都要派发');
      assert.equal(h.waits, 1, '开头 WAIT 1');
    }
  });

  it('SearchTalk：g1 握手（置 1 → 收尾置 0），0/1 两档是固定原文', () => {
    const sets: Array<[number, number]> = [];
    const h = host(4, {
      global: (i) => ({ 1: 1, 7: 1007, 9: 1009 }[i] ?? 0),
      setGlobal: (i, v) => sets.push([i, v]),
    });
    h.call('SearchTalk', [0]);
    assert.deepEqual(h.texts.map((t) => t.line), ['什麼都找不到....%k%%E%']);
    assert.deepEqual(sets, [[1, 1], [1, 0]], '起手 g1=1、收尾 g1=0');
    assert.equal(h.waits, 0, 'g1 已置 1 时不该再等帧');
  });

  it('SearchTalk(16)：MSG800/810 + SUCCESS 音效；g7==g8 时改发 812/813', () => {
    const h = host(4, {
      global: (i) => ({ 1: 1, 7: 1007, 8: 1008, 9: 1009 }[i] ?? 0),
    });
    h.call('SearchTalk', [16]);
    const ids = h.lines.map((l) => l.id);
    assert.equal(ids[0], 800, 'g7 != g8 才有 800');
    assert.ok((ids[1] ?? 0) >= 801 && (ids[1] ?? 0) <= 809);
    assert.equal(ids[2], 810);
    assert.equal(h.sounds[0]?.name, 'SUCCESS');
    // g7 != g8 ⇒ 不进 812/813 分支
    assert.ok(!ids.includes(812));

    const same = host(4, { global: (i) => ({ 1: 1, 7: 1007, 8: 1007, 9: 1009 }[i] ?? 0) });
    same.call('SearchTalk', [16]);
    const sameIds = same.lines.map((l) => l.id);
    assert.ok(!sameIds.includes(800), 'g7 == g8 时不发 800');
    assert.deepEqual(sameIds.slice(-2), [812, 813]);
  });

  it('SearchTalk(18/19)：FAILURE2 + MSG814/815', () => {
    const a = host(4, { global: (i) => ({ 1: 1, 7: 1007, 8: 1008, 9: 1009 }[i] ?? 0) });
    a.call('SearchTalk', [18]);
    assert.equal(a.sounds[0]?.name, 'FAILURE2');
    assert.ok(a.lines.map((l) => l.id).includes(814));
    const b = host(4, { global: (i) => ({ 1: 1, 7: 1007, 8: 1008, 9: 1009 }[i] ?? 0) });
    b.call('SearchTalk', [19]);
    assert.equal(b.sounds[0]?.name, 'FAILURE2');
    assert.ok(b.lines.map((l) => l.id).includes(815));
  });

  it('SearchTalk(20)：g7==g8 与不等的两个分支用不同号段', () => {
    const same = host(4, { global: (i) => ({ 1: 1, 7: 1007, 8: 1007, 9: 1009 }[i] ?? 0) });
    same.call('SearchTalk', [20]);
    assert.deepEqual(same.lines.slice(0, 2).map((l) => l.id), [817, 818]);
    assert.ok(same.sounds.some((s) => s.name === 'SUCCESS'));

    const diff = host(4, { global: (i) => ({ 1: 1, 7: 1007, 8: 1008, 9: 1009 }[i] ?? 0) });
    diff.call('SearchTalk', [20]);
    assert.equal(diff.lines[0]?.id, 816);
    assert.ok(diff.texts.some((t) => t.line === '%e%'), '不等分支以 %e% 收尾');
  });

  it('ChildGenTalkNew：LDGIDX0(30+arg1*2) 取两位武将，相等/不等两分支', () => {
    const globals = new Map<number, number>([
      [0, 1],
      [1, 0],
      [9, 5002],
      [32, 5001],
      [33, 5002],
    ]);
    const sets: Array<[number, number]> = [];
    const h = new SysoHost(
      { global: (i) => globals.get(i) ?? 0, setGlobal: (i, v) => sets.push([i, v]) },
      { seed: 5 },
    );
    h.call('ChildGenTalkNew', [1]);
    assert.deepEqual(
      h.acts.map((a) => [a.action, a.general]),
      [
        [3, 5001],
        [1, 5002],
      ],
      'loc3 走 action 3、loc4 走 action 1',
    );
    // loc4(5002) == loc5(g9=5002) ⇒ 进 817/818 分支
    assert.deepEqual(h.lines.slice(0, 2).map((l) => l.id), [817, 818]);
    assert.equal(h.sounds[0]?.name, 'SUCCESS');
    assert.deepEqual(sets, [[1, 1], [1, 0]], 'STGIDX(1,1) … STGIDX(0,1)');

    globals.set(9, 5003); // 让 loc4 != loc5
    const other = new SysoHost({ global: (i) => globals.get(i) ?? 0 }, { seed: 5 });
    other.call('ChildGenTalkNew', [1]);
    assert.equal(other.lines[0]?.id, 816);
  });

  it('YieldGeneral(arg2=1)：MSG950-988 + SUCCESS + 0x211；arg1 原作未读', () => {
    const yielded: number[] = [];
    const h = host(6, {
      global: (i) => ({ 7: 1007, 8: 1008 }[i] ?? 0),
      confirmYield: (g) => yielded.push(g),
    });
    assert.deepEqual(h.call('YieldGeneral', [12345, 1]), { handled: true });
    assert.deepEqual(
      h.acts.map((a) => [a.layer, a.action, a.general]),
      [
        [1, 2, 1008],
        [0, 2, 1008],
      ],
      '0x6(1,2,g8) 与 0x6(0,2,g8) 都要派发',
    );
    assert.equal(h.lines.length, 2);
    assert.ok((h.lines[0]?.id ?? 0) >= 950 && (h.lines[0]?.id ?? 0) <= 966);
    assert.ok((h.lines[1]?.id ?? 0) >= 980 && (h.lines[1]?.id ?? 0) <= 988);
    assert.equal(h.sounds[0]?.name, 'SUCCESS');
    assert.deepEqual(yielded, [1007], '0x211 收尾');
    assert.equal(h.waits, 20, 'WAIT 20');
  });

  it('YieldGeneral(arg2=0)：不播音效，仍走 0x211', () => {
    const yielded: number[] = [];
    const h = host(6, {
      global: (i) => ({ 7: 1007, 8: 1008 }[i] ?? 0),
      confirmYield: (g) => yielded.push(g),
    });
    h.call('YieldGeneral', [0, 0]);
    assert.equal(h.sounds.length, 0);
    assert.equal(h.lines.length, 2);
    assert.ok((h.lines[1]?.id ?? 0) >= 970 && (h.lines[1]?.id ?? 0) <= 978);
    assert.deepEqual(yielded, [1007]);
  });

  it('注入 msg 端口后，0xA 的编号会换成原文并走 0x3 台词通道', () => {
    const h = host(8, {
      global: (i) => ({ 1: 1, 7: 1, 8: 2, 9: 3 }[i] ?? 0),
      msg: (id) => `MSG${id}`,
    });
    h.call('SearchTalk', [16]);
    assert.equal(h.lines[0]?.id, 800);
    assert.equal(h.lines[0]?.text, 'MSG800');
    assert.ok(h.texts.some((t) => t.line === 'MSG800'), 'msg 命中后要真的进台词列表');
  });
});

// ── 8. 接进 Runtime ──────────────────────────────────────────────────
describe('接线：Runtime 里的 SYSTEM.SO 宿主库', () => {
  const world = createWorld({
    data,
    seed: 6,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });

  it('技能会话里挂着一个 SysoHost，且内存族读的是本场的引擎数组（g2 = 主将句柄）', () => {
    const session = startSkill(world, 'A', 501, 24, 6);
    const h = session.syso;
    assert.ok(h instanceof SysoHost);
    // g2 由 Runtime 构造函数写进引擎槽 2 = 基址 + 8
    const g2 = valueOf(h, 'GetInt_Old', SYSTEM_SO_BASE + 8);
    assert.ok(g2 >= 1000, `g2 应当是单位句柄（>=1000），实际 ${g2}`);
    // g3 = 目标句柄，另一格；两格不同说明确实按 (addr-base)>>2 映射
    const g3 = valueOf(h, 'GetInt_Old', SYSTEM_SO_BASE + 12);
    assert.notEqual(g2, g3);
    assert.equal(valueOf(h, 'GetInt_Old', SYSTEM_SO_BASE), 0, '0 号槽 WARNING 常量不该被动过');
  });

  it('技能会话里调宿主函数会真的落到 world/物件上（EnterWar5 → 22 个物件）', () => {
    const session = startSkill(world, 'A', 501, 24, 6);
    const r = session.syso.call('EnterWar5', []);
    assert.equal(r.handled, true);
    assert.equal(session.syso.spawns.length, 22);
    assert.ok(session.syso.spawns.every((s) => s.handle >= 1), '句柄必须由 Runtime.spawnObject 分配');
  });
});
