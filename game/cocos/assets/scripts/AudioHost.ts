/**
 * 播放端（Cocos 3.8）：把 `AudioBus` 的事件接到一组 `AudioSource` 上。
 *
 * 分工：
 *   - `AudioBus.ts` 只负责「谁该响、多响、什么顺序」，与引擎无关；
 *   - 本文件负责「怎么响」：bundle 载入 `AudioClip`、8 声部池、同名节流、
 *     每 tick 最多 2 声（对齐 `game/src/view/main.js:129 battleSfx()` 的策略）、
 *     BGM 交叉淡入、战场底噪。
 *
 * 资源路径（都在自定义 bundle `res` 里，见 `work/cocos_sync/manifest.csv`）：
 *   audio/sfx/<名>.mp3      99 个原版音效
 *   audio/bgm/<NN>.mp3      10 首（03 菜单 / 04-06 地形 / 10-14 内政 / 17 大地图）
 *
 * 为什么节流：原作一次普攻会同时命中多个兵（`docs/04b4`），不节流就是机关枪。
 * web 侧实测的参数是「同名 60 ms 内只响一次 + 每 tick 最多 2 声」，这里照抄。
 *
 * CDN 通道（R83，见 `project/77_音频CDN通道.md`）：曾经微信小游戏 20 MB 装不下 16.07 MB 音频，
 * 出包时音频被剔除（`tools/build_wechat.ps1 -Audio cdn`），改由 CDN 提供。
 *
 * 本地音频（R204，见 `project/204_本地音频分包.md`）：微信小游戏配额已到 30 MB，
 * BGM 转 56k + SFX 原样后音频共 11.56 MB 能塞进分包（`-Audio embed`），所以**默认走包内**：
 *
 *   - `assets/bundles/res/audio-manifest.json`（`tools/pack_audio_local.ps1` 生成）列出
 *     109 档逻辑名 → 包内相对路径；bundle 加载时用它把逻辑名换成资源路径；
 *   - `assets/bundles/res/audio-remote.json` 的 `base`（或构造参数 `remoteBase`）非空 → 仍走 CDN
 *     覆盖，CDN 取不到再回退包内；为空或没有该文件 → 纯包内；
 *   - 进 CDN 前不 await 任何东西：`playSfx` 只“发起加载并丢掉这一声”，不会卡 tick。
 *
 * 载入失败**绝不抛异常**：战场的音效缺一个不该让整局崩掉。缺档只在两种情况下 `console.warn` 一次：
 * CDN 请求失败（每条 URL 一次），或包内清单里声明了、bundle 里却载不到（每条路径一次）；
 * 完全没声明过的动态名仍然静默。缺档统一记在 `stats.missing` 里。
 */
import { AudioClip, AudioSource, JsonAsset, Node, assetManager } from 'cc';
import type { Asset } from 'cc';
import type { AudioSink, BattleAudioMark } from './AudioBus';
import { audioPath, battleAudioEvents, setAudioSink } from './AudioBus';
import { getResBundle } from './DataLoader';
import type { Bundle } from './DataLoader';
import type { World } from './core/battle';

/** 声部数：8 个足够盖住「命中 + 格挡 + 死亡 + 主将挨打 + 撤退」同时发生。 */
export const VOICES = 8;
/** 同名音最短间隔（ms） */
export const SFX_GAP_MS = 60;
/** 每 tick 最多几声（对齐 main.js 的 `battleSfx` 预算） */
export const SFX_PER_TICK = 2;
/** sfx 基准音量（web: `CONF.sfxVolume = 0.8`） */
export const SFX_VOLUME = 0.8;
/** bgm 基准音量（web: `CONF.bgmVolume = 0.45`） */
export const BGM_VOLUME = 0.45;
/** 底噪比 BGM 低 9 dB（web: `CONF.ambienceDb = -9`） */
export const AMBIENCE_DB = -9;
/** 包内 CDN 配置（`assets/bundles/res/audio-remote.json`）：`{ "base": "https://…/audio-cdn/" }`。 */
export const AUDIO_REMOTE_JSON = 'audio-remote';
/** 构建脚本 `-Audio cdn` 生成的清单名（包根放一份，CDN 根也放一份）。 */
export const AUDIO_MANIFEST_JSON = 'audio-manifest.json';
/**
 * 包内清单的资源路径（`assets/bundles/res/audio-manifest.json`，`tools/pack_audio_local.ps1` 生成）。
 * bundle 里的资源路径不带扩展名，所以这里是 `audio-manifest` 而不是文件名。
 */
