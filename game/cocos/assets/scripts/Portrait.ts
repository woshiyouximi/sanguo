/**
 * Portrait.ts — 原作肖像：武將名 → 原作 FACE 編號 → bundle 圖。
 *
 * 移植自 `game/web/face_map.js`（451 行，IIFE + `module.exports`）：
 *   - `FULL` 表 = 400 條「武將名 → 三位編號（'001'..'400'，帶前導零）」；
 *   - 取圖口徑與 web 一致：`assets/face/{full|thumb}/NNN.webp`，沒有映射（例如 `盜賊`）
 *     → `assets/hero/<名>.webp`；
 *   - Cocos 的 bundle key **不帶副檔名**（`face/full/001`），所以另有 `facePath()`。
 *
 * 與 web 的**唯一差異**（任務書要求）：`<img>` 的降級鏈在 web 是 full → thumb → 隱藏
 * （因為 DOM 的 error 事件只拿得到 src 裡的編號，拿編號拼 `hero/001.webp` 必然 404）；
 * Cocos 這邊**手上一直有武將名**，所以降級鏈延長成 full → thumb → hero/<名> → 隱藏。
 * hero 沒同步（bundle 裡沒有 / 不是 400 個名字之一）時該步自然失敗被跳過，不算錯誤。
 *
 * 這個檔**不 import `cc` 的執行期符號**（只有 `import type`），也把「怎麼載一張圖」
 * 交給呼叫端注入（`FrameLoader`）：這樣 `work/cocos_items/parity.mjs` 能在 node 裡用
 * 打樁 loader 驗證回落順序，而不需要 Creator。
 */
import type { SpriteFrame } from 'cc';

