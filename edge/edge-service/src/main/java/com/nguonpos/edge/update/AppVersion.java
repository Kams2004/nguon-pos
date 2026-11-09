package com.nguonpos.edge.update;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * The installed desktop version: the build writes a VERSION file next to
 * the service's jar (desktop/scripts/build-edge.sh), so the app, the local
 * server and the installer always agree. "dev" when run from source.
 */
public final class AppVersion {

    public static final String LINUX_DEB = "linux-deb";
    public static final String WINDOWS_NSIS = "windows-nsis";

    private static final String CURRENT = read();

    private AppVersion() {
    }

    public static String current() {
        return CURRENT;
    }

    /** Which installer this machine takes, or null when it cannot update itself. */
    public static String platform() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.startsWith("windows")) return WINDOWS_NSIS;
        if (os.contains("linux") && Files.isExecutable(Path.of("/usr/bin/dpkg"))) return LINUX_DEB;
        return null;
    }

    public static String os() {
        return System.getProperty("os.name") + " " + System.getProperty("os.version");
    }

    private static String read() {
        String override = System.getenv("EDGE_APP_VERSION");
        if (override != null && !override.isBlank()) return override.strip();
        try {
            String cp = System.getProperty("java.class.path", "");
            if (cp.endsWith(".jar") && !cp.contains(java.io.File.pathSeparator)) {
                Path file = Path.of(cp).toAbsolutePath().resolveSibling("VERSION");
                if (Files.isRegularFile(file)) {
                    String v = Files.readString(file, StandardCharsets.UTF_8).strip();
                    if (Semver.valid(v)) return v;
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // fall through
        }
        return "dev";
    }
}
