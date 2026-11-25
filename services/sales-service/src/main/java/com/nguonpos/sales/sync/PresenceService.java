package com.nguonpos.sales.sync;

import com.nguonpos.sales.audit.AuditService;
import com.nguonpos.sales.live.EventHub;
import io.jsonwebtoken.Claims;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Live presence of gate terminals. A till is "online" while it heartbeats
 * (every 10s) or holds an open live stream; it's "logged in" between a
 * heartbeat carrying a user and an explicit logout. Every transition is
 * journaled and pushed to admin screens immediately — the admin never has
 * to refresh to learn a till dropped off.
 */
@Service
public class PresenceService {

    // > 2 missed heartbeats (10s interval) before declaring a till offline,
    // so one slow request doesn't flap the status.
    static final long OFFLINE_AFTER_SECONDS = 25;
    // A till whose live stream closed and that hasn't heartbeated since is
    // almost certainly gone (tab closed, network cut) — don't wait the full 25s.
    static final long OFFLINE_AFTER_STREAM_LOSS_SECONDS = 12;

    private final TerminalRepository terminalRepository;
    private final AuditService audit;
    private final EventHub hub;
    private final JdbcTemplate jdbc;

    public PresenceService(TerminalRepository terminalRepository, AuditService audit, EventHub hub, JdbcTemplate jdbc) {
        this.terminalRepository = terminalRepository;
        this.audit = audit;
        this.hub = hub;
        this.jdbc = jdbc;
    }

    public synchronized void heartbeat(HeartbeatRequest request, Claims claims) {
        Terminal t = terminalRepository.findById(request.terminalId())
                .orElse(Terminal.builder().id(request.terminalId()).build());
        boolean wasOnline = t.isOnline();
        UUID userId = AuditService.actorId(claims);
        String userName = AuditService.actorName(claims);
        boolean userChanged = !t.isLoggedIn() || !userId.equals(t.getCurrentUserId());
        if (userChanged && t.isLoggedIn() && t.getCurrentUserId() != null) {
            // Someone else took over the till: the previous session ends.
            endSession(t.getId(), wasOnline ? Instant.now() : null);
        }
        boolean pendingChanged = t.getLocalPendingCount() != request.localPendingCount();

        t.setGateId(request.gateId());
        if (request.deviceLabel() != null && !request.deviceLabel().isBlank()) t.setDeviceLabel(request.deviceLabel());
        t.setLastSeenAt(Instant.now());
        t.setLocalPendingCount(request.localPendingCount());
        t.setOnline(true);
        t.setLoggedIn(true);
        t.setCurrentUserId(userId);
        t.setCurrentUserName(userName);
        terminalRepository.save(t);

        if (!wasOnline) {
            audit.recordAs(userId, userName, "TERMINAL", "TERMINAL_ONLINE", "TERMINAL", t.getId(),
                    "Guichet « " + label(t) + " » en ligne");
        }
        if (userChanged) {
            audit.recordAs(userId, userName, "TERMINAL", "TERMINAL_USER_CONNECTED", "TERMINAL", t.getId(),
                    userName + " connecté(e) au guichet « " + label(t) + " »");
            startSession(t, userId, userName);
        } else {
            jdbc.update("UPDATE sales.till_session SET last_seen_at = now() WHERE terminal_id = ? AND ended_at IS NULL", t.getId());
        }
        if (!wasOnline || userChanged || pendingChanged) publish(t);
    }

    /**
     * A desktop till reporting that nobody is signed in on it: whoever was
     * ends their session (they logged out, possibly while offline).
     */
    public synchronized void idle(HeartbeatRequest request) {
        Terminal t = terminalRepository.findById(request.terminalId())
                .orElse(Terminal.builder().id(request.terminalId()).build());
        boolean wasOnline = t.isOnline();
        boolean hadUser = t.isLoggedIn() && t.getCurrentUserId() != null;
        boolean pendingChanged = t.getLocalPendingCount() != request.localPendingCount();
        if (hadUser) {
            endSession(t.getId(), wasOnline ? Instant.now() : null);
            audit.recordAs(t.getCurrentUserId(), t.getCurrentUserName(), "TERMINAL", "TERMINAL_USER_DISCONNECTED", "TERMINAL", t.getId(),
                    t.getCurrentUserName() + " déconnecté(e) du guichet « " + (request.deviceLabel() != null ? request.deviceLabel() : label(t)) + " »");
        }
        t.setGateId(request.gateId());
        if (request.deviceLabel() != null && !request.deviceLabel().isBlank()) t.setDeviceLabel(request.deviceLabel());
        t.setLastSeenAt(Instant.now());
        t.setLocalPendingCount(request.localPendingCount());
        t.setOnline(true);
        t.setLoggedIn(false);
        t.setCurrentUserId(null);
        t.setCurrentUserName(null);
        terminalRepository.save(t);
        if (!wasOnline) {
            audit.recordAs(null, null, "TERMINAL", "TERMINAL_ONLINE", "TERMINAL", t.getId(), "Guichet « " + label(t) + " » en ligne");
        }
        if (!wasOnline || hadUser || pendingChanged) publish(t);
    }

