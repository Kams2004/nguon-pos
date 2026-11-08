package com.nguonpos.edge.keys;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

/**
 * Ubuntu: the installer creates the key once with
 * {@code systemd-creds encrypt --with-key=auto} (sealed to the TPM when the
 * till has one) and the unit loads it with {@code LoadCredentialEncrypted=master:…}.
 * systemd decrypts it into a private, in-memory directory for this service
 * only, named by $CREDENTIALS_DIRECTORY.
 */
public final class SystemdCredsMasterKeyProvider implements MasterKeyProvider {

    public static boolean available() {
        String dir = System.getenv("CREDENTIALS_DIRECTORY");
        return dir != null && Files.isReadable(Path.of(dir, "master"));
    }

    @Override
    public byte[] masterKey() {
        String dir = System.getenv("CREDENTIALS_DIRECTORY");
        if (dir == null) throw new IllegalStateException("CREDENTIALS_DIRECTORY is not set: start the service through its systemd unit");
        try {
            byte[] raw = Files.readAllBytes(Path.of(dir, "master"));
            byte[] key = raw.length == 32 ? raw : Base64.getDecoder().decode(new String(raw).strip());
            if (key.length != 32) throw new IllegalStateException("The systemd credential 'master' must hold 32 bytes");
            return key;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public String name() {
        return "systemd-creds";
    }
}
