package com.nguonpos.edge.keys;

import com.sun.jna.platform.win32.Crypt32Util;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;

/**
 * Windows: the key is stored encrypted with DPAPI under the service's own
 * account (NT SERVICE\NguonEdge), so only that service on this machine can
 * decrypt it — not other users, not a copy of the disk on another machine.
 */
public final class DpapiMasterKeyProvider implements MasterKeyProvider {

    private final Path file;

    public DpapiMasterKeyProvider(Path keysDir) {
        this.file = keysDir.resolve("master.dpapi");
    }

    public static boolean available() {
        return System.getProperty("os.name", "").toLowerCase().startsWith("windows");
    }

    @Override
    public byte[] masterKey() {
        try {
            if (Files.exists(file)) {
                return Crypt32Util.cryptUnprotectData(Files.readAllBytes(file));
            }
            Files.createDirectories(file.getParent());
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            Files.write(file, Crypt32Util.cryptProtectData(key));
            return key;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public String name() {
        return "dpapi";
    }
}
