package com.nguonpos.sales.audit;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

// The journal is written by all three services, each into its own schema
// (auth/catalog/sales.audit_log, identical shape). They share one Postgres
// database and one DB user, so the consolidated read is a plain UNION here
// rather than three HTTP calls stitched together in the browser.
@RestController
@RequestMapping("/sales/admin/audit")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
public class AuditQueryController {

    // Every value written by the three AuditServices. Anything else is
    // rejected up front rather than handed to the query, even as a parameter.
    static final Set<String> CATEGORIES = Set.of("AUTH", "CATALOG", "MEDIA", "SALE", "SCAN", "SETTINGS", "SUBSCRIPTION", "TERMINAL", "USER", "VOID");

    private final JdbcTemplate jdbc;

    public AuditQueryController(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** One page of the journal, newest first, with the total for the pager. */
    @GetMapping
    public AuditPage list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q
    ) {
        // The SQL text below is built only from constants; user input travels
        // exclusively as bind parameters (?), never concatenated.
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (category != null && !category.isBlank()) {
            if (!CATEGORIES.contains(category)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Catégorie inconnue");
            }
            where.append(" AND category = ?");
            args.add(category);
        }
        if (q != null && !q.isBlank()) {
            if (q.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recherche trop longue");
            // % and _ typed by the user are matched literally, not as wildcards.
            String pattern = "%" + escapeLike(q) + "%";
            where.append(" AND (summary ILIKE ? ESCAPE '\\' OR actor_name ILIKE ? ESCAPE '\\')");
            args.add(pattern);
            args.add(pattern);
        }
        String from = """
                FROM (
                    SELECT * FROM auth.audit_log
                    UNION ALL SELECT * FROM catalog.audit_log
                    UNION ALL SELECT * FROM sales.audit_log
                ) a""" + where;

        Long total = jdbc.queryForObject("SELECT count(*) " + from, Long.class, args.toArray());
        int pageSize = Math.min(Math.max(size, 1), 200);
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageSize);
        pageArgs.add((long) Math.max(page, 0) * pageSize);
        List<Map<String, Object>> content = jdbc.queryForList("""
                SELECT id, occurred_at AS "occurredAt", service, category, action,
                       actor_user_id AS "actorUserId", actor_name AS "actorName",
                       entity_type AS "entityType", entity_id AS "entityId", summary
                """ + from + " ORDER BY occurred_at DESC LIMIT ? OFFSET ?", pageArgs.toArray());
        return new AuditPage(content, total == null ? 0 : total);
    }

    static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    public record AuditPage(List<Map<String, Object>> content, long totalElements) {
    }
}
