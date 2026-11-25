package com.sanguo.webview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 唯一的 Activity。
 *
 * <p>1.1 版换掉了「起本地 HTTP 服务器」那一套：现在用 {@link AssetHandler} 在
 * {@code WebViewClient.shouldInterceptRequest} 里直接读 {@code assets/www}，页面源是虚拟域名
 * {@code https://appassets.androidplatform.net/}（Google {@code WebViewAssetLoader} 同款）。
 * 没有 ServerSocket、没有随机端口、不用 {@code openFd()}，origin 固定（存档不再每次启动都换 origin）。
 *
 * <p>1.1 版同时把「为什么起不来」变成可见信息，因为在模拟器上黑屏时玩家什么也拿不到：
 * <ul>
 *   <li>{@code Thread.setDefaultUncaughtExceptionHandler} → 写 {@code getFilesDir()/crash.log}，
 *       当次全屏显示堆栈前 15 行；主线程崩溃时那一帧常常来不及刷，所以<b>下一次启动</b>会先把
 *       crash.log 摆出来再继续；</li>
 *   <li>{@code onCreate} 全程 try/catch → 显示「启动失败：异常类名：message」；</li>
 *   <li>{@code onReceivedError} / {@code onReceivedHttpError} → 主页面失败全屏显示 url + 错误码，
 *       子资源失败只在底部闪一条 12 秒的横幅（不遮游戏）；</li>
 *   <li>WebView 内核低于 Chromium 89 且本来装的是完整游戏时，直接说明「页面语法跑不了」，
 *       而不是让人对着黑屏猜（依据见 {@link #MIN_CHROME}）。</li>
 * </ul>
 *
 * <p>所有日志 TAG 固定 {@code SanguoShell}：{@code adb logcat -s SanguoShell}。
 */
public final class MainActivity extends Activity {

    /** 固定 TAG：报告里给玩家的抓日志命令就是靠它过滤。 */
    private static final String TAG = "SanguoShell";
    /** 入口页：带 rel=1 进发布形态（除错列/探针/__sanguo 都不出现），见 game/web/release.js。 */
    private static final String ENTRY = "/campaign.html?rel=1";
    /** WebView 的 UA 尾巴：release.js 认这个标记（/SanguoShell/ 正则，不卡版本号）。 */
    private static final String UA_TAG = "SanguoShell/1.3";
    /** 崩溃日志文件名，落在 {@code getFilesDir()} 下。 */
    private static final String CRASH_FILE = "crash.log";

    /**
     * 页面要求的最低 WebView 内核版本。
     *
     * <p>为什么是 89：{@code campaign.html} 的 216 KB 内联 {@code <script type="module">}（5371 行）
     * 里有 143 处 {@code ?.}、22 处 {@code ??}，还 import 了同样用 {@code ?.} 的
     * saves/city_model/ai_model/monarch_model（合计 282 处）；{@code main.js} 还有 2 处顶层 await。
     * 语法级别分别是：ES module 61+、{@code ?.}/{@code ??} 80+、顶层 await 89+。
     * 老内核遇到这些是 <b>解析期 SyntaxError</b>——一行 JS 都不执行、没有任何 Java 异常、
     * 页面侧连 error 事件都没有，玩家看到的就是「点了没反应」。
     */
    private static final int MIN_CHROME = 89;

    /**
     * 旧方案开关：{@code true} 时退回 1.0 的 ServerSocket 取数（{@link AssetServer}，已弃用，仅作对照）。
     * 留着它是因为「虚拟域名在某个 ROM 上不工作」这种极端情况下，能一个常量切回去做 A/B。
     */
    private static final boolean USE_SOCKET_SERVER = false;

    private WebView web;
    /** 仅 {@link #USE_SOCKET_SERVER} 时才会被创建。 */
    private AssetServer server;
    private AssetHandler handler;
    private FrameLayout root;
    private TextView banner;
    private final Runnable hideBanner = new Runnable() {
        @Override
        public void run() {
            if (banner != null) banner.setVisibility(View.GONE);
        }
    };
    /** true = 当前屏幕是一整块文字（启动失败/加载失败/内核太旧/上次崩溃），返回键直接退出。 */
    private boolean blocking;
    /** 已经点开过一次「上次崩溃」的画面就不再重复弹。 */
    private boolean crashReplayDone;

    // ================================================================== 启动

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 第一件事就装崩溃兜底：连 super.onCreate 抛异常也要留下痕迹
        installCrashHandler();
        super.onCreate(savedInstanceState);
        Log.i(TAG, "onCreate: sdk=" + Build.VERSION.SDK_INT
                + " device=" + Build.MANUFACTURER + " " + Build.MODEL
                + " pkg=" + getPackageName());
        try {
            boot();
        } catch (Throwable t) {
            Log.e(TAG, "boot() 抛出未捕获异常", t);
            fatal("启动失败：" + t.getClass().getName() + "：" + t.getMessage(), t);
        }
    }

    private void boot() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        // 全屏必须放在 setContentView 之后。API 30+ 的 Window.getInsetsController() 内部要摸
        // decor view：窗口还没 attach（decor 未建）时，PhoneWindow.getInsetsController 里会抛
        // NullPointerException —— MuMu 模拟器上已实测复现（见 crash.log / 206 报告），
        // 1.0 和 1.1 的「点了没反应/闪退」就是这一行，跟 WebView 内核无关。
        goFullscreen();
        handler = new AssetHandler(getAssets());

        String prev = readPreviousCrash();
        if (prev != null) {
            Log.w(TAG, "发现上次崩溃记录，先显示再继续");
            showScreen("上次启动崩溃了",
                    prev + "\n\n崩溃日志：" + crashPath() + "\n\n点屏幕继续启动（按返回键退出）",
                    new Runnable() {
                        @Override
                        public void run() {
                            crashReplayDone = true;
                            deleteCrashLog();
                            createAndLoad();
                        }
                    });
            return;
        }
        createAndLoad();
    }

    /** 建 WebView（只建一次）→ 内核版本门控 → 加载页面。 */
    private void createAndLoad() {
        if (web == null) buildWebView();
        setContentView(root);
        blocking = false;

        String ua = web.getSettings().getUserAgentString();
        int chrome = chromeMajor(ua);
        Log.i(TAG, "WebView chromium=" + chrome + " ua=" + ua);
        if (chrome > 0 && chrome < MIN_CHROME && gameIsBundled()) {
            showScreen("WebView 内核太旧，页面跑不起来",
                    "本机 WebView 内核：Chromium " + chrome + "\n"
                            + "游戏页面要求：Chromium " + MIN_CHROME + " 以上\n\n"
                            + "这不是安装包坏了，是安卓系统自带的 WebView 太旧：\n"
                            + "  · 模拟器 AOSP 镜像的 WebView 不会自动更新——\n"
                            + "    API 30 是 83、API 29 是 74、API 28 是 66、API 26 是 58、API 24 是 51，全部低于 89；\n"
                            + "    请用 API 31+（Android 12 以上）的镜像，或用带 Play 商店的镜像把\n"
                            + "    「Android System WebView」更新到 89 以上。\n"
                            + "  · 真机上打开 Play 商店更新 WebView 即可。\n\n"
                            + "想自己验证壳没问题：装同目录的 sanguo-smoke.apk（它只用 ES5，任何内核都能跑）。\n\n"
                            + "点屏幕仍然尝试加载（会出现黑屏，属正常）。",
                    new Runnable() {
                        @Override
                        public void run() {
                            loadPage();
                        }
                    });
            return;
        }
        loadPage();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebView() {
        Log.i(TAG, "创建 WebView");
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        // 不强制 LAYER_TYPE_HARDWARE：WebView 本来就是硬件合成，多包一层软件/硬件 Layer 在老模拟器
        // 上出现过整块黑屏；默认（NONE）最稳。
        web.setLayerType(View.LAYER_TYPE_NONE, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // 音效/BGM 由游戏自己在点击后播，但 WebView 默认要求「用户手势」才允许出声：
        // 关掉它，campaign 开场的 BGM 才能自动起（SG.audio 另有 unlock 兜底）。
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadsImagesAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        // 素材就在 APK 里（拦截层拿），别让 WebView 缓存出陈旧页
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        String ua = s.getUserAgentString();
        if (ua != null && !ua.contains("SanguoShell")) s.setUserAgentString(ua + " " + UA_TAG);

        // 桌面 Chrome 打开 chrome://inspect 就能直接调这个 WebView（模拟器上没 logcat 也能看 console）
        try {
            WebView.setWebContentsDebuggingEnabled(true);
        } catch (Throwable t) {
            Log.w(TAG, "setWebContentsDebuggingEnabled 失败：" + t);
        }

        // API 26 才有的 onRenderProcessGone 单独放在子类里：主线程 24/25 的机器上不能被加载到，
        // 否则类校验会碰到不存在的 android.webkit.RenderProcessGoneDetail。
        WebViewClient client = (Build.VERSION.SDK_INT >= 26) ? new Client26() : new Client();
        web.setWebViewClient(client);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Log.i(TAG, "WebView 就绪");
    }

    private void loadPage() {
        setContentView(root);
        blocking = false;
        String url;
        if (USE_SOCKET_SERVER) {
            // —— 已弃用，仅作对照：1.0 的 127.0.0.1 + ServerSocket 方案 ——
            try {
                server = new AssetServer(getAssets());
                url = "http://127.0.0.1:" + server.start() + ENTRY;
            } catch (Throwable t) {
                Log.e(TAG, "AssetServer 启动失败", t);
                fatal("启动失败：" + t.getClass().getName() + "：" + t.getMessage(), t);
                return;
            }
        } else {
            url = AssetHandler.ORIGIN + ENTRY.substring(1);
        }
        Log.i(TAG, "loadUrl " + url);
        try {
            web.loadUrl(url);
        } catch (Throwable t) {
            Log.e(TAG, "loadUrl 抛出异常", t);
            fatal("启动失败：" + t.getClass().getName() + "：" + t.getMessage(), t);
        }
    }

    // ================================================================== WebViewClient

    private class Client extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(Uri.parse(url));
        }

        /** 取数主路径：assets → 直接应答，不走网络、不走端口。 */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                Uri uri = request.getUrl();
                String url = uri == null ? "" : uri.toString();
                if (!handler.owns(url)) {
                    Log.w(TAG, "不拦截非站内请求：" + url);
                    return null;
                }
                return handler.handle(request.getMethod(), uri.getEncodedPath(),
                        headerIgnoreCase(request.getRequestHeaders(), "Range"));
            } catch (Throwable t) {
                Log.e(TAG, "拦截请求失败", t);
                return handler.error(500, "500 拦截失败：" + t.getClass().getName() + "：" + t.getMessage());
            }
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            Log.i(TAG, "page started: " + url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.i(TAG, "page finished: " + url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            onLoadError(request != null && request.isForMainFrame(),
                    String.valueOf(request == null ? null : request.getUrl()),
                    error == null ? -1 : error.getErrorCode(),
                    String.valueOf(error == null ? null : error.getDescription()));
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            onLoadError(true, failingUrl, errorCode, description);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                        WebResourceResponse errorResponse) {
            onLoadError(request != null && request.isForMainFrame(),
                    String.valueOf(request == null ? null : request.getUrl()),
                    errorResponse == null ? -1 : errorResponse.getStatusCode(),
                    errorResponse == null ? null : String.valueOf(errorResponse.getReasonPhrase()));
        }
    }

    /** 只在 API 26+ 被实例化，所以 {@link RenderProcessGoneDetail} 不会在老机器上被解析。 */
    private final class Client26 extends Client {
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            boolean crashed = detail == null || detail.didCrash();
            Log.e(TAG, "渲染进程没了：didCrash=" + crashed + " exitStatus="
                    + (detail == null ? "?" : String.valueOf(detail.rendererPriorityAtExit())));
            showScreen("WebView 渲染进程崩了",
                    "didCrash=" + crashed + "\n\n这通常是显存/内存不够（模拟器常见）：\n"
                            + "  · 调大模拟器内存（AVD 设置里 RAM ≥ 2 GB、heap ≥ 512 MB）；\n"
                            + "  · 或把模拟器图形改成 SwiftShader 软件渲染。\n\n"
                            + "点屏幕重新加载。",
                    new Runnable() {
                        @Override
                        public void run() {
                            recreateWebView();
                        }
                    });
            return true; // 我们自己处理，别让系统再杀一次
        }
    }

    private void recreateWebView() {
        try {
            if (web != null) {
                root.removeView(web);
                web.destroy();
                web = null;
            }
        } catch (Throwable t) {
            Log.w(TAG, "销毁旧 WebView 失败：" + t);
        }
        createAndLoad();
    }

    // ================================================================== 导航

    /** 外部链接落地：能开就开，开不了只记一行日志，绝不因此崩掉游戏。 */
    private boolean route(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            // 站内：虚拟域名（以及旧版的 127.0.0.1/localhost）交给壳自己，多页应用靠它跳转
            if (AssetHandler.HOST.equalsIgnoreCase(host) || "127.0.0.1".equals(host)
                    || "localhost".equals(host)) {
                return false;
            }
            openExternal(uri);
            return true;
        }
        if ("file".equals(scheme) || "about".equals(scheme) || "data".equals(scheme)
                || "blob".equals(scheme) || "javascript".equals(scheme)) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "没有能打开 " + uri + " 的应用：" + e);
        }
    }

    // ================================================================== 诊断面

    /** 主页面出错：全屏说清楚 url + 错误码；子资源出错：底部横幅 12 秒。 */
    private void onLoadError(boolean mainFrame, String url, int code, String desc) {
        Log.w(TAG, (mainFrame ? "主页面" : "子资源") + "加载失败 code=" + code
                + " url=" + url + " desc=" + desc);
        if (mainFrame) {
            showScreen("页面加载失败",
                    "url：" + url + "\n错误码：" + code + "\n说明：" + desc + "\n\n"
                            + "错误码含义（WebViewClient.ERROR_*）：\n"
                            + "  · -2 HOST_LOOKUP / -6 CONNECT / -7 TIMEOUT：取数没通\n"
                            + "  · -1 UNKNOWN / -16 之类：看下面的日志\n\n"
                            + "抓日志：adb logcat -s SanguoShell\n"
                            + "崩溃日志：" + crashPath() + "\n\n点屏幕重新加载",
                    new Runnable() {
                        @Override
                        public void run() {
                            if (web != null) web.reload();
                        }
                    });
        } else {
            // /favicon.ico 是 Chromium 自己会来要的，assets 里没有、缺了也不影响任何功能；
            // 为它弹红条只会误导用户（1.2 真机截图底部那条 404 就是它），所以静默忽略。
            if (url != null && url.endsWith("/favicon.ico")) {
                return;
            }
            String shortUrl = url == null ? "" : url.replace(AssetHandler.ORIGIN, "/");
            banner("子资源失败 " + code + "：" + shortUrl);
        }
    }

    private void banner(String msg) {
        if (root == null) return;
        if (banner == null) {
            banner = new TextView(this);
            banner.setBackgroundColor(0xE6201008);
            banner.setTextColor(0xFFFFD9A0);
            banner.setTextSize(12f);
            banner.setPadding(16, 8, 16, 8);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.gravity = Gravity.BOTTOM;
            root.addView(banner, lp);
        }
        banner.setText(msg);
        banner.setVisibility(View.VISIBLE);
        banner.removeCallbacks(hideBanner);
        banner.postDelayed(hideBanner, 12000);
    }

    /** 全屏文字面：黑底米色字、可选中复制。onTap 为 null 表示点了不做事（返回键退出）。 */
    private void showScreen(String title, String body, final Runnable onTap) {
        blocking = true;
        TextView tv = new TextView(this);
        tv.setBackgroundColor(Color.BLACK);
        tv.setTextColor(0xFFE8DCC0);
        tv.setTextSize(15f);
        tv.setPadding(40, 120, 40, 48);
        tv.setGravity(Gravity.TOP | Gravity.START);
        tv.setTextIsSelectable(true);
        tv.setText(title + "\n\n" + body);
        if (onTap != null) {
            tv.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    onTap.run();
                }
            });
        }
        setContentView(tv);
        Log.e(TAG, "界面: " + title);
    }

    private void fatal(String msg, Throwable t) {
        String stack = t == null ? "" : Log.getStackTraceString(t);
        String path = "";
        try {
            // 走到这里说明壳在 onCreate 就挂了：必须落盘。否则界面上印的路径其实不存在，
            // 用户回头 adb shell run-as ... cat files/crash.log 会扑空。
            path = writeCrashLog(Thread.currentThread(), stack);
        } catch (Throwable ignored) {
        }
        showScreen("SanguoShell 起不来",
                msg + "\n\n" + head15(stack)
                        + "\n\n崩溃日志：" + (path != null && path.length() > 0 ? path : crashPath())
                        + "\n抓日志：adb logcat -s SanguoShell"
                        + "\n按返回键退出。",
                null);
    }

    private static String head15(String stack) {
        if (stack == null) return "";
        String[] lines = stack.split("\n");
        StringBuilder sb = new StringBuilder();
        int n = Math.min(lines.length, 15);
        for (int i = 0; i < n; i++) {
            sb.append(lines[i]).append('\n');
        }
        if (lines.length > n) sb.append("…（共 ").append(lines.length).append(" 行，完整见 crash.log）");
        return sb.toString();
    }

    // ================================================================== 崩溃日志

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                String stack = Log.getStackTraceString(e) + "\n" + Log.getStackTraceString(null);
                try {
                    Log.e(TAG, "FATAL on " + t.getName(), e);
                } catch (Throwable ignored) {
                }
                String path = writeCrashLog(t, stack);
                try {
                    String text = t.getName() + "：" + e.getClass().getName() + "：" + e.getMessage()
                            + "\n\n" + head15(stack) + "\n\n已写入：" + path;
                    if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
                        // 主线程崩溃时这一帧多半来不及刷（紧接着进程就没了），真正的兜底是
                        // 「下次启动先显示 crash.log」；这里该设还是设，很多机型能闪出来。
                        showScreen("SanguoShell 崩溃", text, null);
                    } else {
                        final String txt = text;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                showScreen("SanguoShell 崩溃", txt, null);
                            }
                        });
                        // 后台线程崩溃时主线程还活着，睡一会儿让它把字画出来
                        try {
                            Thread.sleep(2500);
                        } catch (InterruptedException ignored) {
                        }
                    }
                } catch (Throwable ignored) {
                }
                if (prev != null) {
                    prev.uncaughtException(t, e);
                } else {
                    Process.killProcess(Process.myPid());
                }
            }
        });
    }

    private String crashPath() {
        return new File(getFilesDir(), CRASH_FILE).getAbsolutePath();
    }

    private String writeCrashLog(Thread t, String stack) {
        File f = new File(getFilesDir(), CRASH_FILE);
        String ts = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
        try {
            boolean append = !(f.isFile() && f.length() > 64 * 1024); // 超过 64 KB 就重写，别无限长
            FileOutputStream out = new FileOutputStream(f, append);
            try {
                PrintWriter w = new PrintWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
                w.println("=== " + ts + " pid=" + Process.myPid() + " sdk=" + Build.VERSION.SDK_INT
                        + " " + Build.MANUFACTURER + " " + Build.MODEL + " thread=" + t.getName() + " ===");
                w.println(stack);
                w.flush();
            } finally {
                out.close();
            }
            return f.getAbsolutePath();
        } catch (Throwable e) {
            return "（写不进 " + f.getAbsolutePath() + "：" + e + "）";
        }
    }

    private void deleteCrashLog() {
        try {
            File f = new File(getFilesDir(), CRASH_FILE);
            if (f.isFile()) {
                boolean ok = f.delete();
                Log.i(TAG, "crash.log 已清理=" + ok);
            }
        } catch (Throwable ignored) {
        }
    }

    /** 上次崩溃留下的日志（取最后一段的前 15 行）；没有就 null。 */
    private String readPreviousCrash() {
        if (crashReplayDone) return null;
        File f = new File(getFilesDir(), CRASH_FILE);
        try {
            if (!f.isFile() || f.length() == 0) return null;
            int len = (int) Math.min(f.length(), 65536L);
            byte[] buf = new byte[len];
            InputStream in = new FileInputStream(f);
            try {
                int off = 0;
                while (off < len) {
                    int n = in.read(buf, off, len - off);
                    if (n <= 0) break;
                    off += n;
                }
            } finally {
                in.close();
            }
            String all = new String(buf, StandardCharsets.UTF_8);
            int at = all.lastIndexOf("=== ");
            String block = at >= 0 ? all.substring(at) : all;
            return head15(block);
        } catch (Throwable t) {
            Log.w(TAG, "读 crash.log 失败：" + t);
            return null;
        }
    }

    // ================================================================== 小工具

    /** UA 里的 {@code Chrome/123.0.0.0} → 123；拿不到就 0（0 = 不做版本判断）。 */
    private static int chromeMajor(String ua) {
        if (ua == null) return 0;
        Matcher m = Pattern.compile("Chrome/(\\d+)").matcher(ua);
        if (!m.find()) return 0;
        try {
            return Integer.parseInt(m.group(1));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** assets 里有没有完整游戏（烟雾包没有）。用来决定要不要因为内核太旧而拦下。 */
    private boolean gameIsBundled() {
        try {
            getAssets().open("www/dist/core/battle.js").close();
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    /** 请求头名大小写不定，按名字不敏感地取值。 */
    private static String headerIgnoreCase(Map<String, String> headers, String name) {
        if (headers == null || headers.isEmpty()) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    // ================================================================== 生命周期

    @Override
    protected void onResume() {
        super.onResume();
        goFullscreen();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            // 先停音频再 onPause：否则 <audio>/WebAudio 会在后台继续响
            web.evaluateJavascript(
                    "(function(){try{var a=window.SG&&SG.audio;a&&a.stop&&a.stop();}catch(e){}})()", null);
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.loadUrl("about:blank");
            web.stopLoading();
            web.destroy();
            web = null;
        }
        if (server != null) {
            server.stop();
            server = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (blocking) {
            finish();
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullscreen();
    }

    /**
     * 沉浸式全屏。
     *
     * <p>API 30+ 走 WindowInsetsController；但 {@code getWindow().getInsetsController()} 在窗口
     * 还没 attach（decor 未建）时会抛 NPE —— 抛点在 PhoneWindow.getInsetsController 内部，
     * 外面 {@code getWindow()} 不为 null，所以只能靠 try/catch 兜住，然后整段回落到旧式
     * setSystemUiVisibility（API 30 上该 API 虽然标记 deprecated，但照样生效）。
     */
    private void goFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    return;
                }
                Log.i(TAG, "getInsetsController() 返回 null，回落 setSystemUiVisibility");
            } catch (Throwable t) {
                Log.w(TAG, "getInsetsController() 不可用（窗口未 attach？），回落 setSystemUiVisibility", t);
            }
        }
        try {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } catch (Throwable t) {
            // 全屏失败不是致命问题，绝不能让 Activity 起不来
            Log.w(TAG, "setSystemUiVisibility 也失败，放弃全屏", t);
        }
    }
}
