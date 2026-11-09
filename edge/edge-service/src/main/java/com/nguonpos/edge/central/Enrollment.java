package com.nguonpos.edge.central;

import com.nguonpos.edge.core.DeviceIdentity;
import com.nguonpos.edge.core.Meta;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.openssl.jcajce.JcaPEMWriter;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.pkcs.PKCS10CertificationRequest;
import org.bouncycastle.pkcs.jcajce.JcaPKCS10CertificationRequestBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.StringWriter;
import java.security.KeyPair;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Enrolls this till: a certificate request signed with the device key (the
 * key never leaves the till) and a one-time code from the back office
 * ("Appareils") are traded for the till's certificate, stored in the
 * encrypted database. From then on the till syncs over the live channel.
 */
@Component
public class Enrollment {

    private final CentralClient central;
    private final DeviceIdentity device;
    private final Meta meta;
    private final TransactionTemplate tx;

    public Enrollment(CentralClient central, DeviceIdentity device, Meta meta, TransactionTemplate tx) {
        this.central = central;
        this.device = device;
        this.meta = meta;
        this.tx = tx;
    }

    public boolean enrolled() {
        return meta.get("device_cert").isPresent() && meta.get("revoked").isEmpty();
    }

    public boolean revoked() {
        return meta.get("revoked").isPresent();
    }

    public Optional<String> certificatePem() {
        return meta.get("device_cert");
    }

    public Optional<String> chainPem() {
        return meta.get("ca_chain");
    }

    /** The name the back office gave this till ("Caisse n° 2", "Caisse VIP"…). */
    public Optional<String> label() {
        return meta.get("device_label");
    }

    public Optional<Integer> deviceNo() {
        return meta.get("device_no").map(Integer::parseInt);
    }

    public Map<String, Object> enroll(String code, String label) {
        if (!central.configured()) throw new ResponseStatusException(HttpStatus.CONFLICT, "NO_CENTRAL");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("deviceId", device.deviceId().toString());
        body.put("code", code.strip().toUpperCase());
        body.put("csrPem", csr(device.keyPair()));
        body.put("label", label == null ? "" : label.strip());
        body.put("os", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        body.put("appVersion", com.nguonpos.edge.update.AppVersion.current());
        CentralClient.Response res;
        try {
            res = central.enroll(body);
        } catch (CentralClient.Unreachable e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CENTRAL_UNREACHABLE");
        }
        if (!res.ok() || res.body() == null) {
            String reason = res.body() != null ? res.body().path("message").asString("") : "";
            throw new ResponseStatusException(HttpStatus.valueOf(res.status() == 429 ? 429 : res.status() == 409 ? 409 : 403),
                    reason.isBlank() ? "ENROLLMENT_REFUSED" : reason);
        }
        JsonNode r = res.body();
        tx.executeWithoutResult(s -> {
            meta.put("device_cert", r.get("certificatePem").asString());
            meta.put("ca_chain", r.get("caChainPem").asString());
            meta.put("device_no", Integer.toString(r.get("deviceNo").asInt()));
            meta.put("device_label", r.get("label").asString());
            meta.put("enrolled_gate_id", r.get("gateId").asString());
        });
        return Map.of("deviceNo", r.get("deviceNo").asInt(), "label", r.get("label").asString(), "gateId", r.get("gateId").asString());
    }

    /** Central refused this till's certificate for good (close code 4403). */
    public void markRevoked() {
        meta.put("revoked", java.time.Instant.now().toString());
    }

    static String csr(KeyPair keys) {
        try {
            PKCS10CertificationRequest req = new JcaPKCS10CertificationRequestBuilder(new X500Name("O=Nguon POS"), keys.getPublic())
                    .build(new JcaContentSignerBuilder("SHA256withECDSA").build(keys.getPrivate()));
            StringWriter w = new StringWriter();
            try (JcaPEMWriter pw = new JcaPEMWriter(w)) {
                pw.writeObject(req);
            }
            return w.toString();
        } catch (OperatorCreationException | IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
