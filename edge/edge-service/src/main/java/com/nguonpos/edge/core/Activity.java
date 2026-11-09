package com.nguonpos.edge.core;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/** When the till was last used (a login, a sale, a scan…): updates wait for a quiet moment. */
@Component
public class Activity {

    private volatile Instant last = Instant.now();

    public void touch() {
        last = Instant.now();
    }

    public Duration idleFor() {
        return Duration.between(last, Instant.now());
    }
}