export const AUDIO_MANIFEST_ASSET = 'audio-manifest';

/**
 * 技能音：`fx_dir_primary` → 资源名（逐条抄 `game/web/audio.js:59-68` 的 `MAGIC_SFX`）。
 * 表里没有的目录号（006/011/014/019/024/027/030/032/036/038）原作就没有 wav，静默。
 */
export const MAGIC_SFX: Record<string, string> = {
  '001': 'm001snd01',
  '002': 'm002snd01',
  '003': 'm003snd01',
  '004': 'm004snd01',
  '005': 'm005snd01',
  '007': 'm007snd01',
  '008': 'm008snd01',
  '009': 'm009snd01',
  '010': 'm010snd01',
  '012': 'm012snd01',
  '013': 'm013snd01',
  '015': 'm015snd01',
  '016': 'm016snd01',
  '017': 'm017snd01',
  '018': 'm018snd01',
  '020': 'm020snd01',
  '021': 'm021snd01',
  '022': 'm022snd01',
  '023': 'm023snd01',
  '025': 'm025snd01',
  '026': 'm026snd01',
  '028': 'm028snd01',
  '029': 'm029snd01',
  '031': 'm031snd01',
  '033': 'm033snd01',
  '034': 'm034snd01',
  '035': 'm035snd01',
  '037': 'm037snd01',
  '039': 'm039snd01',
  '040': 'm040snd01',
};

/** 地形 id → BGM 曲号（`game/web/audio.js:38 TERRAIN_TRACK`，与 `terrains.json.SoundTrack` 同值）。 */
export const TERRAIN_TRACK = [6, 5, 4, 4, 6, 5, 4, 6, 6, 5, 5, 4];

/** 战斗开场先预热的音效：第一次命中就要有声音，不能等首次加载。 */
export const BATTLE_PRELOAD = [
  'hit01',
  'hit02',
  'defense',
  'death',
  'death3',
  'horse02',
  'yell01',
  'yell02',
  'yell03',
  'yell04',
  'rush01',
  'victory',
  'm016snd01',
  'success',
  'failure2',
];

/** 7 位补零：`4` → `'04'`。 */
export function pad2(n: number): string {
  const v = Math.trunc(Math.abs(n)) % 100;
  return v < 10 ? `0${v}` : String(v);
}

interface Voice {
  node: Node;
  source: AudioSource;
}

export interface AudioHostOptions {
  voices?: number;
  sfxGapMs?: number;
  sfxPerTick?: number;
  sfxVolume?: number;
  bgmVolume?: number;
  /**
   * 显式指定 CDN 根，覆盖包内 `audio-remote.json`（探针/换 CDN 用）。
   * `undefined` = 读包内配置；`''` = 强制走包内。
   */
  remoteBase?: string;
}

/**
 * 一个战场一套（`BattleRoot.onLoad` 建、`onDestroy` 拆）。不做单例：
 * 单例会跨场景留住已解码的 clip，但也会跨场景留住 sink，反而容易漏摘。
 */
export class AudioHost {
  readonly root: Node;

  private readonly voices: Voice[] = [];
  private readonly bgmVoice: Voice;
  private readonly ambienceVoice: Voice;

  /** 已加载的 clip；`null` = 加载失败（负缓存） */
  private readonly clips = new Map<string, AudioClip | null>();
  /** 正在加载的路径 → 完成回调队列 */
  private readonly pending = new Map<string, ((clip: AudioClip | null) => void)[]>();

