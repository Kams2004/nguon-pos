package com.nguonpos.edge.core;

import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/** Small key/value facts about this till (device id, bound gate, counters). */
@Component
@DependsOn("migrator") // everything reading the database goes through here first
public class Meta {

    private final JdbcTemplate jdbc;

    public Meta(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> get(String key) {
        List<String> v = jdbc.queryForList("SELECT v FROM meta WHERE k = ?", String.class, key);
        return v.stream().findFirst();
    }

    public void put(String key, String value) {
        jdbc.update("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", key, value);
    }

    /** Next value of a counter; call inside the transaction that uses it. */
    public long increment(String key) {
        jdbc.update("INSERT INTO meta (k, v) VALUES (?, '1') ON CONFLICT (k) DO UPDATE SET v = CAST(v AS INTEGER) + 1", key);
        return Long.parseLong(get(key).orElseThrow());
    }
}
