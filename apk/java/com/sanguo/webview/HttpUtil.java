package com.sanguo.webview;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.util.ArrayDeque;
import java.util.Locale;

/**
 * 纯逻辑层：URL 路径归一化 / 防目录穿越、MIME 表、Range 头解析、状态行文案。
 *
 * <p>刻意不 import 任何 {@code android.*}：AssetServer 在真机/模拟器外跑不起来，但这一层可以在
 * 桌面 JVM 上用普通 javac 编译并直接跑断言（见 apk/test/java/com/sanguo/webview/HttpUtilTest.java）。
 * 这样「MIME 对不对、206 的区间算得对不对、../ 会不会穿出去」不是靠人眼审代码，而是有可执行证据。
 */
public final class HttpUtil {

    private HttpUtil() {}

    /** 支持的范围：单段闭区间 [start, end]（含两端）。 */
    public static final class Range {
        public final long start;
        public final long end;
        /** false = 语法成立但文件不够长（回 416）。 */
        public final boolean satisfiable;

        Range(long start, long end, boolean satisfiable) {
            this.start = start;
            this.end = end;
            this.satisfiable = satisfiable;
        }

        static final Range UNSATISFIABLE = new Range(0, -1, false);
    }

    /**
     * 把请求行里的 target（形如 {@code /assets/audio/bgm/03.mp3}）归一化成 assets 内的相对路径。
     *
     * <ul>
     *   <li>{@code /} 与空路径 → {@code index.html}；以 {@code /} 结尾 → 追加 {@code index.html}</li>
     *   <li>{@code .} 段丢弃，{@code ..} 段一律拒绝（assets 里没有任何需要 ../ 的场景）</li>
     *   <li>{@code \ : NUL} 出现即拒绝，重复斜杠折叠</li>
     * </ul>
     *
     * @return 归一化后的相对路径；{@code null} = 拒绝（调用方回 403）
     */
    public static String normalizePath(String target) {
        if (target == null) return null;
        String p = target;
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        int h = p.indexOf('#');
        if (h >= 0) p = p.substring(0, h);
        try {
            // '+' 会被解成空格：素材文件名里没有 '+'，这个偏差可接受，换来的是中文/空格文件名能直接用
            p = URLDecoder.decode(p, "UTF-8");
        } catch (UnsupportedEncodingException | IllegalArgumentException e) {
            return null;
        }
        if (p.indexOf('\\') >= 0 || p.indexOf(':') >= 0 || p.indexOf('\0') >= 0) return null;
        while (p.indexOf("//") >= 0) p = p.replace("//", "/");
        if (p.startsWith("/")) p = p.substring(1);
        if (p.isEmpty() || p.endsWith("/")) p = p + "index.html";
        ArrayDeque<String> out = new ArrayDeque<>();
        for (String seg : p.split("/")) {
            if (seg.isEmpty() || seg.equals(".")) continue;
            if (seg.equals("..")) return null;
            out.addLast(seg);
        }
        if (out.isEmpty()) return "index.html";
        return String.join("/", out);
    }

    /** 扩展名 → MIME。表外一律 {@code application/octet-stream}。 */
    public static String mimeOf(String path) {
        if (path == null) return "application/octet-stream";
        String p = path.toLowerCase(Locale.ROOT);
        int dot = p.lastIndexOf('.');
        String ext = dot >= 0 ? p.substring(dot + 1) : "";
        switch (ext) {
            case "html":
            case "htm":
                return "text/html; charset=utf-8";
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "json":
                return "application/json";
            case "map":
                return "application/json";
            case "txt":
                return "text/plain; charset=utf-8";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "webp":
                return "image/webp";
            case "gif":
                return "image/gif";
            case "svg":
                return "image/svg+xml";
            case "ico":
                return "image/x-icon";
            case "mp3":
                return "audio/mpeg";
            case "ogg":
            case "oga":
                return "audio/ogg";
            case "wav":
                return "audio/wav";
            case "mp4":
                return "video/mp4";
            case "woff":
                return "font/woff";
            case "woff2":
                return "font/woff2";
            case "ttf":
                return "font/ttf";
            case "otf":
                return "font/otf";
            case "wasm":
                return "application/wasm";
            default:
                return "application/octet-stream";
        }
    }

