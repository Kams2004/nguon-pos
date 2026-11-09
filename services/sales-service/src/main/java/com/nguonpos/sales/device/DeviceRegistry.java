package com.nguonpos.sales.device;

import com.nguonpos.sales.audit.AuditService;
import io.jsonwebtoken.Claims;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.security.spec.X509EncodedKeySpec;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Enrolled desktop tills and their one-time enrollment codes. */
@Service
public class DeviceRegistry {

    static final Duration CODE_TTL = Duration.ofMinutes(30);
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

    private final JdbcTemplate jdbc;
    private final DeviceCertificateAuthority ca;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public DeviceRegistry(JdbcTemplate jdbc, DeviceCertificateAuthority ca, AuditService audit) {
        this.jdbc = jdbc;
        this.ca = ca;
        this.audit = audit;
    }

    /** A code like "K7QP-M2XD-9F", valid 30 minutes, once, for one gate. Only its hash is stored. */
    public EnrollmentCode createCode(UUID establishmentId, UUID gateId, String label, Claims admin) {
        StringBuilder raw = new StringBuilder();
        for (int i = 0; i < 10; i++) raw.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        String code = raw.substring(0, 4) + "-" + raw.substring(4, 8) + "-" + raw.substring(8);
        Instant expires = Instant.now().plus(CODE_TTL);
        jdbc.update("""
                INSERT INTO sales.enrollment_code (code_hash, establishment_id, gate_id, label, created_by_user_id, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)""", hash(code), establishmentId, gateId, label, AuditService.actorId(admin), Timestamp.from(expires));
        audit.record(admin, "TERMINAL", "DEVICE_CODE_CREATED", "GATE", gateId, "Code d'enrôlement créé pour la caisse « " + label + " »");
        return new EnrollmentCode(code, expires, gateId, label);
    }

    /**
     * Turns a valid code and a certificate request into an enrolled device.
     * The device keeps the id it already uses as its terminal id, unless that
     * id belongs to another key.
     */
    @Transactional
    public Enrolled enroll(EnrollRequest req) {
        if (!ca.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "DEVICE_CA_NOT_CONFIGURED");
        List<Map<String, Object>> codes = jdbc.queryForList("""
                SELECT establishment_id, gate_id, label FROM sales.enrollment_code
                WHERE code_hash = ? AND used_at IS NULL AND expires_at > now() FOR UPDATE""", hash(req.code()));
        if (codes.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "INVALID_CODE");
        UUID establishmentId = (UUID) codes.getFirst().get("establishment_id");
        UUID gateId = (UUID) codes.getFirst().get("gate_id");
        String label = req.label() != null && !req.label().isBlank() ? req.label().strip() : (String) codes.getFirst().get("label");

        PublicKey key;
        try {
            key = ca.verifiedPublicKey(req.csrPem());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_CSR");
        }
        String publicKeyB64 = Base64.getEncoder().encodeToString(key.getEncoded());

        Optional<Map<String, Object>> existing = jdbc.queryForList("SELECT status, public_key, device_no, gate_id FROM sales.device WHERE id = ?",
                req.deviceId()).stream().findFirst();
        if (existing.isPresent() && !(existing.get().get("public_key").equals(publicKeyB64) && "ACTIVE".equals(existing.get().get("status"))
                && gateId.equals(existing.get().get("gate_id")))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "DEVICE_ID_TAKEN");
        }
        int deviceNo = existing.map(e -> (Integer) e.get("device_no")).orElseGet(() ->
                jdbc.queryForObject("SELECT COALESCE(MAX(device_no), 0) + 1 FROM sales.device WHERE gate_id = ?", Integer.class, gateId));

