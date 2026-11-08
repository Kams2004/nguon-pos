package com.nguonpos.edge.keys;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;

/**
 * Raw key in a file readable only by the service's own user. For development
 * and tests: on a real till the key would sit on the same disk as the data,
 * so installers use DPAPI (Windows) or systemd credentials (Ubuntu) instead.
 */
public final class FileMasterKeyProvider implements MasterKeyProvider {

    private final Path file;

    public FileMasterKeyProvider(Path keysDir) {
        this.file = keysDir.resolve("master.key");
    }

    @Override
    public byte[] masterKey() {
        try {
            if (Files.exists(file)) {
                byte[] key = Files.readAllBytes(file);
                if (key.length != 32) throw new IllegalStateException("Corrupt master key file: " + file);
                return key;
            }
            Files.createDirectories(file.getParent());
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            Files.write(file, key);
            restrictToOwner(file);
            return key;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static void restrictToOwner(Path p) throws IOException {
        try {
            Files.setPosixFilePermissions(p, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException ignored) {
            // Windows: ProgramData ACLs are set by the installer.
        }
    }

    @Override
    public String name() {
        return "file";
    }
}
