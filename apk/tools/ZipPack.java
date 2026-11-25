import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * 把 aapt2 link 出来的 base.apk（只有清单 + res）重新打包成完整 APK。
 *
 * 三条规则，每条都有不得不这么做的理由：
 *   1. base.apk 的条目原样搬运，并保留各自的压缩方法 —— resources.arsc 必须保持 stored，
 *      否则 targetSdk >= 30 的机器会拒绝安装（"resources.arsc ... stored uncompressed"）。
 *   2. assets 树逐条以 STORED 写入（真正不压缩）。音频母带与 png 本来就是压缩格式，二次 deflate
 *      只会变大；而且 stored 的 asset 能走 AssetFileDescriptor，Range 请求直接 seek，
 *      不用解压扫字节（AssetServer.serve 里那条快路径）。
 *   3. classes.dex 以 deflate 写入（dex 里字符串多，压得动）。
 *
 * 为什么不用 aapt2 的 -A：aapt2.exe 34.0.0 在中文 Windows 上打不开非 ASCII 文件名的 asset。
 * 实测原始报错：aapt2.exe : ...\assets\www\assets\hero\????.webp: error: failed to open file.
 * 而 assets/hero 下有 400 张按武将中文名命名的立绘（页面就是按这些名字取图，不能改名）。
 *
 * 为什么不用 System.IO.Compression（PowerShell 侧）：.NET Framework 的 CompressionLevel.NoCompression
 * 写出来的其实是"deflate + stored block"，条目方法仍是 8，且每 32KB 多 5 字节块头 —— 不是真的 stored。
 *
 * 用法: java ZipPack <base.apk> <out.apk> <assetsRoot> <assetPrefix> <dexFile>
 */
public final class ZipPack {

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            System.err.println("用法: ZipPack <base.apk> <out.apk> <assetsRoot> <assetPrefix> <dexFile>");
            System.exit(2);
        }
        final Path base = Paths.get(args[0]);
        final Path out = Paths.get(args[1]);
        final Path assetsRoot = Paths.get(args[2]).toAbsolutePath().normalize();
        final String prefix = args[3].replace('\\', '/').replaceAll("/+$", "");
        final Path dex = Paths.get(args[4]);

        if (!Files.isRegularFile(base))   { throw new IOException("找不到 base.apk: " + base); }
        if (!Files.isDirectory(assetsRoot)) { throw new IOException("找不到 assets 目录: " + assetsRoot); }
        if (!Files.isRegularFile(dex))    { throw new IOException("找不到 classes.dex: " + dex); }

        final String rootPath = assetsRoot.toString();
        final Set<String> written = new HashSet<String>();
        int baseCount = 0;
        int assetCount = 0;
        long assetBytes = 0L;

        Files.deleteIfExists(out);
        try (ZipFile zin = new ZipFile(base.toFile());
             ZipOutputStream zout = new ZipOutputStream(Files.newOutputStream(out))) {
            zout.setLevel(Deflater.BEST_SPEED);

            // 1) base.apk：清单 / res / resources.arsc，保留原压缩方法
            final List<? extends ZipEntry> src = Collections.list(zin.entries());
            for (ZipEntry e : src) {
                if (e.isDirectory()) { continue; }
                final byte[] data = readAll(zin.getInputStream(e));
                final ZipEntry ne = new ZipEntry(e.getName());
                ne.setTime(e.getTime());
                if (e.getMethod() == ZipEntry.STORED) {
                    writeStored(zout, ne, data);
                } else {
                    zout.putNextEntry(ne);
                    zout.write(data);
                    zout.closeEntry();
                }
                written.add(e.getName());
                baseCount++;
            }

            // 2) assets\www：全部 STORED
            final List<Path> files = new ArrayList<Path>();
            for (Path p : (Iterable<Path>) Files.walk(assetsRoot)::iterator) {
                if (Files.isRegularFile(p)) { files.add(p); }
            }
            Collections.sort(files, (a, b) -> a.toString().compareTo(b.toString()));
            for (Path p : files) {
                String rel = p.toString().substring(rootPath.length()).replace('\\', '/');
                while (rel.startsWith("/")) { rel = rel.substring(1); }
                final String name = prefix + "/" + rel;
                if (written.contains(name)) { continue; }
                final byte[] data = Files.readAllBytes(p);
                final ZipEntry ne = new ZipEntry(name);
                ne.setTime(Files.getLastModifiedTime(p).toMillis());
                writeStored(zout, ne, data);
                written.add(name);
                assetCount++;
                assetBytes += data.length;
            }

            // 3) classes.dex：deflate
            final byte[] dexBytes = Files.readAllBytes(dex);
            final ZipEntry de = new ZipEntry(dex.getFileName().toString());
            de.setTime(Files.getLastModifiedTime(dex).toMillis());
            zout.putNextEntry(de);
            zout.write(dexBytes);
            zout.closeEntry();
        }

        final long total = Files.size(out);
        // 输出全用 ASCII：Java 在中文 Windows 上按 GBK 写 stdout，而构建脚本把控制台当 UTF-8 解，
        // 中文会变成乱码（工具输出不是给人读的正文，没必要为它调编码）。
        System.out.println(String.format(Locale.US, "  base entries : %d (original compression kept)", baseCount));
        System.out.println(String.format(Locale.US, "  assets       : %d files / %,d B (STORED, not compressed)", assetCount, assetBytes));
        System.out.println(String.format(Locale.US, "  classes.dex  : %,d B (deflate)", Files.size(dex)));
        System.out.println(String.format(Locale.US, "  packed.apk   : %,d B = %.2f MB", total, total / 1e6));
    }

    /** 以 STORED（method=0）写入一条entry：必须先把 size / compressedSize / CRC32 都告诉 zip。 */
    private static void writeStored(ZipOutputStream zout, ZipEntry entry, byte[] data) throws IOException {
        final CRC32 crc = new CRC32();
        crc.update(data);
        entry.setMethod(ZipEntry.STORED);
        entry.setSize(data.length);
        entry.setCompressedSize(data.length);
        entry.setCrc(crc.getValue());
        zout.putNextEntry(entry);
        zout.write(data);
        zout.closeEntry();
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream src = in) {
            final ByteArrayOutputStream buf = new ByteArrayOutputStream(1 << 16);
            final byte[] chunk = new byte[1 << 16];
            int n;
            while ((n = src.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
            }
            return buf.toByteArray();
        }
    }

    private ZipPack() {
    }
}
