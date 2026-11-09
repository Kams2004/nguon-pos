package com.nguonpos.sales.live;

import java.util.UUID;
import com.nguonpos.sales.edgesync.EdgeSessions;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

/**
 * Bridges Postgres LISTEN/NOTIFY to the live stream. auth-service and
 * catalog-service announce their changes with pg_notify on the database all
 * three services already share — no service-to-service HTTP, and nothing
 * is lost if this service restarts (the journal row is the durable record;
 * the notification is only the "refresh now" nudge).
 *   nguon_admin — journal entries etc., admin screens only
 *   nguon_all   — catalog changes gate terminals must pick up too
 */
@Component
public class PgEventRelay {

    private static final Logger log = LoggerFactory.getLogger(PgEventRelay.class);

    private final DataSource dataSource;
    private final EventHub hub;
    private final EdgeSessions edgeSessions;
    private volatile boolean running = true;

    public PgEventRelay(DataSource dataSource, EventHub hub, EdgeSessions edgeSessions) {
        this.dataSource = dataSource;
        this.hub = hub;
        this.edgeSessions = edgeSessions;
    }

    /**
     * nguon_edge carries a gate id: wake that gate's desktop tills. Catalog and
     * account changes on nguon_all also refresh the desktop tills' copies.
     */
    private void relay(PGNotification n) {
        try {
            if ("nguon_edge".equals(n.getName())) {
                edgeSessions.wakeGate(UUID.fromString(n.getParameter()));
                return;
            }
            hub.publishRaw(n.getParameter(), "nguon_admin".equals(n.getName()));
            if ("nguon_all".equals(n.getName())) {
                if (n.getParameter().contains("\"CATALOG_CHANGED\"")) edgeSessions.catalogChanged();
                if (n.getParameter().contains("\"USERS_CHANGED\"")) edgeSessions.usersChanged();
            }
        } catch (RuntimeException e) {
            log.warn("Live event not relayed: {}", e.getMessage());
        }
    }

    @PostConstruct
    void start() {
        Thread t = new Thread(this::loop, "pg-event-relay");
        t.setDaemon(true);
        t.start();
    }

    @PreDestroy
    void stop() {
        running = false;
    }

    private void loop() {
        while (running) {
            try (Connection connection = dataSource.getConnection()) {
                try (Statement st = connection.createStatement()) {
                    st.execute("LISTEN nguon_admin");
                    st.execute("LISTEN nguon_all");
                    st.execute("LISTEN nguon_edge");
                }
                PGConnection pg = connection.unwrap(PGConnection.class);
                while (running) {
                    PGNotification[] notifications = pg.getNotifications(5_000);
                    if (notifications == null) continue;
                    for (PGNotification n : notifications) {
                        relay(n);
                    }
                }
            } catch (Exception e) {
                log.warn("Live event relay lost its database connection, retrying: {}", e.getMessage());
                try {
                    Thread.sleep(3_000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }
}