  private readonly sfxGapMs: number;
  private readonly sfxVolume: number;
  private readonly bgmVolume: number;
  private sfxPerTick: number;

  private nextVoice = 0;
  private budget = 0;
  private readonly lastPlayAt = new Map<string, number>();

  private bgmKey = '';
  private bgmTarget = 0;
  private ambienceTarget = 0;
  private bgmToken = 0;

  /** 渲染层每帧读：闪白强度 0..1、画面亮度 0..16 */
  private flashStrength = 0;
  private brightness = 16;

  private muted = false;
  private disposed = false;

  /** `null` = 跟包内 `audio-remote.json` 走；`''` / URL = 构造时显式指定。 */
  private readonly remoteBase: string | null;

  /**
   * 统计（调试/验收用）。`remote` = 从 CDN 取到的档数，`local` = 从包内 bundle 取到的档数，
   * `base` = 实际生效的 CDN 根（`''` = 走包内），`missing` = 确认取不到的档次。
   */
  readonly stats = { requested: 0, played: 0, throttled: 0, missing: 0, bgm: '', remote: 0, local: 0, base: '' };

  constructor(parent: Node, opts: AudioHostOptions = {}) {
    const count = Math.max(1, Math.trunc(opts.voices ?? VOICES));
    this.sfxGapMs = opts.sfxGapMs ?? SFX_GAP_MS;
    this.sfxPerTick = opts.sfxPerTick ?? SFX_PER_TICK;
    this.sfxVolume = opts.sfxVolume ?? SFX_VOLUME;
    this.bgmVolume = opts.bgmVolume ?? BGM_VOLUME;
    this.remoteBase = typeof opts.remoteBase === 'string' ? normalizeRemoteBase(opts.remoteBase) : null;

    this.root = new Node('AudioHost');
    this.root.parent = parent;

    for (let i = 0; i < count; i += 1) {
      const node = new Node(`Voice${i}`);
      node.parent = this.root;
      this.voices.push({ node, source: node.addComponent(AudioSource) });
    }

    const bgmNode = new Node('Bgm');
    bgmNode.parent = this.root;
    const bgmSource = bgmNode.addComponent(AudioSource);
    bgmSource.loop = true;
    bgmSource.volume = 0;
    this.bgmVoice = { node: bgmNode, source: bgmSource };

    const ambNode = new Node('Ambience');
    ambNode.parent = this.root;
    const ambSource = ambNode.addComponent(AudioSource);
    ambSource.loop = true;
    ambSource.volume = 0;
    this.ambienceVoice = { node: ambNode, source: ambSource };
  }

  // ── 总线接线 ────────────────────────────────────────────────────────

  /** 造一个 sink：AudioBus 的全部事件都落到本 host。 */
  sink(): AudioSink {
    return {
      sfx: (name, opts) => this.playSfx(name, opts.volume),
      magic: (dir, opts) => this.playMagic(dir, opts.volume),
      flash: (on, opts) => {
        this.flashStrength = on ? Math.max(this.flashStrength, opts.strength) : 0;
      },
      brightness: (level) => {
        this.brightness = level;
      },
    };
  }

  /** 把自己注册成全局 sink（战斗场景里调一次）。 */
  install(): void {
    setAudioSink(this.sink());
  }

  uninstall(): void {
    setAudioSink(null);
  }

  // ── 战斗集成 ────────────────────────────────────────────────────────

  /** 每个逻辑 tick 结束后调一次：推进快照、重置预算、逐条播放。 */
  pump(world: World, mark: BattleAudioMark): void {
    this.budget = this.sfxPerTick;
    const events = battleAudioEvents(world, mark);
    for (const ev of events) {
      if (this.budget <= 0) break;
      if (ev.kind === 'sfx') this.playSfx(ev.name, ev.volume);
      else if (ev.kind === 'magic') this.playMagic(ev.dir, ev.volume);
    }
  }

