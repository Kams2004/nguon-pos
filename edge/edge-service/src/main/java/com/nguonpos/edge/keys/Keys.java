package com.nguonpos.edge.keys;

import com.nguonpos.edge.EdgeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;

/** Picks the key provider for this OS and derives purpose-specific keys from the master key. */
public final class Keys {

    private static final Logger log = LoggerFactory.getLogger(Keys.class);

    private Keys() {
    }

    public static MasterKeyProvider provider(EdgeProperties props) {
        var keysDir = props.dataDir().resolve("keys");
        MasterKeyProvider p = switch (props.keyProvider()) {
            case "dpapi" -> new DpapiMasterKeyProvider(keysDir);
            case "systemd-creds" -> new SystemdCredsMasterKeyProvider();
            case "file" -> new FileMasterKeyProvider(keysDir);
            case "auto" -> DpapiMasterKeyProvider.available() ? new DpapiMasterKeyProvider(keysDir)
                    : SystemdCredsMasterKeyProvider.available() ? new SystemdCredsMasterKeyProvider()
                    : new FileMasterKeyProvider(keysDir);
            default -> throw new IllegalArgumentException("edge.key-provider must be auto, dpapi, systemd-creds or file");
        };
        if (p instanceof FileMasterKeyProvider) {
            log.warn("Master key stored in a plain file ({}): fine for development, not for a till", keysDir);
        }
        return p;
    }

    /** HKDF-SHA256 (RFC 5869) with an empty salt: one 32-byte key per purpose. */
    public static byte[] derive(byte[] masterKey, String purpose) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(new byte[32], "HmacSHA256"));
            byte[] prk = mac.doFinal(masterKey);
            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            mac.update(purpose.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 1);
            return mac.doFinal();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
