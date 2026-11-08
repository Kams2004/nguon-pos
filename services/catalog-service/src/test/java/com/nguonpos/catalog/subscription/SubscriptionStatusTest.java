package com.nguonpos.catalog.subscription;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.nguonpos.catalog.subscription.SubscriptionPeriod.Status.CANCELLED;
import static com.nguonpos.catalog.subscription.SubscriptionPeriod.Status.PAID;
import static com.nguonpos.catalog.subscription.SubscriptionPeriod.Status.PENDING_PAYMENT;
import static com.nguonpos.catalog.subscription.SubscriptionStatus.State;
import static org.assertj.core.api.Assertions.assertThat;

class SubscriptionStatusTest {

    static final LocalDate TODAY = LocalDate.of(2026, 10, 28);
    static final int REMINDER = 30;
    static final int GRACE = 15;

    static SubscriptionPeriod period(String start, String end, SubscriptionPeriod.Status status) {
        return SubscriptionPeriod.builder()
                .id(UUID.randomUUID()).establishmentId(UUID.randomUUID())
                .startDate(LocalDate.parse(start)).endDate(LocalDate.parse(end))
                .price(new BigDecimal("100000")).currency("XAF").status(status).createdAt(Instant.now())
                .build();
    }

    static SubscriptionStatus status(SubscriptionPeriod... periods) {
        return SubscriptionStatus.compute(List.of(periods), REMINDER, GRACE, TODAY);
    }

    @Test
    void noPeriodIsNotActivated() {
        assertThat(status().state()).isEqualTo(State.NOT_ACTIVATED);
    }

    @Test
    void cancelledPeriodsAreIgnored() {
        assertThat(status(period("2026-01-01", "2026-12-31", CANCELLED)).state()).isEqualTo(State.NOT_ACTIVATED);
    }

    @Test
    void paidPeriodFarFromItsEndIsActive() {
        SubscriptionStatus s = status(period("2026-06-01", "2027-05-31", PAID));
        assertThat(s.state()).isEqualTo(State.ACTIVE);
        assertThat(s.coveredUntil()).isEqualTo(LocalDate.parse("2027-05-31"));
        assertThat(s.daysRemaining()).isEqualTo(215);
    }

    @Test
    void paidPeriodInsideTheReminderWindowIsToRenew() {
        assertThat(status(period("2025-11-15", "2026-11-14", PAID)).state()).isEqualTo(State.TO_RENEW);
    }

    @Test
    void anUnpaidNextPeriodStillNeedsRenewing() {
        SubscriptionStatus s = status(period("2025-11-15", "2026-11-14", PAID), period("2026-11-15", "2027-11-14", PENDING_PAYMENT));
        assertThat(s.state()).isEqualTo(State.TO_RENEW);
        assertThat(s.nextStart()).isEqualTo(LocalDate.parse("2026-11-15"));
    }

    @Test
    void aPaidNextPeriodExtendsCoverage() {
        SubscriptionStatus s = status(period("2025-11-15", "2026-11-14", PAID), period("2026-11-15", "2027-11-14", PAID));
        assertThat(s.state()).isEqualTo(State.ACTIVE);
        assertThat(s.coveredUntil()).isEqualTo(LocalDate.parse("2027-11-14"));
    }

    @Test
    void currentUnpaidPeriodIsPendingPayment() {
        assertThat(status(period("2026-10-01", "2027-09-30", PENDING_PAYMENT)).state()).isEqualTo(State.PENDING_PAYMENT);
    }

    @Test
    void endedPaidPeriodIsExpiredWithGrace() {
        SubscriptionStatus s = status(period("2025-10-01", "2026-09-30", PAID));
        assertThat(s.state()).isEqualTo(State.EXPIRED);
        assertThat(s.graceUntil()).isEqualTo(LocalDate.parse("2026-10-15"));
        assertThat(s.daysRemaining()).isNegative();
    }

    @Test
    void lastDayOfAPeriodIsStillCovered() {
        assertThat(status(period("2025-10-29", "2026-10-28", PAID)).state()).isEqualTo(State.TO_RENEW);
    }

    @Test
    void onlyAFuturePaidPeriodIsNotActivatedYet() {
        SubscriptionStatus s = status(period("2027-01-01", "2027-12-31", PAID));
        assertThat(s.state()).isEqualTo(State.NOT_ACTIVATED);
        assertThat(s.nextStart()).isEqualTo(LocalDate.parse("2027-01-01"));
    }
}