    private void startSession(Terminal t, UUID userId, String userName) {
        jdbc.update("""
                INSERT INTO sales.till_session (id, terminal_id, gate_id, device_label, user_id, user_name, started_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, now(), now())""",
                UUID.randomUUID(), t.getId(), t.getGateId(), t.getDeviceLabel(), userId, userName);
    }

    /** Ends the till's open session: now, or — after a silence — when the till was last heard from with that cashier. */
    private void endSession(UUID terminalId, Instant at) {
        if (at != null) {
            jdbc.update("UPDATE sales.till_session SET ended_at = ?, last_seen_at = ? WHERE terminal_id = ? AND ended_at IS NULL",
                    java.sql.Timestamp.from(at), java.sql.Timestamp.from(at), terminalId);
        } else {
            jdbc.update("UPDATE sales.till_session SET ended_at = last_seen_at WHERE terminal_id = ? AND ended_at IS NULL", terminalId);
        }
    }

    /** Sessions overlapping [from, to): who was on which till, at which gate, from when to when. */
    public List<Map<String, Object>> sessions(Instant from, Instant to) {
        return jdbc.queryForList("""
                SELECT id, terminal_id AS "terminalId", gate_id AS "gateId", device_label AS "deviceLabel",
                       user_id AS "userId", user_name AS "userName", started_at AS "startedAt",
                       last_seen_at AS "lastSeenAt", ended_at AS "endedAt"
                FROM sales.till_session
                WHERE started_at < ? AND (ended_at IS NULL OR ended_at >= ?)
                ORDER BY started_at DESC LIMIT 5000""", java.sql.Timestamp.from(to), java.sql.Timestamp.from(from));
    }

    public synchronized void logout(UUID terminalId, Claims claims) {
        terminalRepository.findById(terminalId).ifPresent(t -> {
            if (!t.isLoggedIn()) return;
            endSession(t.getId(), Instant.now());
            t.setLoggedIn(false);
            t.setCurrentUserId(null);
            t.setCurrentUserName(null);
            t.setLastSeenAt(Instant.now());
            terminalRepository.save(t);
            audit.record(claims, "TERMINAL", "TERMINAL_USER_DISCONNECTED", "TERMINAL", t.getId(),
                    AuditService.actorName(claims) + " déconnecté(e) du guichet « " + label(t) + " »");
            publish(t);
        });
    }

    @Scheduled(fixedDelay = 5_000)
    public synchronized void sweep() {
        Instant now = Instant.now();
        for (Terminal t : terminalRepository.findByOnlineTrue()) {
            if (hub.hasStream(t.getId())) {
                // Reachable through its live stream: count that as a heartbeat.
                if (ChronoUnit.SECONDS.between(t.getLastSeenAt(), now) >= 10) {
                    t.setLastSeenAt(now);
                    terminalRepository.save(t);
                }
                continue;
            }
            Instant closedAt = hub.streamClosedAt(t.getId());
            boolean streamLost = closedAt != null
                    && !t.getLastSeenAt().isAfter(closedAt.plusSeconds(1))
                    && ChronoUnit.SECONDS.between(closedAt, now) >= OFFLINE_AFTER_STREAM_LOSS_SECONDS;
            if (streamLost || ChronoUnit.SECONDS.between(t.getLastSeenAt(), now) > OFFLINE_AFTER_SECONDS) {
                t.setOnline(false);
                terminalRepository.save(t);
                audit.recordAs(null, null, "TERMINAL", "TERMINAL_OFFLINE", "TERMINAL", t.getId(),
                        "Guichet « " + label(t) + " » hors-ligne (plus aucun signal)");
                publish(t);
            }
        }
    }

    public TerminalStatus toStatus(Terminal t) {
        return new TerminalStatus(
                t.getId(), t.getGateId(), t.getDeviceLabel(), t.getLastSeenAt(), t.getLocalPendingCount(),
                t.isOnline(), t.isLoggedIn(), t.getCurrentUserId(), t.getCurrentUserName()
        );
    }

    private void publish(Terminal t) {
        hub.publish("TERMINAL_STATUS", toStatus(t), true);
    }

    private static String label(Terminal t) {
        return t.getDeviceLabel() != null ? t.getDeviceLabel() : t.getId().toString().substring(0, 8);
    }

    public record TerminalStatus(
            UUID terminalId, UUID gateId, String deviceLabel, Instant lastSeenAt, int localPendingCount,
            boolean online, boolean loggedIn, UUID currentUserId, String currentUserName
    ) {
    }
}