/** 三百多位原作武將的「名 → FACE 編號」。與 face_map.js 的 FULL 表逐條一致（400 條）。 */
export const FACE_MAP: Readonly<Record<string, string>> = {
  '丁原': '002',
  '丁奉': '001',
  '于吉': '003',
  '于禁': '004',
  '伊籍': '052',
  '何儀': '066',
  '何進': '065',
  '侯成': '112',
  '傅士仁': '250',
  '傅嬰': '254',
  '傅巽': '252',
  '傅幹': '253',
  '傅彤': '251',
  '兀突骨': '005',
  '全琮': '053',
  '全端': '054',
  '公孫度': '009',
  '公孫康': '011',
  '公孫恭': '010',
  '公孫淵': '012',
  '公孫瓚': '014',
  '公孫越': '013',
  '典韋': '095',
  '凌操': '120',
  '凌統': '119',
  '劉備': '321',
  '劉封': '318',
  '劉岱': '316',
  '劉巴': '315',
  '劉度': '319',
  '劉循': '322',
  '劉曄': '328',
  '劉焉': '320',
  '劉琦': '323',
  '劉琮': '324',
  '劉璋': '326',
  '劉禪': '329',
  '劉繇': '330',
  '劉表': '317',
  '劉賢': '327',
  '劉辟': '325',
  '卓膺': '096',
  '卞喜': '015',
  '司馬孚': '040',
  '司馬師': '043',
  '司馬徽': '044',
  '司馬懿': '045',
  '司馬昭': '042',
  '司馬炎': '041',
  '向寵': '056',
  '向朗': '055',
  '吳懿': '071',
  '吳班': '067',
  '吳綱': '068',
  '吳蘭': '070',
  '吳質': '069',
  '呂布': '072',
  '呂曠': '078',
  '呂範': '077',
  '呂義': '075',
  '呂翔': '074',
  '呂蒙': '076',
  '呂虔': '073',
  '周倉': '098',
  '周昕': '097',
  '周泰': '099',
  '周瑜': '100',
  '周魴': '101',
  '喬玄': '255',
  '喬瑁': '256',
  '嚴政': '391',
  '嚴畯': '392',
  '嚴白虎': '390',
  '嚴綱': '393',
  '嚴輿': '394',
  '嚴顏': '395',
  '土安': '006',
  '夏侯和': '122',
  '夏侯威': '124',
  '夏侯尚': '123',
  '夏侯德': '129',
  '夏侯恩': '125',
  '夏侯惇': '126',
  '夏侯楙': '128',
  '夏侯淵': '127',
  '夏侯玄': '121',
  '夏侯霸': '130',
  '大喬': '007',
  '太史慈': '016',
  '姜維': '113',
  '孔岫': '017',
  '孔融': '018',
  '孟優': '103',
  '孟獲': '104',
  '孟達': '102',
  '孫乾': '134',
  '孫堅': '135',
  '孫尚香': '131',
  '孫朗': '132',
  '孫桓': '133',
  '孫權': '143',
  '孫登': '137',
  '孫皓': '138',
  '孫禮': '142',
  '孫策': '139',
  '孫翊': '136',
  '孫靜': '141',
  '孫韶': '140',
  '宋憲': '079',
  '審配': '331',
  '小喬': '008',
  '左慈': '046',
  '左賢王': '047',
  '帶來洞主': '178',
  '廖化': '301',
  '張任': '180',
  '張允': '179',
  '張勳': '196',
  '張寶': '206',
  '張嶷': '202',
  '張昭': '184',
  '張松': '182',
  '張梁': '190',
  '張橫': '197',
  '張溫': '192',
  '張濟': '200',
  '張燕': '198',
  '張紘': '189',
  '張紹': '191',
  '張繡': '203',
  '張翼': '201',
  '張苞': '186',
  '張英': '185',
  '張虎': '183',
  '張衛': '194',
  '張角': '181',
  '張達': '193',
  '張遼': '199',
  '張邈': '204',
  '張郃': '187',
  '張闓': '205',
  '張飛': '188',
  '張魯': '195',
  '徐庶': '145',
  '徐晃': '144',
  '徐榮': '147',
  '徐盛': '146',
  '徐質': '148',
  '徹里吉': '302',
  '忙牙長': '057',
  '文欽': '019',
  '文聘': '020',
  '文醜': '022',
  '文鴦': '021',
  '曹丕': '208',
  '曹仁': '207',
  '曹休': '209',
  '曹叡': '222',
  '曹彰': '219',
  '曹性': '210',
  '曹操': '220',
  '曹昂': '211',
  '曹植': '218',
  '曹洪': '213',
  '曹爽': '217',
  '曹真': '214',
  '曹純': '215',
  '曹羲': '221',
  '曹芳': '212',
  '曹豹': '216',
  '木鹿大王': '023',
  '朱桓': '059',
  '朱治': '058',
  '朱然': '061',
  '朱異': '060',
  '朱雋': '062',
  '朱靈': '063',
  '朵思大王': '064',
  '李傕': '084',
  '李儒': '085',
  '李典': '080',
  '李嚴': '087',
  '李恢': '081',
  '李異': '082',
  '李肅': '083',
  '李鵬': '086',
  '杜遠': '088',
  '桓範': '149',
  '梁興': '223',
  '楊修': '277',
  '楊儀': '280',
  '楊彪': '279',
  '楊懷': '282',
  '楊松': '275',
  '楊祚': '278',
  '楊秋': '276',
  '楊鋒': '281',
  '樂進': '333',
  '樊稠': '332',
  '步鷺': '089',
  '武安國': '105',
  '毋丘儉': '024',
  '毛玠': '025',
  '沙摩訶': '090',
  '沮授': '107',
  '沮鵠': '108',
  '法正': '106',
  '淳于瓊': '224',
  '滿寵': '303',
  '潘濬': '336',
  '潘璋': '335',
  '潘鳳': '334',
  '牛金': '026',
  '王允': '028',
  '王基': '033',
  '王子服': '027',
  '王平': '029',
  '王朗': '031',
  '王渾': '035',
  '王濬': '038',
  '王甫': '030',
  '王真': '032',
  '王粲': '036',
  '王累': '034',
  '王雙': '039',
  '王頎': '037',
  '甘寧': '048',
  '田疇': '050',
  '田豐': '049',
  '申耽': '051',
  '皇甫嵩': '114',
  '盧植': '357',
  '祖茂': '150',
  '祝融夫人': '151',
  '禰衡': '389',
  '秦宓': '152',
  '程昱': '259',
  '程普': '260',
  '程武': '257',
  '程秉': '258',
  '程遠志': '261',
  '程銀': '262',
  '笮融': '225',
  '管亥': '304',
  '管輅': '305',
  '簡雍': '375',
  '糜竺': '362',
  '糜芳': '363',
  '紀靈': '115',
  '耿紀': '153',
  '胡班': '117',
  '胡車兒': '116',
  '臧霸': '306',
  '范疆': '118',
  '荀彧': '155',
  '荀攸': '154',
  '華佗': '263',
  '華歆': '265',
  '華雄': '264',
  '董允': '283',
  '董卓': '284',
  '董和': '285',
  '董承': '286',
  '董旻': '287',
  '董昭': '288',
  '董荼那': '289',
  '董衡': '290',
  '董襲': '291',
  '蒯良': '313',
  '蒯越': '314',
  '蔡中': '342',
  '蔡和': '343',
  '蔡瑁': '345',
  '蔡邕': '344',
  '蔣幹': '339',
  '蔣欽': '337',
  '蔣濟': '341',
  '蔣琬': '338',
  '蔣義渠': '340',
  '薛綜': '364',
  '蘇飛': '396',
  '虞翻': '292',
  '袁尚': '156',
  '袁熙': '160',
  '袁紹': '158',
  '袁胤': '157',
  '袁術': '159',
  '袁譚': '161',
  '裴元紹': '307',
  '許子將': '226',
  '許攸': '227',
  '許褚': '229',
  '許靖': '228',
  '諸葛亮': '347',
  '諸葛均': '346',
  '諸葛恪': '348',
  '諸葛瑾': '349',
  '諸葛誕': '350',
  '譙周': '383',
  '譚雄': '382',
  '貂蟬': '266',
  '費褘': '267',
  '賈充': '293',
  '賈範': '296',
  '賈詡': '295',
  '賈逵': '294',
  '趙廣': '311',
  '趙弘': '308',
  '趙範': '312',
  '趙統': '309',
  '趙雲': '310',
  '車胄': '091',
  '軻比能': '268',
  '辛毗': '092',
  '辛評': '093',
  '迷當大王': '162',
  '逢紀': '230',
  '邢道榮': '094',
  '郝昭': '163',
  '郭嘉': '233',
  '郭圖': '234',
  '郭奕': '232',
  '郭汜': '231',
  '鄒靖': '297',
  '鄧忠': '352',
  '鄧艾': '351',
  '鄧芝': '353',
  '鄧茂': '354',
  '鄧賢': '355',
  '金旋': '109',
  '金環三結': '110',
  '鍾會': '365',
  '鍾繇': '366',
  '閻圃': '358',
  '關平': '384',
  '關索': '386',
  '關羽': '385',
  '關興': '388',
  '關鳳': '387',
  '闞澤': '397',
  '阿會喃': '111',
  '陳宮': '237',
  '陳式': '235',
  '陳橫': '243',
  '陳武': '236',
  '陳泰': '238',
  '陳琳': '239',
  '陳登': '240',
  '陳矯': '244',
  '陳群': '241',
  '陳震': '242',
  '陶謙': '249',
  '陸凱': '246',
  '陸抗': '245',
  '陸績': '248',
  '陸遜': '247',
  '雅丹': '269',
  '雍闓': '298',
  '雷薄': '300',
  '雷銅': '299',
  '霍峻': '359',
  '韓嵩': '370',
  '韓忠': '368',
  '韓暹': '373',
  '韓浩': '369',
  '韓玄': '367',
  '韓當': '371',
  '韓遂': '372',
  '韓馥': '374',
  '顏良': '376',
  '顧雍': '398',
  '馬休': '164',
  '馬岱': '166',
  '馬忠': '167',
  '馬玩': '168',
  '馬良': '165',
  '馬謖': '170',
  '馬超': '169',
  '馬鐵': '172',
  '馬騰': '171',
  '馮習': '270',
  '駱統': '360',
  '高定': '174',
  '高幹': '176',
  '高沛': '173',
  '高覽': '177',
  '高順': '175',
  '魏延': '377',
  '魏續': '378',
  '魯肅': '356',
  '鮑隆': '361',
  '黃忠': '271',
  '黃權': '274',
  '黃祖': '272',
  '黃蓋': '273',
  '龐德': '381',
  '龐統': '379',
  '龐義': '380',
  '龔景': '400',
  '龔都': '399',
};

