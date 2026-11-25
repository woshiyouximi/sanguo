/**
 * 战场天气（R39）——「存在」有据，「数值」无据，一切数值影响都标 `[推测]`。
 *
 * ## 有据可查的部分（只有三条）
 * 1. 天气是**开战时**由战斗脚本初始化的：`docs/04-脚本引擎SmartScript.md:657-658`
 *    「StartBattle … 初始化双方阵型、镜头、**天气**（见 8.5）」，命令表里给的是
 *    `ProduceRain`(11) / `ProduceSnow`(14) / `ProduceFog`(11)（同文件 `:691-694`）。
 * 2. 天气是**物件**：`docs/03b-物件表THINGS.md:491-500` 的虚拟物件表
 *    `9994-9996 | 雨水 等 | WeatherObjectProcess，天气层`；`work/probe_objects.txt:271-275`
 *    给出 seq 271/272/273 = 9994/9995/9996 `%WeatherObjectProcess \ 雨水`。
 * 3. 天气对象跑一个 213 字节的 Process：`docs/04b4_普攻伤害与Process.md:150`
 *    `| 19 | Weather | 0x40AD80 | 天气（213B） | 无 [推测] |` —— 文档自己在"行为"一栏写的是
 *    「无 [推测]」，`work/pagemap2.txt:288` 也只有它的尺寸，`0x40AD80` **没有反汇编**。
 *    本仓库里没有 `Sango2.exe`（只有 CocosCreator），所以这一代补不出来。
 *
 * 结论：**原作天气对战斗数值的影响，一条依据都没有。** 下面两张表全部是 `[推测]`：
 *  - `weatherOf()` 的「月 × 地形」映射：为了把 `ProduceRain/Snow/Fog` 这三条命令
 *    接回开战流程，给它一个确定性的、可复现的选法；
 *  - `weatherHitMod()` 的命中修正：为了不让 `world.weather` 变成一个死变量。
 *    挑命中而不是伤害，是因为 `0x43EC54` 的伤害公式已经被 04b4 逆得逐位清楚
 *    （R46 已按它重写），再往里面叠一个凭空的系数会立刻和原作对不上。
 *
 * 缺省行为：`createWorld` 不给 `month` 时天气恒 0（晴），命中修正为 0，
 * 所以既有的仿真与测试曲线一位都不变。
 */

/** 0 晴 / 1 雨 / 2 雪 / 3 雾（`docs/04b:530` 的"状态码"是另一套，别混） */
export type Weather = 0 | 1 | 2 | 3;

export const WEATHER_NAME: Record<number, string> = { 0: '晴', 1: '雨', 2: '雪', 3: '雾' };

/** 地形 id（`data/terrains.json` 的 `_index`）：0/1/2 城、3 船上、4 草原、5 平原、6 山地、7 森林、8 雪原、9 沙漠、10 關卡、11 長城 */
const TERRAIN_SNOWFIELD = 8;
const TERRAIN_DESERT = 9;
const TERRAIN_WET = new Set([3, 4, 5, 6, 7]); // 船上/草原/平原/山地/森林：会下雨/起雾的地形
const TERRAIN_FOGGY = new Set([6, 7, 10, 11]); // 山地/森林/關卡/長城：容易起雾

function normMonth(month: number): number {
  if (!Number.isFinite(month)) return 1;
  const m = Math.round(month);
  return ((m - 1) % 12 + 12) % 12 + 1; // 1..12，越界环绕
}

/**
 * 「月 × 地形」→ 天气。`[推测]`
 *
 * 选法（写死、无随机，方便复现）：
 * 1. 雪原（8）恒雪；
 * 2. 冬季（12/1/2 月）非沙漠 → 雪；
 * 3. 夏季（6/7/8 月）且是"会湿"的地形（船上/草原/平原/山地/森林）→ 雨；
 * 4. 春秋（3/4/5、9/10/11 月）且是山地/森林/關卡/長城 → 雾；
 * 5. 其余 → 晴。
 */
export function weatherOf(month: number, terrain: number): Weather {
  const m = normMonth(month);
  const t = Number.isFinite(terrain) ? Math.round(terrain) : -1;
  if (t === TERRAIN_SNOWFIELD) return 2;
  if ((m === 12 || m === 1 || m === 2) && t !== TERRAIN_DESERT) return 2;
  if (m >= 6 && m <= 8 && TERRAIN_WET.has(t)) return 1;
  if (TERRAIN_FOGGY.has(t)) return 3;
  return 0;
}

/**
 * 天气 → 命中判定值 p 的**绝对**修正（p 的分母是 300，`rand()%300 < p`）。
 * `[推测]` —— 没有依据，理由见文件头。雨 −10 / 雪 −15 / 雾 −20（≈ −3.3% / −5% / −6.7% 命中率）。
 */
export function weatherHitMod(weather: number): number {
  switch (Math.round(weather)) {
    case 1:
      return -10;
    case 2:
      return -15;
    case 3:
      return -20;
    default:
      return 0;
  }
}

/** 把任意输入归一成 0..3（`createWorld` 用；越界/NaN → 0 晴） */
export function normalizeWeather(w: unknown): Weather {
  const n = typeof w === 'number' && Number.isFinite(w) ? Math.round(w) : 0;
  return (n >= 0 && n <= 3 ? n : 0) as Weather;
}
