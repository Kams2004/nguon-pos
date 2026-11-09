package com.nguonpos.sales.release;

import com.nguonpos.sales.audit.AuditService;
import io.jsonwebtoken.Claims;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Desktop till versions and which one each establishment deploys (or none: frozen). */
@Service
public class Releases {

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AuditService audit;

    public Releases(JdbcTemplate jdbc, JsonMapper json, AuditService audit) {
        this.jdbc = jdbc;
        this.json = json;
        this.audit = audit;
    }

    public List<Map<String, Object>> all() {
        return jdbc.query("SELECT version, notes, files, created_at FROM sales.release ORDER BY created_at DESC", (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("version", rs.getString(1));
            m.put("notes", rs.getString(2));
            m.put("files", json.readTree(rs.getString(3)));
            m.put("createdAt", rs.getTimestamp(4).toInstant());
            return m;
        });
    }

    public Optional<String> target(UUID establishmentId) {
        return jdbc.queryForList("SELECT target_version FROM sales.release_policy WHERE establishment_id = ?", String.class, establishmentId)
                .stream().filter(v -> v != null).findFirst();
    }

    /** The release the establishment's tills should install, as sent over their channel. */
    public Optional<Map<String, Object>> targetRelease(UUID establishmentId) {
        return target(establishmentId).flatMap(v -> jdbc.query("SELECT version, notes, files FROM sales.release WHERE version = ?", (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("version", rs.getString(1));
            m.put("notes", rs.getString(2) == null ? "" : rs.getString(2));
            JsonNode files = json.readTree(rs.getString(3));
            m.put("files", files);
            return m;
        }, v).stream().findFirst());
    }

    /** Publish `version` to the establishment's tills, or freeze them where they are (null). */
    public void setTarget(UUID establishmentId, String version, Claims admin) {
        if (version != null && jdbc.queryForObject("SELECT COUNT(*) FROM sales.release WHERE version = ?", Integer.class, version) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Version inconnue.");
        }
        jdbc.update("""
                INSERT INTO sales.release_policy (establishment_id, target_version, updated_at, updated_by_user_id) VALUES (?, ?, now(), ?)
                ON CONFLICT (establishment_id) DO UPDATE SET target_version = excluded.target_version, updated_at = now(),
                    updated_by_user_id = excluded.updated_by_user_id""", establishmentId, version, AuditService.actorId(admin));
        audit.record(admin, "TERMINAL", version == null ? "RELEASE_FROZEN" : "RELEASE_PUBLISHED", "RELEASE", version,
                version == null ? "Mises à jour des caisses gelées" : "Version " + version + " publiée aux caisses");
    }
}
