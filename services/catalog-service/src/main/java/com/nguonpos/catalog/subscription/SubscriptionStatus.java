package com.nguonpos.catalog.subscription;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The establishment's subscription state, derived from its periods — never
 * stored, so it can't drift from the periods and payments it summarises.
 * Informational only at launch: no code path refuses a sale because of it.
 */
public record SubscriptionStatus(
        State state,
        UUID currentPeriodId,
        LocalDate coveredUntil,   // last day covered by a paid period, if any
        Long daysRemaining,       // until coveredUntil (negative once past)
        LocalDate graceUntil,     // EXPIRED only: end of the grace period
        LocalDate nextStart       // a period already planned after today's
) {
    public enum State {
        NOT_ACTIVATED,   // non activé: no period yet (or only a future, paid one)
        ACTIVE,          // actif
        TO_RENEW,        // à renouveler: paid, ends within the reminder window, nothing paid after
        EXPIRED,         // expiré
        PENDING_PAYMENT  // en attente de paiement
    }

    public static SubscriptionStatus compute(List<SubscriptionPeriod> all, int reminderDays, int graceDays, LocalDate today) {
        List<SubscriptionPeriod> periods = all.stream()
                .filter(p -> p.getStatus() != SubscriptionPeriod.Status.CANCELLED)
                .sorted(Comparator.comparing(SubscriptionPeriod::getStartDate))
                .toList();
        if (periods.isEmpty()) return new SubscriptionStatus(State.NOT_ACTIVATED, null, null, null, null, null);

        Optional<SubscriptionPeriod> current = periods.stream()
                .filter(p -> !p.getStartDate().isAfter(today) && !p.getEndDate().isBefore(today))
                .reduce((a, b) -> b);
        // The end of the run of paid periods covering today, consecutive ones chained.
        LocalDate coveredUntil = null;
        if (current.isPresent() && current.get().getStatus() == SubscriptionPeriod.Status.PAID) {
            coveredUntil = current.get().getEndDate();
            for (SubscriptionPeriod p : periods) {
                if (p.getStatus() == SubscriptionPeriod.Status.PAID && !p.getStartDate().isAfter(coveredUntil.plusDays(1))
                        && p.getEndDate().isAfter(coveredUntil)) {
                    coveredUntil = p.getEndDate();
                }
            }
        }
        LocalDate end = current.map(SubscriptionPeriod::getEndDate).orElse(null);
        LocalDate nextStart = periods.stream()
                .map(SubscriptionPeriod::getStartDate)
                .filter(d -> d.isAfter(end != null ? end : today))
                .findFirst().orElse(null);

        if (current.isPresent()) {
            SubscriptionPeriod p = current.get();
            if (p.getStatus() == SubscriptionPeriod.Status.PENDING_PAYMENT) {
                return new SubscriptionStatus(State.PENDING_PAYMENT, p.getId(), null, null, null, nextStart);
            }
            long days = ChronoUnit.DAYS.between(today, coveredUntil);
            State state = days <= reminderDays ? State.TO_RENEW : State.ACTIVE;
            return new SubscriptionStatus(state, p.getId(), coveredUntil, days, null, nextStart);
        }

        SubscriptionPeriod last = periods.stream().filter(p -> p.getEndDate().isBefore(today)).reduce((a, b) -> b).orElse(null);
        if (last == null) {
            // Only future periods: not started yet.
            SubscriptionPeriod first = periods.get(0);
            State state = first.getStatus() == SubscriptionPeriod.Status.PENDING_PAYMENT ? State.PENDING_PAYMENT : State.NOT_ACTIVATED;
            return new SubscriptionStatus(state, null, null, null, null, first.getStartDate());
        }
        if (last.getStatus() == SubscriptionPeriod.Status.PENDING_PAYMENT) {
            return new SubscriptionStatus(State.PENDING_PAYMENT, last.getId(), null, null, null, nextStart);
        }
        long days = ChronoUnit.DAYS.between(today, last.getEndDate());
        return new SubscriptionStatus(State.EXPIRED, last.getId(), last.getEndDate(), days, last.getEndDate().plusDays(graceDays), nextStart);
    }
}
