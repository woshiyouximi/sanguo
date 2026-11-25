package com.sanguo.webview;

import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 把 {@code assets/www/} 直接当成一个站点，交给 {@code WebViewClient.shouldInterceptRequest} 应答。
 *
 * <p>这是 1.1 换掉的第二版取数方式。第一版是 {@link AssetServer}：在 127.0.0.1 上起一个
 * {@code ServerSocket}，再用 {@code http://127.0.0.1:<随机端口>/} 当源。那套东西有三个先天问题，
 * 全都不在游戏代码里、也不报错，只表现为「黑屏/点了没反应」：
 * <ol>
 *   <li>随机端口 ⇒ 每次启动的 <b>origin 都不一样</b>；{@code localStorage} 按 origin 隔离，
 *       于是存档每次冷启动都会「消失」（campaign.html 存档键 {@code sanguo_campaign_v1} 就在 localStorage 里）；</li>
 *   <li>应答长度靠 {@code AssetManager.openFd().getLength()} 与 {@code InputStream.available()}，
 *       前者对非 stored 条目会抛、对某些包会回 {@code UNKNOWN_LENGTH}，后者是估算值；
 *       长度一错，WebView 收到的就是畸形 HTTP，整页静默失败；</li>
 *   <li>起 socket + 线程池 + 手写 HTTP 解析，任何一处异常都发生在渲染进程之外，页面侧看不到任何痕迹。</li>
 * </ol>
 *
 * <p>现在这份实现是同步、进程内的：没有端口、没有线程、没有 openFd，素材路径就是 zip 里那段字节。
 * 虚拟域名用 Google 自己的 {@code appassets.androidplatform.net}（{@code WebViewAssetLoader} 同款），
 * 它是 https 源，ES module / fetch / localStorage / WebAudio 全都正常，且 <b>origin 固定</b>。
 *
 * <p>契约（与 {@link HttpUtil} 的桌面单测同一份逻辑）：
 * GET/HEAD；200 带 Content-Length；{@code Range: bytes=a-b} 回 206 + Content-Range；
 * 越界 416 + {@code bytes *}{@code /len}；{@code ..}、绝对路径、盘符、反斜杠一律 403；
 * 找不到就 404（不静默回 index.html，只有「目录」才回退到目录下的 index.html）。
 */
public final class AssetHandler {

    private static final String TAG = "SanguoShell";

    /** 虚拟站点域名。不要改：改了等于换 origin，老存档会读不到。 */
    public static final String HOST = "appassets.androidplatform.net";
    /** 站点根 URL，壳里所有站内地址都以它开头。 */
    public static final String ORIGIN = "https://" + HOST + "/";
    /** assets 下的站点根目录（构建时把 game/web + game/data + game/dist 平铺到这里）。 */
    private static final String ROOT = "www/";

    private final AssetManager assets;

    public AssetHandler(AssetManager assets) {
        this.assets = assets;
    }

    /** 这个 URL 归不归我们管（只接虚拟域名，其它一律放回 WebView/系统）。 */
    public boolean owns(String url) {
        return url != null && url.regionMatches(true, 0, ORIGIN, 0, ORIGIN.length());
    }

    /**
     * 生成一条应答。
     *
     * @param method      {@code GET} / {@code HEAD}（其它回 405）
     * @param encodedPath 请求路径，取 {@code Uri.getEncodedPath()}——<b>必须是编码过的</b>，
     *                    因为 {@link HttpUtil#normalizePath} 内部才做一次百分号解码（中文文件名靠它）
     * @param rangeHeader {@code Range} 请求头，没有就 null
     */
    public WebResourceResponse handle(String method, String encodedPath, String rangeHeader) {
        String verb = method == null ? "GET" : method.toUpperCase(java.util.Locale.ROOT);
        String rel = HttpUtil.normalizePath(encodedPath);
        if (rel == null) {
            Log.w(TAG, "403 " + encodedPath + "（路径非法/试图穿越）");
            return text(403, "Forbidden", "403 路径非法：" + encodedPath);
        }
        if (!"GET".equals(verb) && !"HEAD".equals(verb)) {
            Log.w(TAG, "405 " + verb + " " + rel);
            return text(405, "Method Not Allowed", "405 只支持 GET/HEAD");
        }

        InputStream in;
        try {
            in = assets.open(ROOT + rel, AssetManager.ACCESS_STREAMING);
        } catch (IOException e) {
            return notFound(rel, e);
        }
        long len = sizeOf(in);
        if (len == 0) {
            // assets.open() 对「目录」不抛错，只给一个空流。目录按惯例回退到 dir/index.html。
            closeQuietly(in);
            String idx = rel.endsWith("/") ? rel + "index.html" : rel + "/index.html";
            try {
                in = assets.open(ROOT + idx, AssetManager.ACCESS_STREAMING);
                len = sizeOf(in);
                rel = idx;
            } catch (IOException e) {
                if (rel.endsWith("index.html")) {
                    // 真的是个 0 字节文件（构建脚本断言过 assets 里没有空文件，这里只是兜底）
                    return body("text/plain; charset=utf-8", 200, "OK", rel, len,
                            new ByteArrayInputStream(new byte[0]));
                }
                return notFound(rel, e);
            }
        }

        String mime = HttpUtil.mimeOf(rel);
        // WebResourceResponse 的 mimeType 必须是「纯类型」：带 "; charset=utf-8" 的话 Chromium
        // 不会把它认成 HTML（Blink 里 IsHTMLMimeType 是字符串全等比较），整页会被当纯文本渲染
        // ——真机上已实测：campaign.html 直接显示成源码。charset 只能走 encoding 参数。
        String mtype = mimeTypeOf(mime);
        String enc = charsetOf(mime);
        HttpUtil.Range r = HttpUtil.parseRange(rangeHeader, len);
        if (r != null && !r.satisfiable) {
            closeQuietly(in);
            Map<String, String> h = baseHeaders(mime);
            h.put("Content-Range", "bytes */" + len);
            Log.w(TAG, "416 " + rel + " range=" + rangeHeader + " len=" + len);
            return new WebResourceResponse("text/plain", "utf-8",
                    416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
        }

        int status = 200;
        String reason = "OK";
        long start = 0;
        long count = len;
        if (r != null) {
            status = 206;
            reason = "Partial Content";
            start = r.start;
            count = r.end - r.start + 1;
        }
        Map<String, String> headers = baseHeaders(mime);
        if (r != null) headers.put("Content-Range", "bytes " + r.start + "-" + r.end + "/" + len);
        headers.put("Content-Length", String.valueOf(count));

        if ("HEAD".equals(verb)) {
            closeQuietly(in);
            return new WebResourceResponse(mtype, enc, status, reason, headers,
                    new ByteArrayInputStream(new byte[0]));
        }
        InputStream data;
        try {
            if (start > 0) skipFully(in, start);
        } catch (IOException e) {
            closeQuietly(in);
            Log.e(TAG, "500 " + rel + " seek to " + start + " 失败", e);
            return text(500, "Internal Server Error", "500 读不到：" + rel);
        }
        data = (start == 0 && count == len) ? in : new Bounded(in, count);
        Log.i(TAG, "serve " + status + " " + rel + " " + mime + " " + count + "/" + len
                + (rangeHeader == null ? "" : " range=" + rangeHeader));
        return new WebResourceResponse(mtype, enc, status, reason, headers, data);
    }

    /** 给拦截层兜底用：任何没料到的 Throwable 也要变成一条看得见的应答，而不是空白。 */
    public WebResourceResponse error(int code, String msg) {
        return text(code, code == 500 ? "Internal Server Error" : "Error", msg);
    }

    // ------------------------------------------------------------------ 内部

    private static Map<String, String> baseHeaders(String mime) {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Content-Type", mime);
        h.put("Accept-Ranges", "bytes");
        h.put("Cache-Control", "no-cache");
        return h;
    }

    /**
     * 从 {@code "text/html; charset=utf-8"} 里取纯类型 {@code "text/html"}。
     *
     * <p>Chromium 的 Blink 用字符串全等判断 {@code IsHTMLMimeType(mime_type)}，带参数就判不出来，
     * 结果整页当纯文本渲染（真机实测：campaign.html 显示成源码，2026-11-26）。所以
     * {@link WebResourceResponse} 的 mimeType 必须裸类型，charset 只能放 encoding 参数。
     */
    private static String mimeTypeOf(String full) {
        return HttpUtil.mimeTypeOf(full);
    }

    /** 文本类给 utf-8；二进制（mp3/webp/png…）给 null，别让 WebView 去做无意义的转码。 */
    private static String charsetOf(String full) {
        return HttpUtil.charsetOf(full);
    }

    private WebResourceResponse body(String mime, int status, String reason, String rel,
                                     long len, InputStream data) {
        Map<String, String> h = baseHeaders(mime);
        h.put("Content-Length", String.valueOf(len));
        return new WebResourceResponse(mimeTypeOf(mime), charsetOf(mime), status, reason, h, data);
    }

    private WebResourceResponse text(int status, String reason, String msg) {
        byte[] b = (msg + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Map<String, String> h = baseHeaders("text/plain; charset=utf-8");
        h.put("Content-Length", String.valueOf(b.length));
        return new WebResourceResponse("text/plain", "utf-8", status, reason, h,
                new ByteArrayInputStream(b));
    }

    private WebResourceResponse notFound(String rel, IOException e) {
        Log.w(TAG, "404 " + rel + (e == null ? "" : "（" + e + "）"));
        return text(404, "Not Found", "404 素材里没有：" + rel);
    }

    /**
     * 素材长度。
     *
     * <p>用 {@code InputStream.available()} 而<b>不用</b> {@code AssetManager.openFd().getLength()}：
     * 后者是上一版的坑（对非 stored 条目直接抛 IllegalArgumentException，某些包里回
     * {@code UNKNOWN_LENGTH = -1}，于是 Content-Length 变成 -1，整页静默失败）。
     * {@code AssetManager.AssetInputStream.available()} 走的是 {@code Asset::getRemainingLength()}，
     * 就是「打开时声明的未压缩长度」，对 stored 条目（本作 100% stored，见 tools/build_apk.ps1）是精确值。
     */
    private static long sizeOf(InputStream in) {
        try {
            return Math.max(0L, (long) in.available());
        } catch (IOException e) {
            return 0L;
        }
    }

    private static void closeQuietly(InputStream in) {
        if (in == null) return;
        try {
            in.close();
        } catch (IOException ignored) {
        }
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long left = n;
        while (left > 0) {
            long s = in.skip(left);
            if (s <= 0) {
                if (in.read() < 0) break;
                s = 1;
            }
            left -= s;
        }
    }

    /** 只放出前 {@code left} 个字节的包装流：206 的 Content-Length 必须与响应体严格一致。 */
    private static final class Bounded extends FilterInputStream {
        private long left;

        Bounded(InputStream in, long left) {
            super(in);
            this.left = left;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = in.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int n) throws IOException {
            if (left <= 0) return -1;
            int got = in.read(buf, off, (int) Math.min((long) n, left));
            if (got > 0) left -= got;
            return got;
        }

        @Override
        public int available() {
            return (int) Math.min(left, Integer.MAX_VALUE);
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }
}
