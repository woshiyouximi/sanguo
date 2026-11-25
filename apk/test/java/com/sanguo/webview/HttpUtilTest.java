package com.sanguo.webview;

/**
 * HttpUtil 的桌面 JVM 单测（不依赖 Android，不需要模拟器）。
 *
 * <p>AssetServer 本身要真机才跑得起来，但「路径会不会穿出 assets」「MIME 对不对」
 * 「Range 的 206 区间算得对不对」全在 HttpUtil 里，所以这一层用普通 javac + java 就能给出
 * 可执行证据。编译运行：
 *
 * <pre>
 *   javac -encoding UTF-8 -d apk/build/test-classes ^
 *     apk/java/com/sanguo/webview/HttpUtil.java apk/test/java/com/sanguo/webview/HttpUtilTest.java
 *   java -cp apk/build/test-classes com.sanguo.webview.HttpUtilTest
 * </pre>
 *
 * <p>全部通过时打印 {@code PASS n/n} 且退出码 0；有失败则逐条打印 want/got 并以退出码 1 结束。
 */
public final class HttpUtilTest {

    private static int checks = 0;
    private static int failed = 0;

    private static void eq(String what, Object want, Object got) {
        checks++;
        boolean ok = (want == null) ? got == null : want.equals(got);
        if (!ok) {
            failed++;
            System.out.println("FAIL " + what + "\n  want: " + want + "\n  got : " + got);
        }
    }

    private static void range(String header, long len, long wantStart, long wantEnd, boolean wantOk) {
        HttpUtil.Range r = HttpUtil.parseRange(header, len);
        String tag = "range(" + header + ", " + len + ")";
        if (r == null) {
            checks++;
            failed++;
            System.out.println("FAIL " + tag + ": 得到 null（期望 start=" + wantStart + " end=" + wantEnd + "）");
            return;
        }
        eq(tag + ".start", wantStart, r.start);
        eq(tag + ".end", wantEnd, r.end);
        eq(tag + ".satisfiable", wantOk, r.satisfiable);
    }

    private static void rangeNull(String header, long len) {
        checks++;
        HttpUtil.Range r = HttpUtil.parseRange(header, len);
        if (r != null) {
            failed++;
            System.out.println("FAIL range(" + header + ", " + len + ") 期望 null，得到 " + r.start + "-" + r.end);
        }
    }

    public static void main(String[] args) {
        // ---- normalizePath：正常路径 ----
        eq("root", "index.html", HttpUtil.normalizePath("/"));
        eq("empty", "index.html", HttpUtil.normalizePath(""));
        eq("file", "index.html", HttpUtil.normalizePath("/index.html"));
        eq("query 丢弃", "main.js", HttpUtil.normalizePath("/main.js?v=3"));
        eq("fragment 丢弃", "main.js", HttpUtil.normalizePath("/main.js#top"));
        eq("重斜杠折叠", "assets/audio/bgm/03.mp3", HttpUtil.normalizePath("//assets//audio//bgm/03.mp3"));
        eq("点段丢弃", "a/b.js", HttpUtil.normalizePath("/a/./b.js"));
        eq("目录补 index", "assets/index.html", HttpUtil.normalizePath("/assets/"));
        eq("无前导斜杠", "campaign.html", HttpUtil.normalizePath("campaign.html"));
        eq("百分号解码", "assets/bg/城.png", HttpUtil.normalizePath("/assets/bg/%E5%9F%8E.png"));

        // ---- normalizePath：穿越与非法字符一律拒绝（回 null → 403）----
        eq("穿越根", null, HttpUtil.normalizePath("/../etc/passwd"));
        eq("穿越中段", null, HttpUtil.normalizePath("/assets/../../x"));
        eq("编码穿越", null, HttpUtil.normalizePath("/%2e%2e/x"));
        eq("反斜杠", null, HttpUtil.normalizePath("/a\\b"));
        eq("盘符冒号", null, HttpUtil.normalizePath("/c:/windows"));
        eq("NUL", null, HttpUtil.normalizePath("/a\u0000b"));
        eq("null 输入", null, HttpUtil.normalizePath(null));

        // ---- MIME 表（规格里点名的每一条都要对）----
        eq("mime html", "text/html; charset=utf-8", HttpUtil.mimeOf("index.html"));
        eq("mime js", "text/javascript", HttpUtil.mimeOf("main.js"));
        eq("mime mjs", "text/javascript", HttpUtil.mimeOf("serve.mjs"));
        eq("mime css", "text/css", HttpUtil.mimeOf("a/b.css"));
        eq("mime json", "application/json", HttpUtil.mimeOf("data/meta.json"));
        eq("mime png", "image/png", HttpUtil.mimeOf("assets/hero/a.PNG"));
        eq("mime jpg", "image/jpeg", HttpUtil.mimeOf("a.jpg"));
        eq("mime jpeg", "image/jpeg", HttpUtil.mimeOf("a.jpeg"));
        eq("mime webp", "image/webp", HttpUtil.mimeOf("a.webp"));
        eq("mime mp3", "audio/mpeg", HttpUtil.mimeOf("assets/audio/bgm/04.mp3"));
        eq("mime ogg", "audio/ogg", HttpUtil.mimeOf("a.ogg"));
        eq("mime woff2", "font/woff2", HttpUtil.mimeOf("a.woff2"));
        eq("mime wasm", "application/wasm", HttpUtil.mimeOf("a.wasm"));
        eq("mime 未知", "application/octet-stream", HttpUtil.mimeOf("a.bin"));
        eq("mime 无扩展", "application/octet-stream", HttpUtil.mimeOf("LICENSE"));

        // ---- Range：单段 / 开头省略 / 结尾省略 / 越界 / 乱写 ----
        range("bytes=0-1023", 4096, 0, 1023, true);
        range("bytes=1000-", 4096, 1000, 4095, true);
        range("bytes=-500", 4096, 3596, 4095, true);
        range("bytes=0-999999", 4096, 0, 4095, true);      // 尾部超出要夹到 len-1
        range("bytes=4095-4095", 4096, 4095, 4095, true);  // 最后一个字节
        range("bytes=5000-", 4096, 0, -1, false);          // 起点越界 → 416
        range("bytes=10-5", 4096, 0, -1, false);           // 区间倒挂 → 416
        rangeNull("bytes=0-1,3-4", 4096);                  // 多段不支持 → 降级 200
        rangeNull("bytes=abc", 4096);
        rangeNull("bytes=", 4096);
        rangeNull("items=0-10", 4096);
        rangeNull(null, 4096);
        rangeNull("bytes=0-10", 0);                        // 空文件没有可满足的区间

        // ---- 状态行文案 ----
        eq("reason 206", "Partial Content", HttpUtil.reason(206));
        eq("reason 404", "Not Found", HttpUtil.reason(404));
        eq("reason 416", "Range Not Satisfiable", HttpUtil.reason(416));
        eq("reason 403", "Forbidden", HttpUtil.reason(403));

        if (failed == 0) {
            System.out.println("PASS " + checks + "/" + checks + " (HttpUtil)");
            System.exit(0);
        }
        System.out.println("FAILED " + failed + "/" + checks);
        System.exit(1);
    }
}
