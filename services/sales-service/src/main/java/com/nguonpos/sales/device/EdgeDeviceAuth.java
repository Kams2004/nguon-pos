package com.nguonpos.sales.device;

import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Optional;
import java.util.function.Function;

/**
 * Who is on the other end of an /edge/** request. TLS — with the till's
 * client certificate — ends at the VPS's nginx (edge.pos.nguonevents.com),
 * which checks the certificate against the device CA and forwards
 *   X-Client-Verify: SUCCESS
 *   X-Client-Cert:   the certificate, URL-escaped PEM ($ssl_client_escaped_cert)
 * Every other site on that nginx blanks these headers. Here the certificate
 * is checked again against the CA and must belong to an active device.
 */
@Component
public class EdgeDeviceAuth {

    private final DeviceRegistry registry;

    public EdgeDeviceAuth(DeviceRegistry registry) {
        this.registry = registry;
    }

    public Optional<DeviceRegistry.Device> resolve(Function<String, String> header) {
        if (!"SUCCESS".equals(header.apply("X-Client-Verify"))) return Optional.empty();
        String escaped = header.apply("X-Client-Cert");
        if (escaped == null || escaped.isBlank()) return Optional.empty();
        try {
            String pem = percentDecode(escaped);
            return registry.activeByCertificate(DeviceCertificateAuthority.parseCertificate(pem));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /** %XX only — unlike URLDecoder, a literal '+' (common in base64) stays a '+'. */
    static String percentDecode(String s) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '%' && i + 2 < s.length()) {
                out.write(Integer.parseInt(s.substring(i + 1, i + 3), 16));
                i += 2;
            } else {
                out.write(c);
            }
        }
        return out.toString(StandardCharsets.US_ASCII);
    }
}
