package com.sanguo.webview;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * <b>已弃用（1.0 方案），仅作对照，默认永不实例化。</b>
 *
 * <p>1.1 换成 {@link AssetHandler}：{@code WebViewClient.shouldInterceptRequest} 直接应答
 * {@code assets/www}，源是虚拟域名 {@code https://appassets.androidplatform.net/}。
 * 保留这个类只有一个用途：万一某个 ROM 上虚拟域名不通，把 {@code MainActivity.USE_SOCKET_SERVER}
 * 拨成 {@code true} 就能切回这套 1.0 取数方式做 A/B。除此之外<b>不要再用它</b>，它有三个先天问题
 * （随机端口 ⇒ 每次启动换 origin ⇒ localStorage 存档丢失；{@code openFd().getLength()} 可能是
 * {@code UNKNOWN_LENGTH=-1}；起线程池 + 手写 HTTP，失败全在渲染进程之外、页面侧零痕迹）。
 *
 * <p>—— 以下是 1.0 的原始说明 ——
 *
 * <p>只在本机回环（127.0.0.1）上跑的静态文件服务器，文件源是 APK 里的 {@code assets/www/}。
 *
 * <p>为什么不用 {@code file:///android_asset/}：WebView 对 file:// 有同源限制（ES module / fetch 全部
 * 被挡），本作是多页 ESM + {@code fetch('../data/*.json')}，必须有一个真正的 http 源。
 *
 * <p>要点：
 * <ul>
 *   <li>端口用 0 让系统分配，再 {@link ServerSocket#getLocalPort()} 取回来；只 bind 127.0.0.1，
 *       外网/局域网连不进来（也不用 INTERNET 之外任何权限）</li>
 *   <li>{@code Range} 支持到 206 + Content-Range，{@code <audio>} 才能拖动/循环播长 mp3</li>
 *   <li>GET/HEAD/404/403/405/416 都有正常应答；单个请求出错只 kill 这一条连接，不崩线程</li>
 * </ul>
 */
public final class AssetServer {

    private static final String TAG = "AssetServer";
    /** assets 下的站点根目录（构建时把 game/web + game/data + game/dist 平铺到这里）。 */
    private static final String ROOT = "www/";
    private static final int BUFFER = 64 * 1024;
    /** 同时处理的连接数上限：WebView 首屏会并发拉十几个素材，8 条够用又不会把线程数放大。 */
    private static final int THREADS = 8;

    private final AssetManager assets;
    private final ExecutorService pool = Executors.newFixedThreadPool(THREADS, r -> {
        Thread t = new Thread(r, "asset-http");
        t.setDaemon(true);
        return t;
    });

    private ServerSocket server;
    private Thread acceptor;
    private volatile boolean running;
    private int port = -1;

    public AssetServer(AssetManager assets) {
        this.assets = assets;
    }

    /**
     * 绑定 127.0.0.1:0 并开始 accept。
     *
     * @return 实际端口
     */
    public int start() throws IOException {
        server = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        server.setReuseAddress(true);
        port = server.getLocalPort();
        running = true;
        acceptor = new Thread(this::acceptLoop, "asset-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        Log.i(TAG, "listening on http://127.0.0.1:" + port + "/ root=" + ROOT);
        return port;
    }

    public int getPort() {
        return port;
    }

    /** 幂等：Activity 销毁 / 进程退出都可以再调一次。 */
    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException e) {
            Log.w(TAG, "close server: " + e);
        }
        server = null;
        pool.shutdownNow();
        Log.i(TAG, "stopped (port " + port + ")");
    }

    private void acceptLoop() {
        while (running) {
            Socket sock = null;
            try {
                sock = server.accept();
                final Socket s = sock;
                pool.execute(() -> handle(s));
            } catch (IOException e) {
                if (running) {
                    Log.w(TAG, "accept: " + e);
                } else {
                    break;
                }
            } catch (RuntimeException e) {
                // 线程池被 shutdown 后提交会抛 RejectedExecutionException：退出循环即可
                if (running) Log.w(TAG, "dispatch: " + e);
                break;
            }
        }
    }

    // ---------------------------------------------------------------- 单条连接

    private void handle(Socket sock) {
        try {
            sock.setSoTimeout(20000);
            sock.setTcpNoDelay(true);
            BufferedReader in = new BufferedReader(
                    new InputStreamReader(sock.getInputStream(), StandardCharsets.ISO_8859_1));
            String requestLine = in.readLine();
            if (requestLine == null || requestLine.isEmpty()) {
                closeQuietly(sock);
                return;
            }
            String rangeHeader = null;
            String line;
            int guard = 0;
            while ((line = in.readLine()) != null && !line.isEmpty()) {
                if (++guard > 64) break; // 头部不设上限会被恶意长头拖住
                int c = line.indexOf(':');
                if (c <= 0) continue;
                if ("range".equalsIgnoreCase(line.substring(0, c).trim())) {
                    rangeHeader = line.substring(c + 1).trim();
                }
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeText(sock, 400, "bad request line");
                return;
            }
            String method = parts[0].toUpperCase(Locale.ROOT);
            boolean head = "HEAD".equals(method);
            if (!head && !"GET".equals(method)) {
                writeText(sock, 405, "only GET/HEAD");
                return;
            }

            String path = HttpUtil.normalizePath(parts[1]);
            if (path == null) {
                Log.w(TAG, "403 " + parts[1]);
                writeText(sock, 403, "forbidden");
                return;
            }
            serve(sock, path, rangeHeader, head);
        } catch (IOException e) {
            Log.w(TAG, "conn: " + e);
        } catch (RuntimeException e) {
            Log.e(TAG, "conn crash", e);
        } finally {
            closeQuietly(sock);
        }
    }

    private void serve(Socket sock, String path, String rangeHeader, boolean head) throws IOException {
        InputStream src = null;
        AssetFileDescriptor afd = null;
        long len;
        try {
            try {
                // 未压缩的素材（aapt2 对 png/mp3 等默认不压）走 fd：Range 直接 seek，不用 skip 扫字节
                afd = assets.openFd(ROOT + path);
                len = afd.getLength();
                FileInputStream fis = afd.createInputStream();
                fis.getChannel().position(0);
                src = fis;
            } catch (IOException notUncompressed) {
                src = assets.open(ROOT + path);
                len = src.available();
            }
        } catch (IOException e) {
            Log.d(TAG, "404 " + path);
            writeText(sock, 404, "not found: " + path);
            return;
        }

        try {
            String mime = HttpUtil.mimeOf(path);
            HttpUtil.Range range = HttpUtil.parseRange(rangeHeader, len);
            OutputStream out = new BufferedOutputStream(sock.getOutputStream(), BUFFER);

            if (range != null && !range.satisfiable) {
                writeHead(out, 416, mime, 0, null, len);
                out.flush();
                Log.d(TAG, "416 " + path + " len=" + len + " range=" + rangeHeader);
                return;
            }

            long start = 0;
            long end = len - 1;
            int code = 200;
            String contentRange = null;
            if (range != null) {
                start = range.start;
                end = range.end;
                code = 206;
                contentRange = "bytes " + start + "-" + end + "/" + len;
            }
            long count = end - start + 1;
            if (count < 0) count = 0;
            writeHead(out, code, mime, count, contentRange, len);
            if (!head && count > 0) {
                pump(src, out, start, count);
            }
            out.flush();
            Log.v(TAG, code + " " + path + " " + count + "/" + len);
        } finally {
            closeQuietly(src);
            closeQuietly(afd);
        }
    }

    /** 从 src 的 {@code start} 处起拷 {@code count} 字节到 out。 */
    private static void pump(InputStream src, OutputStream out, long start, long count) throws IOException {
        long toSkip = start;
        while (toSkip > 0) {
            long n = src.skip(toSkip);
            if (n <= 0) break;
            toSkip -= n;
        }
        byte[] buf = new byte[BUFFER];
        long left = count;
        while (left > 0) {
            int want = (int) Math.min(buf.length, left);
            int n = src.read(buf, 0, want);
            if (n < 0) break;
            out.write(buf, 0, n);
            left -= n;
        }
    }

    private static void writeHead(OutputStream out, int code, String mime, long length,
                                  String contentRange, long totalLen) throws IOException {
        StringBuilder sb = new StringBuilder(256);
        sb.append("HTTP/1.1 ").append(code).append(' ').append(HttpUtil.reason(code)).append("\r\n");
        sb.append("Content-Type: ").append(mime).append("\r\n");
        sb.append("Content-Length: ").append(length).append("\r\n");
        if (contentRange != null) sb.append("Content-Range: ").append(contentRange).append("\r\n");
        else if (code == 416) sb.append("Content-Range: bytes */").append(totalLen).append("\r\n");
        sb.append("Accept-Ranges: bytes\r\n");
        sb.append("Cache-Control: no-cache\r\n");
        sb.append("Connection: close\r\n");
        sb.append("\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
    }

    /** 错误应答：小段纯文本，绝不能因为写失败把线程带崩。 */
    private static void writeText(Socket sock, int code, String detail) {
        try {
            OutputStream out = sock.getOutputStream();
            byte[] body = (code + " " + HttpUtil.reason(code) + ": " + detail + "\n")
                    .getBytes(StandardCharsets.UTF_8);
            writeHead(out, code, "text/plain; charset=utf-8", body.length, null, body.length);
            out.write(body);
            out.flush();
        } catch (IOException e) {
            Log.w(TAG, "write " + code + ": " + e);
        }
    }

    private static void closeQuietly(Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (IOException ignored) {
            // 关一条本地回环连接失败没有补救动作，忽略
        }
    }
}
