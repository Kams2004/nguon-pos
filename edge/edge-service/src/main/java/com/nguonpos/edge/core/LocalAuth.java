package com.nguonpos.edge.core;

import com.nguonpos.edge.central.CentralClient;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Cashier login at the till.
 *
 * Online, central decides: a good password refreshes the gate's catalog and
 * stores a bcrypt verifier of it here; a refused one deletes any verifier
 * (so a password changed or an account disabled at central stops working
 * here as soon as the till is online). Offline, the verifier decides, so
 * someone who has logged in at this till once can keep working.
 *
 * A till belongs to one gate: the first successful login binds it, and users
 * of other gates are refused.
 */
@Component
public class LocalAuth {

    static final Duration SESSION_TTL = Duration.ofHours(12);
    static final int MAX_FAILURES = 5;
    static final Duration FAILURE_WINDOW = Duration.ofMinutes(5);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final CentralClient central;
    private final Catalog catalog;
    private final JsonMapper json;
    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
    private final SecureRandom random = new SecureRandom();

    public LocalAuth(JdbcTemplate jdbc, TransactionTemplate tx, CentralClient central, Catalog catalog, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.central = central;
        this.catalog = catalog;
        this.json = json;
    }

    public LoginResult login(String username, String password) {
        if (recentFailures(username) >= MAX_FAILURES) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS");
        }
        Boolean online = null;
        if (central.configured()) {
            try {
                online = loginOnline(username, password);
            } catch (CentralClient.Unreachable e) {
                online = null; // fall through to the offline check
            }
            if (Boolean.FALSE.equals(online)) {
                fail(username);
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
            }
        }
        LocalUser user = findByUsername(username).orElseThrow(() -> {
            // Never logged in here before and central can't be asked.
            return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "FIRST_LOGIN_NEEDS_NETWORK");
        });
        if (online == null && !bcrypt.matches(password, user.verifier())) {
            fail(username);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        jdbc.update("DELETE FROM login_failure WHERE username = ?", username);
        String token = newToken();
        jdbc.update("INSERT INTO local_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                sha256(token), user.id(), Instant.now().plus(SESSION_TTL).toString());
        return new LoginResult(token, user, online != null);
    }

    /** true: accepted by central (and cached); false: refused by central. */
    private boolean loginOnline(String username, String password) {
        CentralClient.Response res = central.login(username, password);
        if (res.status() == 401 || res.status() == 403) {
            jdbc.update("DELETE FROM user_credential WHERE username = ?", username);
            return false;
        }
        if (!res.ok() || res.body() == null) throw new CentralClient.Unreachable("login answered " + res.status());
        JsonNode body = res.body();
        String token = body.get("token").asString();
        JsonNode gateNode = body.get("assignedGateId");
        if (gateNode == null || gateNode.isNull()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "NO_GATE_ASSIGNED");
        }
        String gateId = gateNode.asString();
        Optional<Catalog.GateInfo> bound = catalog.gate();
        if (bound.isPresent() && !bound.get().id().equals(gateId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "OTHER_GATE");
        }
        CentralClient.Response boot = central.bootstrap(token);
        if (!boot.ok() || boot.body() == null) throw new CentralClient.Unreachable("bootstrap answered " + boot.status());
        String verifier = bcrypt.encode(password);
        tx.executeWithoutResult(s -> {
            catalog.store(boot.body());
            jdbc.update("""
                    INSERT INTO user_credential (user_id, username, full_name, role, gate_id, verifier, central_token, token_expires_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (user_id) DO UPDATE SET username = excluded.username, full_name = excluded.full_name,
                        role = excluded.role, gate_id = excluded.gate_id, verifier = excluded.verifier,
                        central_token = excluded.central_token, token_expires_at = excluded.token_expires_at,
                        updated_at = excluded.updated_at""",
                    body.get("userId").asString(), body.get("username").asString(), body.get("fullName").asString(),
                    body.get("role").asString(), gateId, verifier, token, jwtExpiry(token), Instant.now().toString());
        });
        return true;
    }

    /**
     * The gate's accounts as central sent them over the live channel: who may
     * log in here, offline included — new cashiers too, without a first online
     * login. Central's bcrypt hash is the verifier. Accounts removed, disabled
     * or moved to another gate disappear, with their open sessions.
     */
    public void replaceUsers(JsonNode users, String gateId) {
        tx.executeWithoutResult(s -> {
            List<String> keep = new java.util.ArrayList<>();
            for (JsonNode u : users) {
                if (!u.path("active").asBoolean(false)) continue;
                String id = u.get("id").asString();
                keep.add(id);
                jdbc.update("""
                        INSERT INTO user_credential (user_id, username, full_name, role, gate_id, verifier, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (user_id) DO UPDATE SET username = excluded.username, full_name = excluded.full_name,
                            role = excluded.role, gate_id = excluded.gate_id, verifier = excluded.verifier, updated_at = excluded.updated_at""",
                        id, u.get("username").asString(), u.get("fullName").asString(), u.get("role").asString(), gateId,
                        u.get("passwordHash").asString(), Instant.now().toString());
            }
            for (String id : jdbc.queryForList("SELECT user_id FROM user_credential", String.class)) {
                if (!keep.contains(id)) {
                    jdbc.update("DELETE FROM local_session WHERE user_id = ?", id);
                    jdbc.update("DELETE FROM user_credential WHERE user_id = ?", id);
                }
            }
        });
    }

    public Optional<LocalUser> userForSession(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        List<LocalUser> users = jdbc.query("""
                SELECT u.user_id, u.username, u.full_name, u.role, u.gate_id, u.verifier FROM local_session s
                JOIN user_credential u ON u.user_id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > ?""", (rs, i) -> new LocalUser(rs.getString(1), rs.getString(2),
                rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6)), sha256(token), Instant.now().toString());
        return users.stream().findFirst();
    }

    public void logout(String token) {
        jdbc.update("DELETE FROM local_session WHERE token_hash = ?", sha256(token));
    }

    /** A still-valid JWT for central, if this user logged in online recently. */
    public Optional<String> centralToken(String userId) {
        return jdbc.queryForList("""
                SELECT central_token FROM user_credential
                WHERE user_id = ? AND central_token IS NOT NULL AND token_expires_at > ?""",
                String.class, userId, Instant.now().plusSeconds(60).toString()).stream().findFirst();
    }

    public void dropCentralToken(String userId) {
        jdbc.update("UPDATE user_credential SET central_token = NULL, token_expires_at = NULL WHERE user_id = ?", userId);
    }

    private Optional<LocalUser> findByUsername(String username) {
        return jdbc.query("SELECT user_id, username, full_name, role, gate_id, verifier FROM user_credential WHERE username = ?",
                (rs, i) -> new LocalUser(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getString(6)), username).stream().findFirst();
    }

    private int recentFailures(String username) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM login_failure WHERE username = ? AND at > ?", Integer.class,
                username, Instant.now().minus(FAILURE_WINDOW).toString());
        return n == null ? 0 : n;
    }

    private void fail(String username) {
        jdbc.update("INSERT INTO login_failure (username, at) VALUES (?, ?)", username, Instant.now().toString());
    }

    /** exp claim of a JWT from central — read, not verified: it only decides when to stop using the token. */
    private String jwtExpiry(String jwt) {
        String[] parts = jwt.split("\\.");
        JsonNode claims = json.readTree(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
        return Instant.ofEpochSecond(claims.get("exp").asLong()).toString();
    }

    private String newToken() {
        byte[] b = new byte[32];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record LocalUser(String id, String username, String fullName, String role, String gateId, String verifier) {
    }

    public record LoginResult(String token, LocalUser user, boolean online) {
    }
}
