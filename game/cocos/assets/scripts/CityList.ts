/**
 * CityList.ts — 城池列表的純邏輯（**不 import cc**）。
 *
 * 對齊 web 版 campaign.html 的「列表」檔（#viewList，地圖/列表兩個 tab）：
 *   列：城名 / 所屬勢力 / 太守 / 守軍 / 預備兵 / 金錢 / 與玩家關係（己方/敵方/無主）
 *   篩選：全部 / 己方 / 敵方 / 無主（三者計數和 = 總城數）
 *   分頁：每頁 15 行（60 城 → 4 頁，末頁也是 15 行）
 *   排序：單一排序鍵（城名 或 勢力），同勢力時用城名做 tie-break，code-point 比較
 *
 * 為什麼排序只用單鍵 + 城名 tie-break：
 *   Cocos 與 Node 環境的 localeCompare/拼音排序不一定有 ICU 資料，跨平台會不穩；
 *   用 `<` / `>` 的 code-point 比較，測試與真機結果一致，且「同勢力按城名」是
 *   使用者最直覺的次要順序。代價是按鈕文案只能標「城名 / 勢力」兩個方向，不能
 *   同時顯示「勢力→城名」的複合箭頭。
 */

export const CITY_PAGE_SIZE = 15;
export const CITY_TOTAL = 60;

export type CityRelation = 'ours' | 'enemy' | 'neutral';
export type CityFilter = 'all' | CityRelation;
export type CitySortKey = 'name' | 'force';

export interface CityListSaveLike {
  owned?: unknown;
  cities?: unknown;
  appointed?: unknown;
  roster?: unknown;
  force?: unknown;
  king?: unknown;
  monarch?: unknown;
  [key: string]: unknown;
}

export interface CityListCityLike {
  NAME?: unknown;
  KING?: unknown;
  MAJOR?: unknown;
  POPULATION?: unknown;
  DEFENSE?: unknown;
  MONEY?: unknown;
  [key: string]: unknown;
}

export interface CityListGeneralLike {
  NAME?: unknown;
  CITY?: unknown;
  [key: string]: unknown;
}

export interface CityRow {
  name: string;
  relation: CityRelation;
  /** 己方 / 敵方 / 無主（畫面直接顯示）。 */
  relationText: string;
  /** 所屬勢力：己方 → 玩家勢力名；敵方 → 敵勢力名；無主 → 無主。 */
  force: string;
  major: string;
  troops: number;
  prep: number;
  money: number;
  pop: number;
  defense: number;
  /** KING 是純數字（關卡/空城）。 */
  gate: boolean;
}

export interface CityListCounts {
  ours: number;
  enemy: number;
  neutral: number;
  total: number;
}

export interface CityListState {
  filter: CityFilter;
  sort: CitySortKey;
  /** 1 = 遞增，-1 = 遞減。 */
  dir: 1 | -1;
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  counts: CityListCounts;
  /** 篩選 + 排序後的全部列。 */
  rows: CityRow[];
  /** 當前頁的 15 列。 */
  pageRows: CityRow[];
  selected: string | null;
}

/* ------------------------------------------------------------------ */
/* 寬鬆取值（與 EndingModel 同一套口徑，但本檔不依賴它）                 */
/* ------------------------------------------------------------------ */

function dictOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function strOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function numOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function intOf(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = numOf(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function uniqueStrings(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const text = strOf(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/** 與 CityModel.troopCapOf 相同口徑；列表在 runtime 缺值時用它補。 */
export function troopCapOf(pop: number): number {
  return Math.min(Math.floor((Number.isFinite(pop) ? pop : 0) / 2500) + 110, 600);
}

/** 與 CityModel.prepCapOf 相同口徑。 */
export function prepCapOf(pop: number): number {
  return troopCapOf(pop);
}

/** code-point 比較：不用 localeCompare，跨平台穩定。 */
export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function normalizeFilter(value: unknown): CityFilter {
  return value === 'ours' || value === 'enemy' || value === 'neutral' ? value : 'all';
}

function normalizeSort(value: unknown): CitySortKey {
  return value === 'force' ? 'force' : 'name';
}

function relationTextOf(relation: CityRelation): string {
  if (relation === 'ours') return '己方';
  if (relation === 'enemy') return '敵方';
  return '無主';
}

function playerForceOf(save: CityListSaveLike): string {
  return strOf(save.force) || strOf(save.king) || strOf(save.monarch);
}

function appointedMajorOf(save: CityListSaveLike, name: string): string {
  const table = dictOf(save.appointed);
  if (!table) return '';
  const value = table[name];
  const dict = dictOf(value);
  if (dict) return strOf(dict.major) || strOf(dict.MAJOR);
  return strOf(value);
}

/* ------------------------------------------------------------------ */
/* CityList                                                            */
/* ------------------------------------------------------------------ */

export class CityList {
  private save: CityListSaveLike;
  private cities: CityListCityLike[];
  private generals: CityListGeneralLike[];
  private all: CityRow[] = [];
  private filter: CityFilter = 'all';
  private sortKey: CitySortKey = 'name';
  private sortDir: 1 | -1 = 1;
  private page = 0;
  private selected: string | null = null;

  constructor(
    save: CityListSaveLike = {},
    cities: readonly CityListCityLike[] = [],
    generals: readonly CityListGeneralLike[] = []
  ) {
    this.save = save ?? {};
    this.cities = Array.isArray(cities) ? cities.slice() : [];
    this.generals = Array.isArray(generals) ? generals.slice() : [];
    this.rebuild();
  }

  /** 換存檔（月結/攻城後刷新用）；保留 filter/sort/selected，頁碼夾回合法範圍。 */
  setSave(save: CityListSaveLike, cities?: readonly CityListCityLike[]): this {
    this.save = save ?? {};
    if (Array.isArray(cities)) this.cities = cities.slice();
    this.rebuild();
    return this;
  }

  setCities(cities: readonly CityListCityLike[]): this {
    this.cities = Array.isArray(cities) ? cities.slice() : [];
    this.rebuild();
    return this;
  }

  setGenerals(generals: readonly CityListGeneralLike[]): this {
    this.generals = Array.isArray(generals) ? generals.slice() : [];
    return this;
  }

  get allRows(): CityRow[] {
    return this.all.slice();
  }

  get selectedName(): string | null {
    return this.selected;
  }

  /** 玩家勢力名（可能為空）。 */
  get playerForce(): string {
    return playerForceOf(this.save);
  }

  /** 全量計數（不受篩選影響）；三者之和等於 total。 */
  counts(): CityListCounts {
    let ours = 0;
    let enemy = 0;
    let neutral = 0;
    for (const row of this.all) {
      if (row.relation === 'ours') ours += 1;
      else if (row.relation === 'enemy') enemy += 1;
      else neutral += 1;
    }
    return { ours, enemy, neutral, total: this.all.length };
  }

  rows(filter: CityFilter = this.filter): CityRow[] {
    if (filter === 'all') return this.all.slice();
    return this.all.filter((row) => row.relation === filter);
  }

  setFilter(filter: CityFilter): this {
    this.filter = normalizeFilter(filter);
    this.page = 0;
    return this;
  }

  get currentFilter(): CityFilter {
    return this.filter;
  }

  get currentSort(): CitySortKey {
    return this.sortKey;
  }

  get currentDir(): 1 | -1 {
    return this.sortDir;
  }

  /** 設定排序鍵；dir 省略時沿用目前方向（換鍵時預設遞增）。 */
  setSort(key: CitySortKey, dir?: 1 | -1): this {
    const next = normalizeSort(key);
    if (next !== this.sortKey) {
      this.sortKey = next;
      this.sortDir = 1;
    }
    if (dir === 1 || dir === -1) this.sortDir = dir;
    this.sortRows();
    this.page = 0;
    return this;
  }

  /** 點同一個鍵就翻方向。 */
  toggleSort(key: CitySortKey): this {
    const next = normalizeSort(key);
    if (next === this.sortKey) this.sortDir = this.sortDir === 1 ? -1 : 1;
    else {
      this.sortKey = next;
      this.sortDir = 1;
    }
    this.sortRows();
    this.page = 0;
    return this;
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows().length / CITY_PAGE_SIZE));
  }

  get currentPage(): number {
    return this.page;
  }

  setPage(page: number): this {
    const pages = this.pageCount;
    const next = Number.isFinite(page) ? Math.trunc(page) : 0;
    this.page = Math.max(0, Math.min(next, pages - 1));
    return this;
  }

  nextPage(): this {
    return this.setPage(this.page + 1);
  }

  prevPage(): this {
    return this.setPage(this.page - 1);
  }

  /** 回傳實際選中的城名；不在清單內（或空字串）回 null，且不改 selected。 */
  pick(name: string): string | null {
    const target = typeof name === 'string' ? name.trim() : '';
    if (!target) return null;
    const row = this.all.find((item) => item.name === target);
    if (!row) return null;
    this.selected = row.name;
    return row.name;
  }

  setSelected(name: string | null): this {
    const target = typeof name === 'string' ? name.trim() : '';
    this.selected = target && this.all.some((row) => row.name === target) ? target : null;
    return this;
  }

  rowOf(name: string): CityRow | null {
    const target = strOf(name);
    if (!target) return null;
    return this.all.find((row) => row.name === target) ?? null;
  }

  get state(): CityListState {
    const rows = this.rows();
    const pages = Math.max(1, Math.ceil(rows.length / CITY_PAGE_SIZE));
    const page = Math.max(0, Math.min(this.page, pages - 1));
    const start = page * CITY_PAGE_SIZE;
    return {
      filter: this.filter,
      sort: this.sortKey,
      dir: this.sortDir,
      page,
      pages,
      pageSize: CITY_PAGE_SIZE,
      total: this.all.length,
      counts: this.counts(),
      rows,
      pageRows: rows.slice(start, start + CITY_PAGE_SIZE),
      selected: this.selected,
    };
  }

  /** 穩定簽名：畫面用來判斷「資料沒變就不重畫」。 */
  signature(): string {
    const state = this.state;
    return [
      state.filter,
      state.sort,
      state.dir,
      state.page,
      state.selected ?? '',
      this.all.length,
      this.selectedRowText(),
    ].join('|');
  }

  private selectedRowText(): string {
    const row = this.selected ? this.rowOf(this.selected) : null;
    if (!row) return '';
    return [row.name, row.force, row.major, row.troops, row.prep, row.money].join(',');
  }

  /* ---------------------------------------------------------------- */
  /* 內部                                                             */
  /* ---------------------------------------------------------------- */

  private rebuild(): void {
    const owned = new Set(uniqueStrings(this.save.owned));
    const player = playerForceOf(this.save);
    const runtime = dictOf(this.save.cities) ?? {};
    const seen = new Set<string>();
    const rows: CityRow[] = [];

    const pushRow = (
      name: string,
      def: CityListCityLike | null,
      rt: Record<string, unknown> | null
    ): void => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      rows.push(this.buildRow(name, def, rt, owned, player));
    };

    for (const item of this.cities) {
      const def = dictOf(item) as CityListCityLike | null;
      if (!def) continue;
      const name = strOf(def.NAME);
      if (!name) continue;
      pushRow(name, def, dictOf(runtime[name]));
    }

    // 沒有劇本城池時，退而用存檔 cities 的鍵（避免整個列表空白）。
    if (rows.length === 0) {
      for (const name of Object.keys(runtime)) {
        pushRow(name, null, dictOf(runtime[name]));
      }
    }

    this.all = rows;
    this.sortRows();
    if (this.selected && !this.all.some((row) => row.name === this.selected)) this.selected = null;
    this.page = Math.max(0, Math.min(this.page, this.pageCount - 1));
  }

  private buildRow(
    name: string,
    def: CityListCityLike | null,
    rt: Record<string, unknown> | null,
    owned: Set<string>,
    player: string
  ): CityRow {
    const runtimeOwner = strOf(rt?.owner);
    const kingRaw = strOf(def?.KING);
    const gate = def ? /^\d+$/.test(kingRaw) : false;
    const kingForce = gate ? '' : kingRaw;
    const mine = owned.has(name) || (runtimeOwner !== '' && player !== '' && runtimeOwner === player);

    let relation: CityRelation;
    if (mine) relation = 'ours';
    else if (runtimeOwner !== '' && runtimeOwner !== player) relation = 'enemy';
    else if (runtimeOwner === '' && kingForce !== '') relation = 'enemy';
    else if (runtimeOwner !== '' && player === '') relation = 'enemy';
    else relation = 'neutral';

    const force =
      relation === 'ours'
        ? player || '我方'
        : relation === 'enemy'
          ? runtimeOwner || kingForce || '敵方'
          : '無主';

    const pop = intOf(rt?.pop, intOf(def?.POPULATION, 0));
    const major =
      (relation === 'ours' ? appointedMajorOf(this.save, name) : '') ||
      strOf(def?.MAJOR) ||
      '—';

    return {
      name,
      relation,
      relationText: relationTextOf(relation),
      force,
      major,
      troops: intOf(rt?.troops, troopCapOf(pop)),
      prep: intOf(rt?.prep, prepCapOf(pop)),
      money: intOf(rt?.money, intOf(def?.MONEY, 0)),
      pop,
      defense: intOf(rt?.def ?? rt?.DEFENSE, intOf(def?.DEFENSE, 0)),
      gate,
    };
  }

  private sortRows(): void {
    const key = this.sortKey;
    const dir = this.sortDir;
    this.all.sort((a, b) => {
      let cmp = 0;
      if (key === 'force') cmp = compareText(a.force, b.force);
      if (cmp === 0) cmp = compareText(a.name, b.name);
      return cmp * dir;
    });
  }
}

/** 篩選 tab 的固定順序與文字（畫面與測試共用）。 */
export const CITY_FILTERS: readonly { key: CityFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ours', label: '己方' },
  { key: 'enemy', label: '敵方' },
  { key: 'neutral', label: '無主' },
];

export function filterLabelOf(filter: CityFilter): string {
  const found = CITY_FILTERS.find((item) => item.key === filter);
  return found ? found.label : '全部';
}

export function sortLabelOf(sort: CitySortKey, dir: 1 | -1): string {
  const base = sort === 'force' ? '勢力' : '城名';
  return `${base} ${dir === 1 ? '↑' : '↓'}`;
}
