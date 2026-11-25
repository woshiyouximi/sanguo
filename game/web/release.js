/**
 * [216_apk] 發佈形態開關（APK 內建 WebView 殼 / 正式版）。
 *
 * web 版同時是開發預覽台與 APK 裡的遊戲本體。兩者只差一件事：開發設施
 * （頂部除錯列、`?dev=1` 探針、`window.__sanguo` 腳本口）該不該存在。
 *
 * 判定順序（任一成立即發佈形態）：
 *   ① `?rel=1` —— 本次會話第一次帶就記進 sessionStorage，之後頁間跳轉不必再帶；
 *   ② sessionStorage 的 `sg.rel=1` —— 讓 campaign → city → deploy → battle 全程保持；
 *   ③ UA 含 `SanguoShell` —— APK 殼在 WebView 的 UA 尾巴打的標記，玩家改不了。
 *
 * 反向開關 `?rel=0`：清掉記憶、回到開發形態（除錯列復活），給自己排查用。
 * 不寫 localStorage：那會跟存檔一起被「清除資料」帶走，也不該跨會話殘留。
 * 本檔必須是頁面第一個 script —— devflags.js 要讀 `__RELEASE__` 才能決定 DEV。
 */
(function (global) {
  'use strict';
  var search = String((global.location && global.location.search) || '');
  var rel = /[?&]rel=1(?:&|$)/.test(search);
  var store = null;
  try { store = global.sessionStorage; } catch (e) { store = null; }
  if (/[?&]rel=0(?:&|$)/.test(search)) {
    try { if (store) store.removeItem('sg.rel'); } catch (e) {}
  } else if (rel) {
    try { if (store) store.setItem('sg.rel', '1'); } catch (e) {}
  } else {
    try { if (store && store.getItem('sg.rel') === '1') rel = true; } catch (e) {}
  }
  if (!rel) {
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/SanguoShell/.test(ua)) rel = true;
  }
  global.__RELEASE__ = rel;
})(typeof window !== 'undefined' ? window : globalThis);
