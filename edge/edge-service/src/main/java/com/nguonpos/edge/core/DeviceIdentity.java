package com.nguonpos.edge.core;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.UUID;

/**
 * Who this till is: a device id (also its terminal id at central) and an
 * EC P-256 key generated on first start. Every record it writes is signed
 * with that key, so records relayed by other tills can't be forged.
 * The private key lives only in the encrypted database.
 */
@Component
public class DeviceIdentity {

    private final UUID deviceId;
    private final PrivateKey privateKey;
    private final String publicKey;

    public DeviceIdentity(Meta meta, TransactionTemplate tx) {
        String[] loaded = tx.execute(s -> {
            if (meta.get("device_id").isEmpty()) {
                KeyPair kp = generate();
                meta.put("device_id", UUID.randomUUID().toString());
                meta.put("device_private_key", Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded()));
                meta.put("device_public_key", Base64.getEncoder().encodeToString(kp.getPublic().getEncoded()));
            }
            return new String[]{meta.get("device_id").orElseThrow(), meta.get("device_private_key").orElseThrow(),
                    meta.get("device_public_key").orElseThrow()};
        });
        this.deviceId = UUID.fromString(loaded[0]);
        this.privateKey = decodePrivate(loaded[1]);
        this.publicKey = loaded[2];
    }

    public UUID deviceId() {
        return deviceId;
    }

    /** Base64 X.509 SubjectPublicKeyInfo — sent at enrollment so others can verify this till's records. */
    public String publicKey() {
        return publicKey;
    }

    /** Short code shown to people ("caisse 3F2A"). */
    public String shortCode() {
        return deviceId.toString().substring(0, 4).toUpperCase();
    }

    /** The device key pair — also the TLS key of its certificate once enrolled. */
    public KeyPair keyPair() {
        try {
            var pub = KeyFactory.getInstance("EC").generatePublic(new java.security.spec.X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)));
            return new KeyPair(pub, privateKey);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public String sign(byte[] data) {
        try {
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initSign(privateKey);
            s.update(data);
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static KeyPair generate() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            return g.generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static PrivateKey decodePrivate(String b64) {
        try {
            return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(b64)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Device key unreadable", e);
        }
    }
}
