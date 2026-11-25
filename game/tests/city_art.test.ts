/*
 * R64 · 內政頁美術（city.html）的靜態驗收。
 *
 * 只驗「畫面上看不到但一壞就露餡」的東西：素材是不是原作那幾張、九宮格的 slice/insets
 * 有沒有跟素材對得上、有沒有偷偷引入字型檔、以及那些靠 id 特異性補回來的定位修正還在不在。
 * 不驗視覺 —— 顏色好不好看要看 work/cityart/after.png。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..', 'web');
const ART = path.join(WEB, 'assets', 'cityart');
const HTML = readFileSync(path.join(WEB, 'city.html'), 'utf8');

/* 檔案 → [寬, 高, 位元組數]。尺寸來自 export/png/SHAPE/MENU 原作圖元，位元組數是
 * 「原樣拷貝、0 像素改動」的指紋（換一張圖或重壓過 PNG 這裡就會紅）。
 * 明細見 work/cityart/alpha_check.txt。 */
const ASSETS: Record<string, readonly [number, number, number]> = {
  'bar_gauge.png': [121, 9, 248], // C4_A  原作量條
  'frame_panel.png': [225, 40, 2139], // D3_2G 細金雙線框
  'gem_seal.png': [22, 22, 642], // D3_1D 金玉飾
  'orn_corner.png': [100, 120, 1206], // WAR08 鏤空角飾框
  'plate_chip.png': [183, 40, 1963], // D25   牌匾／資訊卡
  'rail_gold.png': [111, 12, 601], // WAR06 粗金線
  'sb_down.png': [19, 25, 804], // SB_V7 下箭頭
  'sb_knob.png': [18, 14, 112], // SB_V4 滾動條 thumb
  'sb_track.png': [19, 417, 4147], // SB_V1 軌道
  'sb_up.png': [19, 25, 823], // SB_V6 上箭頭
};

/* R64 那段 CSS（新加的全部在這一段，出錯時比較好框範圍） */
const B0 = HTML.indexOf('R64 · 內政頁美術');
const B1 = HTML.indexOf('</style>', B0);
const R64 = HTML.slice(B0, B1);