/** 立繪變體：full 100×120 / thumb 30×40（尺寸見 face_map.js 檔頭）。 */
export type PortraitVariant = 'full' | 'thumb';

/** 這張圖是從哪一級降級鏈拿到的。 */
export type PortraitVia = 'full' | 'thumb' | 'hero' | 'none';

/** 能接收 sprite frame 的目標（`ArtLayer.ArtSprite` 結構上就符合）。 */
export interface PortraitTarget {
  apply(frame: SpriteFrame | null, size?: { w: number; h: number }): boolean;
}

/**
 * 載一張圖的注入點。`path` 是 bundle key（`face/full/001`）—— 呼叫端一般直接傳
 * `ArtLayer.loadFrame`（它會走 `bundle.load(path, ImageAsset, null, cb)` 再包 SpriteFrame）。
 */
export type FrameLoader = (path: string, cb: (frame: SpriteFrame | null) => void) => void;

/** 降級鏈的一次嘗試。 */
export interface PortraitStep {
  via: Exclude<PortraitVia, 'none'>;
  path: string;
}

/** 一次取圖的結果，回給呼叫端做日誌/除錯。 */
export interface PortraitResult {
  name: string;
  via: PortraitVia;
  /** 成功時的 bundle key；全失敗為 null。 */
  path: string | null;
  /** 按順序試過的 bundle key（含失敗的），便於在 Creator 控制台看清是哪一級掛了。 */
  tried: string[];
}