  /** 按地形开战 BGM：`TERRAIN_TRACK[terrain]`，缺资源回退 04。 */
  playTerrainBgm(terrain: number): void {
    const idx = Number.isFinite(terrain) ? ((Math.trunc(terrain) % TERRAIN_TRACK.length) + TERRAIN_TRACK.length) % TERRAIN_TRACK.length : 0;
    this.playBgm(TERRAIN_TRACK[idx] as number);
  }

  /** 战场底噪：按地形取 `bg03a/bg04a/bg08a/bg09a` 之一，循环、低 9 dB。 */
  playBattleAmbience(terrain: number): void {
    const names = ['bg03a', 'bg04a', 'bg08a', 'bg09a'];
    const idx = Number.isFinite(terrain) ? Math.abs(Math.trunc(terrain)) % names.length : 0;
    const name = names[idx] as string;
    const path = audioPath('sfx', name);
    this.getClip(path, (clip) => {
      if (this.disposed || !clip) return;
      this.ambienceVoice.source.stop();
      this.ambienceVoice.source.clip = clip;
      const linear = Math.pow(10, AMBIENCE_DB / 20);
      this.ambienceTarget = this.bgmVolume * linear;
      this.ambienceVoice.source.volume = 0;
      this.ambienceVoice.source.play();
    });
  }

  // ── sfx ─────────────────────────────────────────────────────────────

  /** 播一个音效。没加载 → 发起加载并丢弃这一声（下一声就有）。 */
  playSfx(name: string, volume = 1): void {
    if (this.disposed || this.muted || !name) return;
    this.stats.requested += 1;
    if (this.budget <= 0) {
      this.stats.throttled += 1;
      return;
    }
    const now = Date.now();
    const last = this.lastPlayAt.get(name) ?? -1e9;
    if (now - last < this.sfxGapMs) {
      this.stats.throttled += 1;
      return;
    }
    const path = audioPath('sfx', name);
    const cached = this.clips.get(path);
    if (cached === undefined) {
      void this.loadClip(path);
      return;
    }
    if (cached === null) {
      this.stats.missing += 1;
      return;
    }
    const voice = this.voices[this.nextVoice % this.voices.length] as Voice;
    this.nextVoice += 1;
    const vol = Math.max(0, Math.min(1, volume)) * this.sfxVolume;
    voice.source.playOneShot(cached, vol);
    this.lastPlayAt.set(name, now);
    this.budget -= 1;
    this.stats.played += 1;
  }

  /** 技能音：`dir` 是 3 位特效目录号；查不到资源静默（与 web 一致）。 */
  playMagic(dir: string, volume = 1): void {
    const name = MAGIC_SFX[dir];
    if (!name) return;
    // 技能音不受「每 tick 2 声」限制（放技本来就是低频事件），只受同名间隔约束
    const saved = this.budget;
    this.budget = Math.max(this.budget, 1);
    this.playSfx(name, volume);
    this.budget = saved;
  }

  /** 一次性预热（战斗开场调）。 */
  preload(names: string[]): void {
    for (const name of names) {
      const path = audioPath('sfx', name);
      if (!this.clips.has(path)) void this.loadClip(path);
    }
  }

  // ── bgm ─────────────────────────────────────────────────────────────

  /** 播 BGM（曲号 3..17，或已是两位字符串）。同一首重复调只调音量。 */
  playBgm(track: number | string, volume?: number): void {
    if (this.disposed) return;
    const key = /^\d{1,2}$/.test(String(track)) ? pad2(Number(track)) : String(track);
    const target = Math.max(0, Math.min(1, volume ?? this.bgmVolume));
    if (this.bgmKey === key) {
      this.bgmTarget = this.muted ? 0 : target;
      return;
    }
    this.bgmKey = key;
    this.bgmTarget = this.muted ? 0 : target;
    this.stats.bgm = key;
    const token = ++this.bgmToken;
    this.getClip(audioPath('bgm', key), (clip) => {
      if (this.disposed || token !== this.bgmToken) return;
      if (!clip) {
        // 缺曲目：回退 04（地形曲），再缺就安静
        if (key !== '04') this.playBgm(4, target);
        return;
      }
      const src = this.bgmVoice.source;
      src.stop();
      src.clip = clip;
      src.volume = 0;
      src.play();
    });
  }

