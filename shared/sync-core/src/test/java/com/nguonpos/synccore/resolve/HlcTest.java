package com.nguonpos.synccore.resolve;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HlcTest {

    @Test
    void followsTheWallClockAndCountsWithinOneMillisecond() {
        AtomicLong now = new AtomicLong(1_000);
        Hlc hlc = new Hlc(now::get);
        assertEquals("0000000001000-0000", hlc.next());
        assertEquals("0000000001000-0001", hlc.next());
        now.set(1_005);
        assertEquals("0000000001005-0000", hlc.next());
    }

    @Test
    void neverGoesBackwardsWhenTheClockIsSetBack() {
        AtomicLong now = new AtomicLong(5_000);
        Hlc hlc = new Hlc(now::get);
        String before = hlc.next();
        now.set(1_000); // someone corrected the till's clock
        String after = hlc.next();
        assertTrue(after.compareTo(before) > 0, after + " must sort after " + before);
    }

    @Test
    void movesPastATimestampSeenFromAnotherTill() {
        AtomicLong now = new AtomicLong(1_000);
        Hlc slow = new Hlc(now::get);
        String fromFastTill = Hlc.format(9_000, 3);
        slow.observe(fromFastTill);
        String local = slow.next();
        assertTrue(local.compareTo(fromFastTill) > 0, local + " must sort after " + fromFastTill);
    }
}
