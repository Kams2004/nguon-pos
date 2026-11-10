package com.nguonpos.sales.device;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Public endpoint where a new till trades a one-time code for its
 * certificate. Server-TLS only (the till has no certificate yet); guessing
 * codes is limited per address.
 */
@RestController
public class EnrollmentController {

    static final int MAX_ATTEMPTS = 10;
    static final Duration WINDOW = Duration.ofMinutes(10);

    private final DeviceRegistry registry;
    private final com.nguonpos.sales.edgesync.EdgeSessions sessions;
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public EnrollmentController(DeviceRegistry registry, com.nguonpos.sales.edgesync.EdgeSessions sessions) {
        this.registry = registry;
        this.sessions = sessions;
    }

    @PostMapping("/sales/enroll/v1")
    public DeviceRegistry.Enrolled enroll(@Valid @RequestBody Request req, HttpServletRequest http) {
        throttle(clientAddress(http));
        DeviceRegistry.Enrolled enrolled = registry.enroll(
                new DeviceRegistry.EnrollRequest(req.deviceId(), req.code(), req.csrPem(), req.label(), req.os(), req.appVersion()));
        sessions.peersChanged(enrolled.gateId()); // the gate's other tills learn about the new one at once
        return enrolled;
    }

    private void throttle(String address) {
        Deque<Instant> q = attempts.computeIfAbsent(address, k -> new ArrayDeque<>());
        synchronized (q) {
            Instant cutoff = Instant.now().minus(WINDOW);
            while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) q.pollFirst();
            if (q.size() >= MAX_ATTEMPTS) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS");
            q.addLast(Instant.now());
        }
    }

    /** nginx puts the caller's address in X-Real-IP; without nginx (tests) the socket address is used. */
    private static String clientAddress(HttpServletRequest http) {
        String real = http.getHeader("X-Real-IP");
        return real != null && !real.isBlank() ? real : http.getRemoteAddr();
    }

    public record Request(
            @NotNull UUID deviceId,
            @NotBlank @Size(max = 20) String code,
            @NotBlank @Size(max = 4000) String csrPem,
            @Size(max = 200) String label,
            @Size(max = 100) String os,
            @Size(max = 40) String appVersion
    ) {
    }
}
