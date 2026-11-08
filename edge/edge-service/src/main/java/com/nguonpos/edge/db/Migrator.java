package com.nguonpos.edge.db;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Applies classpath:db/edge/V{n}__*.sql in order, each in its own
 * transaction, recording the version reached. Kept tiny on purpose: the
 * till's schema only ever moves forward with the app version.
 */
public class Migrator {

    private static final Pattern NAME = Pattern.compile("V(\\d+)__.*\\.sql");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public Migrator(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    public void migrate() throws IOException {
        jdbc.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
        Integer current = jdbc.queryForObject("SELECT COALESCE(MAX(version), 0) FROM schema_version", Integer.class);
        Resource[] scripts = new PathMatchingResourcePatternResolver().getResources("classpath:db/edge/V*__*.sql");
        Arrays.sort(scripts, Comparator.comparingInt(Migrator::version));
        for (Resource r : scripts) {
            int v = version(r);
            if (v <= current) continue;
            String sql = r.getContentAsString(StandardCharsets.UTF_8);
            tx.executeWithoutResult(s -> {
                for (String stmt : sql.split(";\\s*(\\r?\\n|$)")) {
                    String clean = stmt.lines().filter(l -> !l.strip().startsWith("--")).reduce("", (a, b) -> a + "\n" + b).strip();
                    if (!clean.isEmpty()) jdbc.execute(clean);
                }
                jdbc.update("INSERT INTO schema_version (version) VALUES (?)", v);
            });
        }
    }

    private static int version(Resource r) {
        Matcher m = NAME.matcher(r.getFilename() == null ? "" : r.getFilename());
        if (!m.matches()) throw new UncheckedIOException(new IOException("Bad migration name: " + r.getFilename()));
        return Integer.parseInt(m.group(1));
    }
}