  /** 停 BGM（`fadeMs` 只控制淡出时长，0 = 立刻）。 */
  stopBgm(): void {
    this.bgmKey = '';
    this.bgmTarget = 0;
    this.bgmToken += 1;
    this.bgmVoice.source.stop();
    this.bgmVoice.source.volume = 0;
    this.ambienceVoice.source.stop();
    this.ambienceVoice.source.volume = 0;
    this.stats.bgm = '';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.bgmTarget = 0;
      this.ambienceTarget = 0;
    } else if (this.bgmKey) {
      this.bgmTarget = this.bgmVolume;
    }
  }

  // ── 每帧 ────────────────────────────────────────────────────────────

  /** 淡入淡出。`dt` 秒。 */
  update(dt: number): void {
    if (this.disposed) return;
    const k = Math.min(1, Math.max(0, dt) * 6);
    const bgm = this.bgmVoice.source;
    bgm.volume += (this.bgmTarget - bgm.volume) * k;
    if (this.bgmTarget <= 0 && bgm.volume < 0.005) {
      bgm.volume = 0;
      if (bgm.playing) bgm.stop();
    }
    const amb = this.ambienceVoice.source;
    amb.volume += (this.ambienceTarget - amb.volume) * k;
    // 闪白自然衰减（渲染层读 flashStrength）
    this.flashStrength = Math.max(0, this.flashStrength - Math.max(0, dt) * 6);
  }

  /** 渲染层读：闪白强度 0..1（0 = 不画）。 */
  getFlash(): number {
    return this.flashStrength;
  }

  /** 渲染层读：画面亮度 0..16（16 = 正常）。 */
  getBrightness(): number {
    return this.brightness;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.uninstall();
    for (const v of this.voices) {
      if (v.source.playing) v.source.stop();
    }
    if (this.bgmVoice.source.playing) this.bgmVoice.source.stop();
    if (this.ambienceVoice.source.playing) this.ambienceVoice.source.stop();
    this.clips.clear();
    this.pending.clear();
    this.root.destroy();
  }

  // ── 加载 ────────────────────────────────────────────────────────────

  private getClip(path: string, cb: (clip: AudioClip | null) => void): void {
    const cached = this.clips.get(path);
    if (cached !== undefined) {
      cb(cached);
      return;
    }
    const queue = this.pending.get(path);
    if (queue) {
      queue.push(cb);
      return;
    }
    this.pending.set(path, [cb]);
    void this.loadClip(path);
  }

  /**
   * 载入一个 clip：默认包内（包内清单 + `res` bundle）；`remoteBase` 非空时 CDN 优先，
   * CDN 取不到再回退包内；两边都没有 → `null`（负缓存，本局不再重试）。
   * 整条链不 reject，所以 `pending` 队列一定会被清空。
   */
  private loadClip(path: string): Promise<AudioClip | null> {
    const basePromise = this.remoteBase === null ? ensureAudioBase() : Promise.resolve(this.remoteBase);
    return basePromise
      .then((base: string) => {
        this.stats.base = base;
        if (!base) {
          return loadBundleClip(path).then((clip: AudioClip | null) => {
            if (clip) this.stats.local += 1;
            return clip;
          });
        }
        return loadRemoteClip(base, path).then((clip: AudioClip | null) => {
          if (clip) {
            this.stats.remote += 1;
            return clip;
          }
          // CDN 缺这一档：`-Audio embed` 的包内有得补；`-Audio cdn` 的包内没有，落到 null
          return loadBundleClip(path).then((fallback: AudioClip | null) => {
            if (fallback) this.stats.local += 1;
            return fallback;
          });
        });
      })
      .catch((): AudioClip | null => null)
      .then((clip: AudioClip | null) => {
        this.clips.set(path, clip);
        const queue = this.pending.get(path) ?? [];
        this.pending.delete(path);
        for (const cb of queue) cb(clip);
        return clip;
      });
  }
}

