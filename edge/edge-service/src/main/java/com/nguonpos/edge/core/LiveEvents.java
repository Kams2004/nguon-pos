package com.nguonpos.edge.core;

import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Pushes changes to the till screen (sync progress, catalog updates) over SSE. */
@Component
public class LiveEvents {

    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final JsonMapper json;

    public LiveEvents(JsonMapper json) {
        this.json = json;
    }

    public SseEmitter subscribe() {
        SseEmitter e = new SseEmitter(0L);
        emitters.add(e);
        e.onCompletion(() -> emitters.remove(e));
        e.onTimeout(() -> emitters.remove(e));
        e.onError(t -> emitters.remove(e));
        send(e, Map.of("type", "HELLO"));
        return e;
    }

    public void publish(String type, Object data) {
        Map<String, Object> event = data == null ? Map.of("type", type) : Map.of("type", type, "data", data);
        emitters.forEach(e -> send(e, event));
    }

    @Scheduled(fixedDelay = 15_000)
    void keepAlive() {
        emitters.forEach(e -> {
            try {
                e.send(SseEmitter.event().comment("ping"));
            } catch (IOException ex) {
                emitters.remove(e);
            }
        });
    }

    private void send(SseEmitter e, Object event) {
        try {
            e.send(SseEmitter.event().data(json.writeValueAsString(event), MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException ex) {
            emitters.remove(e);
        }
    }
}