function nameOf(name: unknown): string {
  return typeof name === 'string' ? name : name === null || name === undefined ? '' : String(name);
}

/** 武將名 → FACE 編號（'001' 這種三位字串）；沒有映射回 null。 */
export function faceNumberOf(name: unknown): string | null {
  const no = FACE_MAP[nameOf(name)];
  return typeof no === 'string' && no.length > 0 ? no : null;
}

/**
 * web 的 `SG.portraitUrl(name, variant)` 原樣移植（帶 `assets/` 前綴與 `.webp`），
 * 方便與 face_map.js 逐條對拍。Cocos 實際載圖請用 `facePath()` / `heroPaths()`。
 */
export function portraitUrl(name: unknown, variant: PortraitVariant = 'full'): string {
  const key = nameOf(name);
  const no = FACE_MAP[key];
  if (!no) return `assets/hero/${encodeURIComponent(key)}.webp`;
  const dir = variant === 'thumb' ? 'thumb' : 'full';
  return `assets/face/${dir}/${no}.webp`;
}

/** 兵器/寶物那套 bundle key：`face/full/001`（無副檔名）。沒有映射回 null。 */
export function facePath(name: unknown, variant: PortraitVariant = 'full'): string | null {
  const no = faceNumberOf(name);
  if (!no) return null;
  const dir = variant === 'thumb' ? 'thumb' : 'full';
  return `face/${dir}/${no}`;
}

/**
 * `hero/<名>` 的 bundle key。中文名在 Creator 的 bundle 裡就是原名（`hero/關羽`），
 * 但也接受 encodeURIComponent 形式（`ArtLayer.loadHero` 的兩段嘗試同源）。
 */
export function heroPaths(name: unknown): string[] {
  const key = nameOf(name);
  if (!key) return [];
  const out = [`hero/${key}`];
  const encoded = encodeURIComponent(key);
  if (encoded !== key) out.push(`hero/${encoded}`);
  return out;
}

/**
 * 降級鏈：`full → thumb → hero/<名> → 隱藏`。
 * - 沒有 FACE 映射時直接從 hero 開始（與 web 的 `portraitUrl` 同口徑）；
 * - `variant === 'thumb'` 時把第一級換成 thumb（武將切換條那種小圖用）；
 * - `hero: false` 可以關掉最後一級（例如只想驗 face 資源時）。
 */
export function portraitChain(name: unknown, variant: PortraitVariant = 'full', hero = true): PortraitStep[] {
  const key = nameOf(name);
  const steps: PortraitStep[] = [];
  const full = facePath(key, 'full');
  const thumb = facePath(key, 'thumb');
  if (full) {
    if (variant === 'thumb') {
      steps.push({ via: 'thumb', path: thumb ?? full });
    } else {
      steps.push({ via: 'full', path: full });
      if (thumb) steps.push({ via: 'thumb', path: thumb });
    }
  }
  if (hero) for (const path of heroPaths(key)) steps.push({ via: 'hero', path });
  return steps;
}

/**
 * 依降級鏈載一張肖像並套到 `target` 上；全部失敗時 `target.apply(null)` 隱藏。
 * `done` 可選，回報實際命中的那一級（給面板寫日誌/給 parity 斷言用）。
 */
export function loadPortrait(
  target: PortraitTarget,
  name: unknown,
  variant: PortraitVariant,
  load: FrameLoader,
  done?: (result: PortraitResult) => void,
  hero = true,
): void {
  const key = nameOf(name);
  const steps = portraitChain(key, variant, hero);
  const tried: string[] = [];

  const finish = (via: PortraitVia, path: string | null): void => {
    if (!path) target.apply(null);
    done?.({ name: key, via, path, tried });
  };

  const attempt = (index: number): void => {
    if (index >= steps.length) {
      finish('none', null);
      return;
    }
    const step = steps[index];
    tried.push(step.path);
    load(step.path, (frame) => {
      if (frame) {
        target.apply(frame);
        finish(step.via, step.path);
        return;
      }
      attempt(index + 1);
    });
  };

  attempt(0);
}
