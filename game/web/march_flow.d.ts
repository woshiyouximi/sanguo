/**
 * web/ 是瀏覽器端 JS：不帶型別、由 node 直接執行。這裡只宣告「有這些匯出」避免 TS7016，
 * 詳細行為以 web/march_flow.js 為準（與 saves.d.ts 同一種外殼）。
 *
 * 這一層是「出征扣兵 / 戰後回寫」的唯一口徑，deploy.html 與 main.js 都 import 它。
 */
export declare const TROOP_HARD_CAP: any;
export declare const DEPLOY_OFFICER_MAX: any;
export declare const parseOfficerList: any;
export declare const cityPoolOf: any;
export declare const fieldCapOf: any;
export declare const takeFromCity: any;
export declare const returnToCity: any;
export declare const casualtySplitOf: any;
