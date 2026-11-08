package com.nguonpos.sales.live;

import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@RestController
@RequestMapping("/sales/events")
public class EventController {

    private final EventHub hub;

    public EventController(EventHub hub) {
        this.hub = hub;
    }

    /**
     * One long-lived stream per open app tab. A gate terminal passes its
     * terminalId: an open stream counts as "this till is reachable" for
     * presence (see PresenceService), on top of its periodic heartbeat.
     */
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(
            @AuthenticationPrincipal Claims claims,
            @RequestParam(required = false) UUID terminalId,
            HttpServletResponse response
    ) {
        // Tells nginx not to buffer this response, so events arrive instantly.
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache");
        String role = claims.get("role", String.class);
        boolean admin = "SUPER_ADMIN".equals(role) || "COORDINATOR".equals(role);
        return hub.subscribe(admin, terminalId);
    }
}