// ── CDN 远端加载（R83）────────────────────────────────────────────────────
//
// 三件事，全部「失败即 null」：
//   1) 读包内 `audio-remote.json` 拿 base（模块级只读一次，全 host 共享）；
//   2) base 非空时取一次 `audio-manifest.json`（逻辑名 → 相对路径）；
//   3) `assetManager.loadRemote<AudioClip>(url, { ext: '.mp3' })`。
//
// 为什么用 `loadRemote` 而不是自己 `wx.downloadFile`：3.8.8 的音频下载器会在
// 小程序端把文件落到本地临时路径再交给 `wx.createInnerAudioContext`，域名白名单
// 也走微信的「downloadFile 合法域名」，与其它 CDN 资源一致。

/** 清单里的一条：相对路径 + 字节数 + sha256 前 12 位（后两个只给人核对，运行时不校验）。 */
export interface AudioRemoteFile {
  path?: string;
  bytes?: number;
  sha256?: string;
}

/** `dist\audio-cdn\audio-manifest.json` 的形状（`tools/build_wechat.ps1 -Audio cdn` 生成）。 */
export interface AudioRemoteManifest {
  version?: number;
  bundle?: string;
  source?: string;
  count?: number;
  bytes?: number;
  files?: Record<string, AudioRemoteFile>;
}

/** 模块级缓存：配置/清单只读一次，warn 每条只打一次。 */
const cache: {
  base: Promise<string> | null;
  local: Promise<Map<string, string> | null> | null;
  manifests: Map<string, Promise<Map<string, string> | null>>;
  warned: Set<string>;
} = { base: null, local: null, manifests: new Map(), warned: new Set() };

/** 去空白 + 去尾斜杠；`''` 原样返回（= 走包内）。 */
export function normalizeRemoteBase(base: string): string {
  return String(base ?? '').trim().replace(/\/+$/, '');
}

/** 拼远端 URL：`base + '/' + 相对路径`；base 为空时只回相对路径（便于日志）。 */
export function audioRemoteUrl(base: string, relPath: string): string {
  const b = normalizeRemoteBase(base);
  const rel = String(relPath ?? '').replace(/^\/+/, '');
  if (!b) return rel;
  return `${b}/${rel}`;
}

/** 清模块级缓存（探针 / 运行中换 CDN 时用；正常游戏流程不会调）。 */
export function resetAudioRemote(): void {
  cache.base = null;
  cache.local = null;
  cache.manifests.clear();
  cache.warned.clear();
}

/** 同一条消息只 warn 一次（缺 109 档也不会刷 109 行）。 */
function warnOnce(message: string): void {
  if (cache.warned.has(message)) return;
  cache.warned.add(message);
  console.warn(`[AudioHost] ${message}`);
}

/** 读包内 `audio-remote.json` → base；没有该文件 / 格式不对 → `''`（静默走包内）。 */
function readRemoteBase(asset: JsonAsset | null): string {
  const data = asset ? asset.json : null;
  if (!data || typeof data !== 'object') return '';
  const raw = data['base'];
  return typeof raw === 'string' ? normalizeRemoteBase(raw) : '';
}

/** 清单里的相对路径（`audio/bgm/04.mp3`）→ bundle 资源路径（`audio/bgm/04`）。 */
function bundlePathOf(files: Map<string, string> | null, path: string): string {
  const rel = files?.get(path);
  if (!rel) return path;
  return rel.replace(/\.mp3$/i, '');
}

/**
 * 包内加载：先读包内清单（只读一次）把逻辑名换成资源路径，再 `getResBundle()` 四参 `load`。
 * 清单里声明了却载不到 → warn 一次（每条路径一次）；没声明过的动态名保持静默。
 */
function loadBundleClip(path: string): Promise<AudioClip | null> {
  return getResBundle()
    .then((bundle: Bundle) => ensureLocalManifest().then((files: Map<string, string> | null) =>
      new Promise<AudioClip | null>((resolve) => {
        bundle.load(bundlePathOf(files, path), AudioClip, null, (err: Error | null, clip: AudioClip) => {
          if (err || !clip) {
            if (files?.has(path)) warnOnce(`包內缺档：${path}（清單里有，bundle 里没载到）`);
            resolve(null);
            return;
          }
          resolve(clip);
        });
      })))
    .catch((): AudioClip | null => null);
}

