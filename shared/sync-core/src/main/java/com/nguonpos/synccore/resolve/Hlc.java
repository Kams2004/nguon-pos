package com.nguonpos.synccore.resolve;

import java.util.function.LongSupplier;

/**
 * Hybrid logical clock. Timestamps stay close to wall-clock time, never go
 * backwards on one node even if its clock is set back, and move past any
 * timestamp received from another node — so "which scan came first" has one
 * answer that every till and central agree on.
 *
 * Text form "{millis:13}-{counter:4}" (e.g. "1762642800123-0002") sorts
 * lexicographically in time order.
 */
public final class Hlc {

    private final LongSupplier wallClock;
    private long millis;
    private int counter;

    public Hlc(LongSupplier wallClock) {
        this.wallClock = wallClock;
    }

    public Hlc() {
        this(System::currentTimeMillis);
    }

    /** A timestamp for a local event. */
    public synchronized String next() {
        long now = wallClock.getAsLong();
        if (now > millis) {
            millis = now;
            counter = 0;
        } else {
            counter++;
        }
        return format(millis, counter);
    }

    /** Takes a timestamp from another node into account (a received record, or central's time). */
    public synchronized void observe(String remote) {
        long rMillis = parseMillis(remote);
        int rCounter = parseCounter(remote);
        long now = wallClock.getAsLong();
        long max = Math.max(Math.max(now, millis), rMillis);
        if (max == millis && max == rMillis) {
            counter = Math.max(counter, rCounter) + 1;
        } else if (max == millis) {
            counter++;
        } else if (max == rMillis) {
            counter = rCounter + 1;
        } else {
            counter = 0;
        }
        millis = max;
    }

    public static String format(long millis, int counter) {
        return String.format("%013d-%04d", millis, counter);
    }

    public static long parseMillis(String hlc) {
        return Long.parseLong(hlc.substring(0, hlc.indexOf('-')));
    }

    public static int parseCounter(String hlc) {
        return Integer.parseInt(hlc.substring(hlc.indexOf('-') + 1));
    }
}
