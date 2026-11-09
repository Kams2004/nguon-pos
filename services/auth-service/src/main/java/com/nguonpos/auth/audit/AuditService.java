package com.nguonpos.auth.audit;

import io.jsonwebtoken.Claims;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.util.UUID;

/**
 * Writes one line to the activity journal and announces it on Postgres
 * channel `nguon_admin` in the same statement, so the admin live stream
 * (see live/PgEventRelay) shows it the moment it commits. Inside a
 * surrounding transaction both the row and the notification roll back
 * together — the journal never shows an action that didn't happen.
 * Same class in every service; only SERVICE and the schema differ.
 */
@Service
public class AuditService {

    private static final String SERVICE = "auth";

    private final JdbcTemplate jdbc;

    public AuditService(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    public static String actorName(Claims claims) {
        if (claims == null) return null;
        String fullName = claims.get("fullName", String.class);
        return fullName != null ? fullName : claims.getSubject();
    }

    public static UUID actorId(Claims claims) {
        if (claims == null) return null;
        String raw = claims.get("userId", String.class);
        return raw != null ? UUID.fromString(raw) : null;
    }

    public void record(Claims actor, String category, String action, String entityType, Object entityId, String summary) {
        recordAs(actorId(actor), actorName(actor), category, action, entityType, entityId, summary);
    }

    public void recordAs(UUID actorId, String actorName, String category, String action, String entityType, Object entityId, String summary) {
        jdbc.query("""
                WITH entry AS (
                    INSERT INTO auth.audit_log (service, category, action, actor_user_id, actor_name, entity_type, entity_id, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING *
                )
                SELECT pg_notify('nguon_admin', json_build_object(
                    'type', 'AUDIT',
                    'data', json_build_object(
                        'id', id, 'occurredAt', occurred_at, 'service', service, 'category', category,
                        'action', action, 'actorUserId', actor_user_id, 'actorName', actor_name,
                        'entityType', entity_type, 'entityId', entity_id, 'summary', summary)
                )::text) FROM entry
                """,
                rs -> {
                },
                SERVICE, category, action, actorId, actorName, entityType,
                entityId != null ? entityId.toString() : null, summary);
    }

    /** Tells sales-service (LISTEN nguon_all) that accounts changed, so desktop tills get the new list at once. */
    public void usersChanged() {
        jdbc.query("SELECT pg_notify('nguon_all', '{\"type\":\"USERS_CHANGED\"}')", rs -> {
        });
    }
}