    /**
     * 从 {@code "text/html; charset=utf-8"} 里取纯类型 {@code "text/html"}。
     *
     * <p><b>为什么需要这个</b>：{@code WebResourceResponse} 的 mimeType 会被原样塞进 Chromium 的
     * {@code net::HttpResponseInfo.mime_type}，而 Blink 判断「这是不是 HTML」用的是字符串全等
     * （{@code IsHTMLMimeType(mime_type)} 只认 {@code "text/html"}）。带 {@code "; charset=utf-8"}
     * 就判不出来，整页会被当纯文本渲染 —— 2026-11-26 在模拟器上实测：campaign.html 直接显示成源码。
     * 所以 mimeType 必须裸类型，charset 只能走 {@code WebResourceResponse(mime, encoding, …)} 的
     * encoding 参数（见 {@link #charsetOf(String)}）。
     */
    public static String mimeTypeOf(String full) {
        if (full == null) return "application/octet-stream";
        int semi = full.indexOf(';');
        return (semi < 0 ? full : full.substring(0, semi)).trim();
    }

    /**
     * 取 charset（没有就从类型推断：文本类给 {@code utf-8}，二进制给 {@code null}）。
     *
     * <p>二进制绝对不要给 encoding —— 那会让 WebView 把字节流当文本转码。
     */
    public static String charsetOf(String full) {
        if (full != null) {
            int semi = full.indexOf(';');
            if (semi >= 0) {
                String p = full.substring(semi + 1);
                int cs = p.toLowerCase(Locale.ROOT).indexOf("charset");
                int eq = cs < 0 ? -1 : p.indexOf('=', cs);
                if (eq > 0) {
                    String v = p.substring(eq + 1).trim();
                    if (v.length() > 0) return v;
                }
            }
        }
        String t = mimeTypeOf(full);
        if (t.startsWith("text/")
                || t.equals("application/json")
                || t.endsWith("+json")
                || t.equals("application/javascript")
                || t.equals("application/xml")
                || t.endsWith("+xml")
                || t.equals("image/svg+xml")) {
            return "utf-8";
        }
        return null;
    }

    /**
     * 解析单段 {@code Range: bytes=a-b}（也接受 {@code a-} 与 {@code -n} 后缀式）。
     *
     * <p>返回 {@code null} 表示「没有 Range 或语法不认识」——调用方按整档 200 回，这是协议允许的降级；
     * 返回 {@link Range#satisfiable} 为 false 表示越界，调用方回 416 + {@code Content-Range: bytes *}{@code /len}。
     * 多段（逗号）不支持，同样降级成 200 整档：{@code <audio>} 播 mp3 只会发单段。
     */
    public static Range parseRange(String header, long len) {
        if (header == null || len <= 0) return null;
        String h = header.trim();
        if (!h.regionMatches(true, 0, "bytes=", 0, 6)) return null;
        String spec = h.substring(6).trim();
        if (spec.isEmpty() || spec.indexOf(',') >= 0) return null;
        int dash = spec.indexOf('-');
        if (dash < 0) return null;
        String a = spec.substring(0, dash).trim();
        String b = spec.substring(dash + 1).trim();
        long start;
        long end;
        try {
            if (a.isEmpty()) {
                if (b.isEmpty()) return null;
                long suffix = Long.parseLong(b);
                if (suffix <= 0) return Range.UNSATISFIABLE;
                start = Math.max(0, len - suffix);
                end = len - 1;
            } else {
                start = Long.parseLong(a);
                end = b.isEmpty() ? len - 1 : Long.parseLong(b);
            }
        } catch (NumberFormatException e) {
            return null;
        }
        if (start < 0 || start >= len || end < start) return Range.UNSATISFIABLE;
        if (end > len - 1) end = len - 1;
        return new Range(start, end, true);
    }

    /** 状态码 → 原因短语（只覆盖本服务器会回的几种）。 */
    public static String reason(int code) {
        switch (code) {
            case 200: return "OK";
            case 206: return "Partial Content";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 416: return "Range Not Satisfiable";
            case 500: return "Internal Server Error";
            default: return "Unknown";
        }
    }
}
