package com.nguonpos.sales.live;

import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fan-out of live events to every open browser stream (server-sent events).
 * Admin screens get everything; gate terminals only get what they need to
 * react to (catalog changes), never the activity journal.
 */
@Component
public class EventHub {

    public record LiveEvent(String type, Object data) {
    }

    private record Subscriber(SseEmitter emitter, boolean admin, UUID terminalId) {
    }

    private final Set<Subscriber> subscribers = ConcurrentHashMap.newKeySet();
    // When each till's last live stream closed — lets presence tell "tab
    // closed / network dropped" apart from "still heartbeating" quickly.
    private final Map<UUID, Instant> streamClosedAt = new ConcurrentHashMap<>();

    public SseEmitter subscribe(boolean admin, UUID terminalId) {
        SseEmitter emitter = new SseEmitter(0L); // no server-side timeout; pings keep proxies happy
        Subscriber subscriber = new Subscriber(emitter, admin, terminalId);
        subscribers.add(subscriber);
        if (terminalId != null) streamClosedAt.remove(terminalId);
        emitter.onCompletion(() -> drop(subscriber));
        emitter.onTimeout(() -> drop(subscriber));
        emitter.onError(e -> drop(subscriber));
        sendRaw(subscriber, "{\"type\":\"HELLO\"}");
        return emitter;
    }

    /** A domain event built in this service — serialized to JSON by Spring's converters. */
    public void publish(String type, Object data, boolean adminOnly) {
        LiveEvent event = new LiveEvent(type, data);
        for (Subscriber s : subscribers) {
            if (adminOnly && !s.admin()) continue;
            send(s, SseEmitter.event().data(event, MediaType.APPLICATION_JSON));
        }
    }

    /** An already-serialized JSON event relayed from Postgres NOTIFY (see PgEventRelay). */
    public void publishRaw(String json, boolean adminOnly) {
        for (Subscriber s : subscribers) {
            if (adminOnly && !s.admin()) continue;
            sendRaw(s, json);
        }
    }

    public boolean hasStream(UUID terminalId) {
        return subscribers.stream().anyMatch(s -> terminalId.equals(s.terminalId()));
    }

    public Instant streamClosedAt(UUID terminalId) {
        return streamClosedAt.get(terminalId);
    }

    private void drop(Subscriber s) {
        if (subscribers.remove(s) && s.terminalId() != null && !hasStream(s.terminalId())) {
            streamClosedAt.put(s.terminalId(), Instant.now());
        }
    }

    // Keeps idle connections alive through nginx (60s read timeout) and
    // surfaces dead ones fast: a failed write drops the subscriber, which
    // is how a closed till tab is noticed within seconds.
    @Scheduled(fixedRate = 5_000)
    public void ping() {
        for (Subscriber s : subscribers) {
            send(s, SseEmitter.event().comment("ping"));
        }
    }

    private void sendRaw(Subscriber s, String json) {
        send(s, SseEmitter.event().data(json));
    }

    private void send(Subscriber s, SseEmitter.SseEventBuilder event) {
        // SseEmitter isn't safe for concurrent sends from different threads.
        synchronized (s) {
            try {
                s.emitter().send(event);
            } catch (Exception e) {
                drop(s);
                s.emitter().completeWithError(e);
            }
        }
    }
}