function pngSize(abs: string): [number, number] {
  const buf = readFileSync(abs);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `PNG 檔頭不對：${path.basename(abs)}`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `缺 IHDR：${path.basename(abs)}`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('city.html 內政頁美術 / 素材', () => {
  it('素材目錄剛好是這 10 張，沒有多出來的（尤其沒有 AI 新生成的圖）', () => {
    const names = readdirSync(ART).filter((n) => !n.startsWith('.')).sort();
    assert.deepEqual(names, Object.keys(ASSETS).sort());
    assert.ok(B0 > 0 && B1 > B0, '找不到 R64 美術區塊');
  });

  it('每一張都是合法 PNG', () => {
    for (const name of Object.keys(ASSETS)) pngSize(path.join(ART, name));
  });

  it('每一張的尺寸都等於原作 MENU 圖元的尺寸', () => {
    for (const [name, [w, h]] of Object.entries(ASSETS)) {
      assert.deepEqual(pngSize(path.join(ART, name)), [w, h], `${name} 尺寸被改過`);
    }
  });

  it('每一張的位元組數都沒變（原樣拷貝，0 像素改動）', () => {
    for (const [name, [, , bytes]] of Object.entries(ASSETS)) {
      assert.equal(readFileSync(path.join(ART, name)).length, bytes, `${name} 被重新壓過或換掉了`);
    }
  });

  it('city.html 真的引用了每一個素材（沒有死檔）', () => {
    for (const name of Object.keys(ASSETS)) {
      assert.ok(HTML.includes(`assets/cityart/${name}`), `${name} 沒有任何 CSS 引用它`);
    }
  });
});

describe('city.html 內政頁美術 / 九宮格', () => {
  it('訂出 6 種框：牌匾 8、面板 12/13/14、角飾 12、標題刻度 3', () => {
    // 牌匾＋資訊卡：plate_chip slice 8
    assert.ok(R64.includes('border-image:url("assets/cityart/plate_chip.png") 8 / 8px'), 'plate_chip 九宮格 slice 8 不見了');
    // 命令木牌＋底部木牌：frame_panel slice 12 / 13px（貼齊 13px 木框）
    const cmdFrame = 'border-image:url("assets/cityart/frame_panel.png") 12 / 13px';
    assert.equal(R64.split(cmdFrame).length - 1, 2, '.cmd / .btn 應該各有一圈 frame_panel 13px 金邊');
    // 面板本體：--frame 12 / 12px；抽屜：12 / 14px
    assert.ok(R64.includes('border-image:var(--frame) 12 / 12px'), '.sec 的 frame_panel 12px 框不見了');
    assert.ok(R64.includes('border-image:var(--frame) 12 / 14px'), '.sheet 的 frame_panel 14px 框不見了');
    // 選中框：WAR08 slice 12
    assert.ok(R64.includes('border-image:url("assets/cityart/orn_corner.png") 12 / 12px'), 'orn_corner 選中框不見了');
    // 小節標題刻度：C4_A 橫向拉伸 3px
    assert.ok(R64.includes('bar_gauge.png") center / 100% 3px'), 'h2 的原作量條不見了');
    assert.ok(R64.includes('rail_gold.png") center / 100% 12px'), 'header/footer 的金線不見了');
  });

  it('每個 border-image 都配了 image-rendering:pixelated（不然放大會糊）', () => {
    const pixelated = R64.split('image-rendering:pixelated').length - 1;
    assert.ok(pixelated >= 7, `pixelated 只有 ${pixelated} 處，7 個框應該都有`);
  });

  it('可捲動區域接上了原作的 SB_V* 滾動條', () => {
    assert.ok(R64.includes('::-webkit-scrollbar{width:19px}'), '滾動條寬度沒接 19px');
    for (const name of ['sb_track.png', 'sb_up.png', 'sb_down.png', 'sb_knob.png']) {
      assert.ok(R64.includes(name), `${name} 沒接到滾動條`);
    }
    assert.ok(R64.includes(':vertical:start:decrement'), '缺上箭頭按鈕');
    assert.ok(R64.includes(':vertical:end:increment'), '缺下箭頭按鈕');
  });

  it('框一律畫在偽元素上，沒有給既有元素加真 border（版面不會位移）', () => {
    for (const sel of ['.cmd', '.btn', '.sec', '.chip', '.hud', '.log', 'footer', 'header']) {
      const m = new RegExp(`(^|\\n)\\s*${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(R64);
      if (!m) continue; // 沒覆寫就沒風險
      const body = m[2];
      assert.ok(!/(^|;)\s*border\s*:/.test(body), `${sel} 在 R64 裡被加了真 border`);
      assert.ok(!/(^|;)\s*padding\s*:/.test(body), `${sel} 在 R64 裡被改了 padding`);
      assert.ok(!/(^|;)\s*height\s*:/.test(body.replace(/height:562px|height:318px|height:300px|height:12px|height:5px/, '')),
        `${sel} 在 R64 裡被改了高度`);
    }
    // 只允許 position:relative 之類的加法
    assert.ok(R64.includes('.cmd{position:relative}'), '.cmd 沒有先設 position:relative');
  });
});

describe('city.html 內政頁美術 / 主背景與版面', () => {
  it('PALAIS 是主背景：上半屏整張（1.17× 零裁切）＋ 底邊拉伸地面', () => {
    assert.ok(R64.includes('.art-hall'), '缺少 .art-hall 圖層');
    assert.ok(R64.includes('background:var(--palais) center top / 100% 100%'), '.art-hall 沒有整張鋪滿');
    assert.ok(R64.includes('.art-floor'), '缺少 .art-floor 地面延伸層');
    assert.ok(R64.includes('center bottom / 100% 2000%'), '.art-floor 沒有把底邊拉伸');
    // b1 的 12% 幽靈淡入要真的關掉
    assert.ok(R64.includes('.logsec::before{content:none}'), 'b1 的 PALAIS 12% 幽靈還在');
  });

  it('#stage>* 的特異性壓制被補回來了（.art/.mask/.sheet 都真的絕對定位）', () => {
    assert.ok(R64.includes('#stage > .art{position:absolute'), '.art 沒有用 id 特異性補回 absolute');
    assert.ok(R64.includes('#stage > .mask{position:absolute'), '.mask 會掉回文檔流（抽屜一開就推頁面）');
    assert.ok(R64.includes('#stage > .sheet{position:absolute'), '.sheet 會掉回文檔流（抽屜一開就推頁面）');
  });

  it('沒有引入新字型檔，也沒有 @font-face', () => {
    assert.ok(!/@font-face/.test(HTML), 'city.html 多出了 @font-face');
    assert.ok(!/\.woff2?|\.ttf|\.otf/i.test(HTML), 'city.html 引用了字型檔');
    // 字感靠多層 text-shadow ＋ 漸層字 ＋ text-stroke
    assert.ok((HTML.split('text-shadow').length - 1) >= 10, 'text-shadow 層數太少，標題/數字會沒有厚度');
    assert.ok(HTML.includes('-webkit-text-stroke'), '大標題沒有描邊');
    assert.ok(HTML.includes('tabular-nums'), '數字沒有等寬（會左右跳）');
  });

  it('JS 會用到的錨點沒被動到（邏輯頁仍可跑）', () => {
    for (const id of ['cityName', 'headSub', 'cmdHint', 'logHint', 'grid', 'log', 'mask', 'sheet', 'sheetBody', 'dump']) {
      assert.ok(HTML.includes(`id="${id}"`), `#${id} 不見了`);
    }
    for (const label of ['開發', '徵兵', '搜索', '移動', '任命', '物品', '情報', '出征', '自治']) {
      // 九宮木牌是 JS 建出來的（city_model.js 擁有命令清單），所以字串在腳本裡而不是標籤裡
      assert.ok(HTML.includes(`'${label}'`) || HTML.includes(`>${label}<`), `命令「${label}」不見了`);
    }
    assert.ok(HTML.includes('var(--palais)'), 'applyHall() 寫的 --palais 沒被用到');
  });
});
