package com.nguonpos.catalog.subscription;

import com.nguonpos.catalog.audit.AuditService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.UUID;

/**
 * Periods and payments. A payment only moves a period to PAID once the
 * confirmed payments cover its price — whether they were entered by the
 * Super Admin (paid offline) or, later, confirmed by a payment provider:
 * a provider integration records a SubscriptionPayment with its provider
 * name/reference and calls {@link #applyPayments}, nothing else changes.
 */
@Service
public class SubscriptionService {

    // Festival/shop dates are local days in Cameroon.
    static final ZoneId ZONE = ZoneId.of("Africa/Douala");

    private final SubscriptionSettingsRepository settingsRepository;
    private final SubscriptionPeriodRepository periodRepository;
    private final SubscriptionPaymentRepository paymentRepository;
    private final AuditService audit;

    public SubscriptionService(
            SubscriptionSettingsRepository settingsRepository, SubscriptionPeriodRepository periodRepository,
            SubscriptionPaymentRepository paymentRepository, AuditService audit
    ) {
        this.settingsRepository = settingsRepository;
        this.periodRepository = periodRepository;
        this.paymentRepository = paymentRepository;
        this.audit = audit;
    }

    static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    public SubscriptionSettings settingsFor(UUID establishmentId) {
        return settingsRepository.findById(establishmentId).orElseGet(() -> SubscriptionSettings.defaults(establishmentId));
    }

    /** A new period at the price in force now; its end follows the configured duration. */
    @Transactional
    public SubscriptionPeriod createPeriod(UUID establishmentId, LocalDate start, String note, String actorName) {
        SubscriptionSettings s = settingsFor(establishmentId);
        SubscriptionPeriod p = SubscriptionPeriod.builder()
                .id(UUID.randomUUID()).establishmentId(establishmentId)
                .startDate(start).endDate(start.plusMonths(s.getDurationMonths()).minusDays(1))
                .price(s.getAnnualPrice()).currency(s.getCurrency())
                // A free period (price 0) needs no payment.
                .status(s.getAnnualPrice().signum() == 0 ? SubscriptionPeriod.Status.PAID : SubscriptionPeriod.Status.PENDING_PAYMENT)
                .note(note).createdAt(Instant.now()).createdByName(actorName)
                .build();
        return periodRepository.save(p);
    }

    /** PENDING_PAYMENT → PAID once confirmed payments reach the period's price. */
    @Transactional
    public SubscriptionPeriod applyPayments(SubscriptionPeriod period) {
        if (period.getStatus() != SubscriptionPeriod.Status.PENDING_PAYMENT) return period;
        BigDecimal paid = paymentRepository.findByPeriodId(period.getId()).stream()
                .filter(x -> x.getStatus() == SubscriptionPayment.Status.CONFIRMED)
                .map(SubscriptionPayment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (paid.compareTo(period.getPrice()) >= 0) {
            period.setStatus(SubscriptionPeriod.Status.PAID);
            periodRepository.save(period);
        }
        return period;
    }

    /**
     * Renewal rule "renouvellement automatique": once the latest period is
     * inside the reminder window, the next one is created (awaiting
     * payment) so it shows up to be paid. Hourly; idempotent because it
     * only acts when nothing follows the latest period yet.
     */
    @Scheduled(cron = "0 7 * * * *")
    @Transactional
    public void autoRenew() {
        LocalDate today = today();
        for (SubscriptionSettings s : settingsRepository.findAll()) {
            if (!s.isModuleEnabled() || !s.isAutoRenew()) continue;
            periodRepository.findByEstablishmentIdOrderByStartDateDesc(s.getEstablishmentId()).stream()
                    .filter(p -> p.getStatus() != SubscriptionPeriod.Status.CANCELLED)
                    .max(Comparator.comparing(SubscriptionPeriod::getEndDate))
                    .filter(last -> !last.getEndDate().minusDays(s.getReminderDays()).isAfter(today))
                    .ifPresent(last -> {
                        SubscriptionPeriod next = createPeriod(s.getEstablishmentId(), last.getEndDate().plusDays(1),
                                "Renouvellement automatique", "Système");
                        audit.recordAs(null, "Système", "SUBSCRIPTION", "SUBSCRIPTION_PERIOD_CREATED", "SUBSCRIPTION_PERIOD", next.getId(),
                                "Période d'abonnement " + next.getStartDate() + " → " + next.getEndDate()
                                        + " créée automatiquement (" + next.getPrice().toPlainString() + " " + next.getCurrency() + ")");
                    });
        }
    }
}
