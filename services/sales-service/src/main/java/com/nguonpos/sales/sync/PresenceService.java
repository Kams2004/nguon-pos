package com.nguonpos.sales.sync;

import com.nguonpos.sales.audit.AuditService;
import com.nguonpos.sales.live.EventHub;
import io.jsonwebtoken.Claims;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

    public PresenceService(TerminalRepository terminalRepository, AuditService audit, EventHub hub) {
        this.terminalRepository = terminalRepository;
        this.audit = audit;
        this.hub = hub;
    }

    public synchronized void heartbeat(HeartbeatRequest request, Claims claims) {
        Terminal t = terminalRepository.findById(request.terminalId())
                .orElse(Terminal.builder().id(request.terminalId()).build());
        boolean wasOnline = t.isOnline();
        UUID userId = AuditService.actorId(claims);
        String userName = AuditService.actorName(claims);
        boolean userChanged = !t.isLoggedIn() || !userId.equals(t.getCurrentUserId());
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
        }
        if (!wasOnline || userChanged || pendingChanged) publish(t);
    }

    public synchronized void logout(UUID terminalId, Claims claims) {
        terminalRepository.findById(terminalId).ifPresent(t -> {
            if (!t.isLoggedIn()) return;
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
