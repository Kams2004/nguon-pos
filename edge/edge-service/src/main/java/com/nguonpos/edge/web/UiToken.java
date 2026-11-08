package com.nguonpos.edge.web;

import com.nguonpos.edge.EdgeProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Shared secret between this service and the desktop app installed on the
 * same machine: the app reads the file, every local API call carries it.
 * A web page open in a browser on the till can't read it, so it can't drive
 * the till's API even though both run on 127.0.0.1.
 */
@Component
public class UiToken {

    private final String token;

    public UiToken(EdgeProperties props) {
        Path file = props.dataDir().resolve("ui-token");
        try {
            if (!Files.exists(file)) {
                Files.createDirectories(file.getParent());
                byte[] b = new byte[32];
                new SecureRandom().nextBytes(b);
                Files.writeString(file, Base64.getUrlEncoder().withoutPadding().encodeToString(b));
                try {
                    // Readable by the till's users group (set by the installer), not by everyone.
                    Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-r-----"));
                } catch (UnsupportedOperationException ignored) {
                    // Windows: ProgramData ACLs come from the installer.
                }
            }
            this.token = Files.readString(file).strip();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public boolean matches(String presented) {
        return presented != null && MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
    }
}
