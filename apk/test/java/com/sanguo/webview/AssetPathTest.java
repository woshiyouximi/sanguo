package com.sanguo.webview;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * 桌面 JVM 上验证「拦截层会用到的那个纯逻辑层」在<b>真实素材树</b>上成立（不需要模拟器）。
 *
 * <p>为什么值得写：{@link AssetHandler} 只在真机上跑得起来，但它的判定全在 {@link HttpUtil} 里——
 * 一条 URL 能不能映射到 assets 里的某个文件、MIME 对不对、206 的区间算得对不对。做法是拿
 * {@code apk\assets\www} 下的每一个真实文件反推出「WebView 会发的那条 URL」，再喂回
 * {@link HttpUtil#normalizePath}，要求逐字回到原路径。1671 个文件全部对上，就说明
 * 「页面里的每个 src/href/fetch 路径」都能被拦截层找到，不存在「壳能起来但资源全 404」这种半死状态。
 *
 * <p>另外还模拟一遍 206 的切片（skip 到 start + 只放 count 个字节），与文件真实字节比对：
 * 音频拖动时 Content-Range 与实际字节必须严格一致，否则 {@code <audio>} 会中途停。
 *
 * <pre>
 *   javac -encoding UTF-8 -d apk/build/test-classes \
 *     apk/java/com/sanguo/webview/HttpUtil.java apk/test/java/com/sanguo/webview/AssetPathTest.java
 *   java -cp apk/build/test-classes com.sanguo.webview.AssetPathTest [assetsWwwDir]
 * </pre>
 */
public final class AssetPathTest {

    private static int checks = 0;
    private static int failed = 0;

    private static void eq(String what, Object want, Object got) {
        checks++;
        if (want == null ? got == null : want.equals(got)) return;
        failed++;
        System.out.println("FAIL " + what + "\n  want: " + want + "\n  got : " + got);
    }

    private static void ok(String what, boolean cond, String detail) {
        checks++;
        if (cond) return;
        failed++;
        System.out.println("FAIL " + what + (detail == null ? "" : "\n  " + detail));
    }

    public static void main(String[] args) throws Exception {
        File root = new File(args.length > 0 ? args[0] : "F:\\sanguo\\apk\\assets\\www");
        if (!root.isDirectory()) {
            System.out.println("FAIL 素材根目录不存在：" + root);
            System.exit(1);
        }

        // ---- ① 每个真实文件都要能被它自己的 URL 找到 ----
        List<File> files = new ArrayList<>();
        walk(root, files);
        int mismatched = 0;
        TreeSet<String> exts = new TreeSet<>();
        TreeSet<String> octet = new TreeSet<>();
        for (File f : files) {
            String rel = relative(root, f);
            String url = "/" + encodePath(rel);
            String got = HttpUtil.normalizePath(url);
            if (!rel.equals(got)) {
                mismatched++;
                if (mismatched <= 5) {
                    System.out.println("FAIL 路径反解不一致\n  file: " + rel + "\n  url : " + url + "\n  got : " + got);
                }
            }
            String mime = HttpUtil.mimeOf(rel);
            String ext = extOf(rel);
            exts.add(ext);
            if ("application/octet-stream".equals(mime)) octet.add(ext);
        }
        checks++;
        if (mismatched == 0) {
            System.out.println("PASS 素材可寻址：" + files.size() + " 个文件全部按 URL 反解回原路径");
        } else {
            failed++;
            System.out.println("FAIL 有 " + mismatched + "/" + files.size() + " 个文件反解不一致");
        }
        System.out.println("      扩展名清单：" + exts);
        System.out.println("      落到 octet-stream 的扩展名（应为空；空文件/无语扩展名才会）：" + octet);

        // ---- ② 越权防护：这些必须全部回 null（调用方回 403）----
        eq("/../etc/passwd", null, HttpUtil.normalizePath("/../etc/passwd"));
        eq("/assets/../../x", null, HttpUtil.normalizePath("/assets/../../x"));
        eq("/%2e%2e/x", null, HttpUtil.normalizePath("/%2e%2e/x"));
        eq("/a%2f..%2fb", null, HttpUtil.normalizePath("/a%2f..%2fb"));
        eq("/a\\b", null, HttpUtil.normalizePath("/a\\b"));
        eq("/c:/windows", null, HttpUtil.normalizePath("/c:/windows"));
        eq("/a\u0000b", null, HttpUtil.normalizePath("/a\u0000b"));
        eq("//etc/passwd（折叠后仍是绝对路径 → 落进 assets 根，不越界）", "etc/passwd",
                HttpUtil.normalizePath("//etc/passwd"));
        eq("目录 → index.html", "assets/index.html", HttpUtil.normalizePath("/assets/"));
        eq("根 → index.html", "index.html", HttpUtil.normalizePath("/"));
        eq("file:// 形态一律拒绝", null, HttpUtil.normalizePath("/file:///etc/passwd"));

        // ---- ③ MIME：规格点名的每一种 ----
        eq("html", "text/html; charset=utf-8", HttpUtil.mimeOf("campaign.html"));
        eq("js", "text/javascript", HttpUtil.mimeOf("dist/core/battle.js"));
        eq("css", "text/css", HttpUtil.mimeOf("a.css"));
        eq("json", "application/json", HttpUtil.mimeOf("data/meta.json"));
        eq("webp", "image/webp", HttpUtil.mimeOf("assets/hero/曹操.webp"));
        eq("png", "image/png", HttpUtil.mimeOf("assets/bg/map_bg.png"));
        eq("mp3", "audio/mpeg", HttpUtil.mimeOf("assets/audio/bgm/01.mp3"));

        // ---- ③b 裸 mimeType（真机黑屏回归）：WebResourceResponse 的 mimeType 不能带参数 ----
        // 2026-11-26 实测：mimeType 传 "text/html; charset=utf-8" 时，Blink 的 IsHTMLMimeType
        // 是全等比较，认不出来 → 整页当纯文本渲染（campaign.html 显示成源码）。规则：mimeTypeOf()
        // 的结果里不许出现 ';'，charset 只能走 charsetOf()。
        String[] heads = {"campaign.html", "dist/core/battle.js", "a.css", "data/meta.json",
                "assets/bg/map_bg.png", "assets/audio/bgm/01.mp3", "a.webp", "x.svg", "x.txt",
                "x.bin"};
        for (String h : heads) {
            String full = HttpUtil.mimeOf(h);
            String mt = HttpUtil.mimeTypeOf(full);
            ok("mimeTypeOf 必须是裸类型（无 ';'）：" + h, mt.indexOf(';') < 0, full + " → " + mt);
            ok("mimeTypeOf 不能为空：" + h, mt.length() > 0, mt);
        }
        eq("裸类型：html", "text/html", HttpUtil.mimeTypeOf(HttpUtil.mimeOf("campaign.html")));
        eq("html 的 charset", "utf-8", HttpUtil.charsetOf(HttpUtil.mimeOf("campaign.html")));
        eq("js 即使没写 charset= 也要给 utf-8", "utf-8",
                HttpUtil.charsetOf(HttpUtil.mimeOf("dist/core/battle.js")));
        eq("mp3 不能给 encoding（二进制不许转码）", null,
                HttpUtil.charsetOf(HttpUtil.mimeOf("a.mp3")));
        eq("webp 不能给 encoding", null, HttpUtil.charsetOf(HttpUtil.mimeOf("a.webp")));
        int withSemi = 0;
        for (String ext : exts) {
            if (HttpUtil.mimeTypeOf(HttpUtil.mimeOf("f." + ext)).indexOf(';') >= 0) withSemi++;
        }
        ok("全部扩展名（" + exts.size() + " 种）的裸类型都不带 ';'", withSemi == 0,
                "带 ';' 的有 " + withSemi + " 种");

        // ---- ④ Range：206 语义 ----
        range("bytes=0-1023", 4096, 0, 1023, true);
        range("bytes=4090-", 4096, 4090, 4095, true);
        range("bytes=-10", 4096, 4086, 4095, true);
        range("bytes=0-999999", 4096, 0, 4095, true);
        range("bytes=4096-", 4096, 0, -1, false);
        rangeNull("bytes=0-1,3-4", 4096);
        rangeNull(null, 4096);

        // ---- ⑤ 真文件上模拟一次 206 切片：skip + 只放 count 字节 ----
        File sample = null;
        for (File f : files) {
            if (f.getName().endsWith(".mp3") && f.length() > 8192) {
                sample = f;
                break;
            }
        }
        if (sample == null) {
            for (File f : files) {
                if (f.length() > 8192) {
                    sample = f;
                    break;
                }
            }
        }
        if (sample != null) {
            byte[] all = readAll(sample);
            long len = all.length;
            long start = len / 3;
            long end = start + 4095;
            HttpUtil.Range r = HttpUtil.parseRange("bytes=" + start + "-", len);
            ok("206 解析非空", r != null, null);
            if (r != null) {
                eq("206.start", start, r.start);
                eq("206.end", len - 1, r.end);
                eq("Content-Range 文本", "bytes " + start + "-" + (len - 1) + "/" + len,
                        "bytes " + r.start + "-" + r.end + "/" + len);
                long count = r.end - r.start + 1;
                byte[] slice = slice(sample, r.start, count);
                eq("切片长度 = Content-Length", (int) count, slice.length);
                boolean same = true;
                for (int i = 0; i < Math.min(slice.length, 64); i++) {
                    if (slice[i] != all[(int) (start + i)]) {
                        same = false;
                        break;
                    }
                }
                ok("切片前 64 字节与源文件一致（" + sample.getName() + "）", same, null);
            }
        }

        System.out.println();
        if (failed == 0) {
            System.out.println("PASS " + checks + "/" + checks + " (AssetPathTest)");
            System.exit(0);
        }
        System.out.println("FAILED " + failed + "/" + checks);
        System.exit(1);
    }

    private static void range(String header, long len, long wantStart, long wantEnd, boolean wantOk) {
        HttpUtil.Range r = HttpUtil.parseRange(header, len);
        String tag = "range(" + header + ", " + len + ")";
        if (r == null) {
            checks++;
            failed++;
            System.out.println("FAIL " + tag + " 得到 null");
            return;
        }
        eq(tag + ".start", wantStart, r.start);
        eq(tag + ".end", wantEnd, r.end);
        eq(tag + ".satisfiable", wantOk, r.satisfiable);
    }

    private static void rangeNull(String header, long len) {
        checks++;
        if (HttpUtil.parseRange(header, len) != null) {
            failed++;
            System.out.println("FAIL range(" + header + ") 期望 null");
        }
    }

    private static String extOf(String rel) {
        int dot = rel.lastIndexOf('.');
        int slash = rel.lastIndexOf('/');
        if (dot < 0 || dot < slash) return "(none)";
        return rel.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
    }

    private static String relative(File root, File f) {
        String r = root.getAbsolutePath();
        String p = f.getAbsolutePath();
        if (p.startsWith(r)) {
            p = p.substring(r.length());
            if (p.startsWith(File.separator)) p = p.substring(1);
        }
        return p.replace(File.separatorChar, '/');
    }

    /** 按 Chromium 的 getEncodedPath() 的风格编码：非 unreserved 字符一律 %XX（UTF-8）。 */
    private static String encodePath(String rel) {
        StringBuilder sb = new StringBuilder(rel.length() + 16);
        for (byte b : rel.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            int c = b & 0xFF;
            boolean safe = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                    || c == '-' || c == '_' || c == '.' || c == '~' || c == '/';
            if (safe) sb.append((char) c);
            else sb.append('%').append(Character.toUpperCase(Character.forDigit((c >> 4) & 0xF, 16)))
                    .append(Character.toUpperCase(Character.forDigit(c & 0xF, 16)));
        }
        return sb.toString();
    }

    private static void walk(File dir, List<File> out) {
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            if (k.isDirectory()) walk(k, out);
            else out.add(k);
        }
    }

    private static byte[] readAll(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream((int) Math.min(f.length(), 1 << 20));
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } finally {
            in.close();
        }
    }

    /** 与 AssetHandler.Bounded 同形：skip 到 start，然后最多放 count 个字节。 */
    private static byte[] slice(File f, long start, long count) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            long left = start;
            while (left > 0) {
                long s = in.skip(left);
                if (s <= 0) {
                    if (in.read() < 0) break;
                    s = 1;
                }
                left -= s;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream((int) Math.min(count, 1 << 20));
            byte[] buf = new byte[4096];
            long remain = count;
            while (remain > 0) {
                int n = in.read(buf, 0, (int) Math.min((long) buf.length, remain));
                if (n <= 0) break;
                bos.write(buf, 0, n);
                remain -= n;
            }
            return bos.toByteArray();
        } finally {
            in.close();
        }
    }
}