        X509Certificate cert = ca.issue(req.deviceId(), gateId, establishmentId, key);
        String fingerprint = DeviceCertificateAuthority.fingerprint(cert);
        if (existing.isPresent()) {
            jdbc.update("""
                    UPDATE sales.device SET cert_serial = ?, cert_fingerprint = ?, cert_not_after = ?, label = ?, os = ?, app_version = ?
                    WHERE id = ?""", cert.getSerialNumber().toString(16), fingerprint, Timestamp.from(cert.getNotAfter().toInstant()),
                    label, req.os(), req.appVersion(), req.deviceId());
        } else {
            jdbc.update("""
                    INSERT INTO sales.device (id, establishment_id, gate_id, device_no, label, status, public_key, cert_serial, cert_fingerprint,
                                        cert_not_after, enrolled_at, os, app_version)
                    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, now(), ?, ?)""",
                    req.deviceId(), establishmentId, gateId, deviceNo, label, publicKeyB64, cert.getSerialNumber().toString(16), fingerprint,
                    Timestamp.from(cert.getNotAfter().toInstant()), req.os(), req.appVersion());
        }
        jdbc.update("UPDATE sales.enrollment_code SET used_at = now(), used_by_device_id = ? WHERE code_hash = ?", req.deviceId(), hash(req.code()));
        audit.recordAs(null, label, "TERMINAL", "DEVICE_ENROLLED", "DEVICE", req.deviceId(),
                "Caisse « " + label + " » enrôlée (n° " + deviceNo + ")");
        return new Enrolled(req.deviceId(), deviceNo, establishmentId, gateId, label,
                DeviceCertificateAuthority.toPem(cert), ca.chainPem());
    }

    public List<Map<String, Object>> list(UUID establishmentId) {
        return jdbc.queryForList("""
                SELECT d.id, d.gate_id AS "gateId", d.device_no AS "deviceNo", d.label, d.status, d.cert_not_after AS "certNotAfter",
                       d.enrolled_at AS "enrolledAt", d.os, d.app_version AS "appVersion", d.revoked_at AS "revokedAt",
                       COALESCE(t.online, false) AS online, t.last_seen_at AS "lastSeenAt"
                FROM sales.device d LEFT JOIN sales.terminal t ON t.id = d.id
                WHERE d.establishment_id = ? ORDER BY d.gate_id, d.device_no""", establishmentId);
    }

    @Transactional
    public void revoke(UUID establishmentId, UUID deviceId, Claims admin) {
        int n = jdbc.update("""
                UPDATE sales.device SET status = 'REVOKED', revoked_at = now(), revoked_by_user_id = ?
                WHERE id = ? AND establishment_id = ? AND status = 'ACTIVE'""", AuditService.actorId(admin), deviceId, establishmentId);
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Caisse introuvable ou déjà révoquée.");
        audit.record(admin, "TERMINAL", "DEVICE_REVOKED", "DEVICE", deviceId, "Caisse révoquée : elle ne peut plus se synchroniser");
    }

    /** The enrolled, active device presenting this certificate, if any. */
    public Optional<Device> activeByCertificate(X509Certificate cert) {
        if (!ca.issuedHere(cert)) return Optional.empty();
        return jdbc.query("""
                SELECT id, establishment_id, gate_id, device_no, label, public_key FROM sales.device
                WHERE cert_fingerprint = ? AND status = 'ACTIVE'""",
                (rs, i) -> new Device(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getInt(4),
                        rs.getString(5), rs.getString(6)), DeviceCertificateAuthority.fingerprint(cert)).stream().findFirst();
    }

    /** Any device, active or not (records it signed before a revocation stay verifiable). */
    public Optional<Device> byId(UUID deviceId) {
        return jdbc.query("SELECT id, establishment_id, gate_id, device_no, label, public_key FROM sales.device WHERE id = ?",
                (rs, i) -> new Device(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getInt(4),
                        rs.getString(5), rs.getString(6)), deviceId).stream().findFirst();
    }

    public Optional<PublicKey> publicKey(UUID deviceId) {
        return jdbc.queryForList("SELECT public_key FROM sales.device WHERE id = ?", String.class, deviceId).stream().findFirst().map(b64 -> {
            try {
                return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(b64)));
            } catch (GeneralSecurityException e) {
                throw new IllegalStateException(e);
            }
        });
    }

    static String hash(String code) {
        String normalized = code.toUpperCase().replaceAll("[^A-Z0-9]", "");
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public record Device(UUID id, UUID establishmentId, UUID gateId, int deviceNo, String label, String publicKey) {
    }

    public record EnrollmentCode(String code, Instant expiresAt, UUID gateId, String label) {
    }

    public record EnrollRequest(UUID deviceId, String code, String csrPem, String label, String os, String appVersion) {
    }

    public record Enrolled(UUID deviceId, int deviceNo, UUID establishmentId, UUID gateId, String label, String certificatePem,
                           String caChainPem) {
    }
}
