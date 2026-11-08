package com.nguonpos.synccore.qr;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

/**
 * Ticket QR signing and verification — the Java twin of
 * frontend/pos-pwa/src/lib/qr/ticketSignature.ts. Both must agree on every
 * case in docs/test-vectors/qr-v1.json.
 *
 * QR string: {@code base64url(payloadJson) + "." + base64url(HMAC-SHA256(key, ascii(payloadB64)))},
 * with the gate's signing secret (hex) as the key. Verification HMACs the
 * payload segment exactly as received, never a re-serialisation of it.
 */
public final class TicketSignatures {

    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64URL_DECODER = Base64.getUrlDecoder();

    private TicketSignatures() {
    }

    public static String sign(TicketPayload payload, String gateSigningSecretHex) {
        String payloadB64 = B64URL.encodeToString(payload.toJson().getBytes(StandardCharsets.UTF_8));
        return payloadB64 + "." + B64URL.encodeToString(hmac(gateSigningSecretHex, payloadB64));
    }

    public static Verification verify(String qrContent, String gateSigningSecretHex) {
        String[] parts = qrContent.strip().split("\\.", -1);
        if (parts.length != 2) return Verification.failed(Reason.MALFORMED);

        TicketPayload payload;
        byte[] signature;
        try {
            String json = new String(B64URL_DECODER.decode(parts[0]), StandardCharsets.UTF_8);
            payload = fromJson(json);
            signature = B64URL_DECODER.decode(parts[1]);
        } catch (IllegalArgumentException e) {
            return Verification.failed(Reason.MALFORMED);
        }
        boolean valid = MessageDigest.isEqual(hmac(gateSigningSecretHex, parts[0]), signature);
        return valid ? new Verification(true, payload, null) : Verification.failed(Reason.INVALID_SIGNATURE);
    }

    private static TicketPayload fromJson(String json) {
        Map<String, Object> m = Json.parseFlatObject(json);
        Object v = m.get("v");
        return new TicketPayload(
                v instanceof Number n ? n.intValue() : 0,
                str(m, "tid"), str(m, "gw"), str(m, "tt"), str(m, "tx"), str(m, "tn"), str(m, "iat"));
    }

    private static String str(Map<String, Object> m, String key) {
        return m.get(key) instanceof String s ? s : null;
    }

    private static byte[] hmac(String secretHex, String payloadB64) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(HexFormat.of().parseHex(secretHex), "HmacSHA256"));
            return mac.doFinal(payloadB64.getBytes(StandardCharsets.US_ASCII));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    public enum Reason { MALFORMED, INVALID_SIGNATURE }

    /** {@code ok} with the decoded payload, or the reason it was rejected. */
    public record Verification(boolean ok, TicketPayload payload, Reason reason) {
        static Verification failed(Reason reason) {
            return new Verification(false, null, reason);
        }
    }
}
