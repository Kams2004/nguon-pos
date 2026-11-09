package com.nguonpos.edge.update;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Ubuntu: the local server runs as the unprivileged "nguon-edge" user, so
 * it only leaves a request file; the root unit nguon-updater.path notices it
 * and nguon-updater checks the signature again before installing the .deb.
 *
 * Windows: the service runs as SYSTEM; it registers a one-off SYSTEM task
 * that runs the installer silently. A task, not a child process, because
 * the installer stops this very service while it works.
 */
@Component
public class PlatformInstaller implements Installer {

    private static final Logger log = LoggerFactory.getLogger(PlatformInstaller.class);

    @Override
    public String fileName(String version) {
        return AppVersion.WINDOWS_NSIS.equals(AppVersion.platform())
                ? "nguon-pos_" + version + "_x64-setup.exe"
                : "nguon-pos_" + version + "_amd64.deb";
    }

    @Override
    public void install(Path file, String version, String sha256, String signature) throws IOException {
        String platform = AppVersion.platform();
        if (AppVersion.LINUX_DEB.equals(platform)) {
            Path tmp = file.resolveSibling("ready.tmp");
            Files.writeString(tmp, "file=" + file.getFileName() + "\nversion=" + version + "\nsha256=" + sha256 + "\nsignature=" + signature + "\n",
                    StandardCharsets.US_ASCII);
            Files.move(tmp, file.resolveSibling("ready"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } else if (AppVersion.WINDOWS_NSIS.equals(platform)) {
            run(List.of("schtasks", "/Create", "/F", "/TN", "NguonPOS\\Update", "/SC", "ONCE", "/ST", "23:59", "/RU", "SYSTEM", "/RL", "HIGHEST",
                    "/TR", "\"" + file.toAbsolutePath() + "\" /S"));
            run(List.of("schtasks", "/Run", "/TN", "NguonPOS\\Update"));
        } else {
            throw new IOException("This system can't install updates by itself");
        }
    }

    private static void run(List<String> cmd) throws IOException {
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        try {
            if (!p.waitFor(60, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException(cmd.get(0) + " timed out");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).strip();
        if (p.exitValue() != 0) throw new IOException(cmd.get(0) + " failed: " + out);
        log.info("{}: {}", String.join(" ", cmd.subList(0, 2)), out);
    }
}