function loadAudioBase(): Promise<string> {
  return getResBundle()
    .then((bundle: Bundle) => new Promise<string>((resolve) => {
      bundle.load(AUDIO_REMOTE_JSON, JsonAsset, null, (err: Error | null, asset: JsonAsset) => {
        resolve(err || !asset ? '' : readRemoteBase(asset));
      });
    }))
    .catch((): string => '');
}

/** 包内 CDN 配置只读一次（所有 host 共享）。 */
function ensureAudioBase(): Promise<string> {
  if (cache.base === null) cache.base = loadAudioBase();
  return cache.base;
}

/** 包内清单只读一次；取不到/格式不对 → `null`（退回 `逻辑名.mp3` 约定，同样只 warn 一次）。 */
function ensureLocalManifest(): Promise<Map<string, string> | null> {
  if (cache.local !== null) return cache.local;
  const pending = getResBundle()
    .then((bundle: Bundle) => new Promise<Map<string, string> | null>((resolve) => {
      bundle.load(AUDIO_MANIFEST_ASSET, JsonAsset, null, (err: Error | null, asset: JsonAsset) => {
        if (err || !asset) {
          warnOnce(`包內清單 ${AUDIO_MANIFEST_JSON} 取不到（改按 逻辑名.mp3 约定加载）`);
          resolve(null);
          return;
        }
        resolve(parseManifest(asset));
      });
    }))
    .catch((): Map<string, string> | null => null);
  cache.local = pending;
  return pending;
}

function parseManifest(asset: JsonAsset | null): Map<string, string> | null {
  const data = asset ? asset.json : null;
  if (!data || typeof data !== 'object') return null;
  const files = data['files'];
  if (!files || typeof files !== 'object') return null;
  const table = files as Record<string, AudioRemoteFile>;
  const map = new Map<string, string>();
  for (const key of Object.keys(table)) {
    const entry = table[key];
    if (entry && typeof entry.path === 'string' && entry.path) map.set(key, entry.path);
  }
  return map.size > 0 ? map : null;
}

/** 取一次清单（每个 base 一次）。失败 → `null`（调用方退回 `逻辑名 + '.mp3'`）。 */
function ensureManifest(base: string): Promise<Map<string, string> | null> {
  const cached = cache.manifests.get(base);
  if (cached) return cached;
  const url = audioRemoteUrl(base, AUDIO_MANIFEST_JSON);
  const pending = loadRemoteAsset<JsonAsset>(url, '.json')
    .then((asset: JsonAsset | null) => {
      const map = parseManifest(asset);
      if (!map) warnOnce(`清單取不到或格式不對：${url}（改按 逻辑名.mp3 拼 URL）`);
      return map;
    })
    .catch((): Map<string, string> | null => null);
  cache.manifests.set(base, pending);
  return pending;
}

/** `assetManager.loadRemote` 的 Promise 包装：失败/抛异常都 resolve(null)，绝不 reject。 */
function loadRemoteAsset<T extends Asset>(url: string, ext: string): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    try {
      assetManager.loadRemote<T>(url, { ext }, (err: Error | null, asset: T) => {
        if (err || !asset) {
          warnOnce(`遠端取不到：${url}（${err?.message ?? 'no asset'}）`);
          resolve(null);
          return;
        }
        resolve(asset);
      });
    } catch (e) {
      warnOnce(`loadRemote 拋異常：${url}（${String(e)}）`);
      resolve(null);
    }
  });
}

function loadRemoteClip(base: string, path: string): Promise<AudioClip | null> {
  return ensureManifest(base).then((files: Map<string, string> | null) => {
    const rel = files?.get(path) ?? `${path}.mp3`;
    return loadRemoteAsset<AudioClip>(audioRemoteUrl(base, rel), '.mp3');
  });
}
