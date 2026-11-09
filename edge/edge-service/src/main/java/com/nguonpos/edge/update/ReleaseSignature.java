package com.nguonpos.edge.update;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Checks that an installer was signed with the Nguon POS release key
 * (Ed25519). The public key is built into the till; the private key never
 * leaves the release manager's machine (deploy/release/publish-release.sh).
 *
 * Signed message: {@code nguon-pos|<version>|<platform>|<sha256 hex>} — so
 * a signature can't be replayed for another version or OS.
 */
@Component
public class ReleaseSignature {

    private final PublicKey key;

    public ReleaseSignature(@Value("${edge.release-public-key-file:}") String keyFile) throws IOException, GeneralSecurityException {
        String pem;
        if (keyFile != null && !keyFile.isBlank()) {
            pem = Files.readString(Path.of(keyFile), StandardCharsets.US_ASCII);
        } else {
            try (InputStream in = new ClassPathResource("release/release-signing.pub").getInputStream()) {
                pem = new String(in.readAllBytes(), StandardCharsets.US_ASCII);
            }
        }
        String b64 = pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        this.key = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(b64)));
    }

    public static byte[] message(String version, String platform, String sha256Hex) {
        return ("nguon-pos|" + version + "|" + platform + "|" + sha256Hex).getBytes(StandardCharsets.UTF_8);
    }

    public boolean verify(String version, String platform, String sha256Hex, String signatureB64) {
        try {
            Signature s = Signature.getInstance("Ed25519");
            s.initVerify(key);
            s.update(message(version, platform, sha256Hex));
            return s.verify(Base64.getDecoder().decode(signatureB64));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
    }
}
