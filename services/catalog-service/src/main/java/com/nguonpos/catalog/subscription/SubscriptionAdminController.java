package com.nguonpos.catalog.subscription;

import com.nguonpos.catalog.audit.AuditService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Cahier §9.3: only the Super Admin sees and configures the subscription.
@RestController
@RequestMapping("/catalog/admin/subscription")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SubscriptionAdminController {

    private final SubscriptionService service;
    private final SubscriptionSettingsRepository settingsRepository;
    private final SubscriptionPeriodRepository periodRepository;
    private final SubscriptionPaymentRepository paymentRepository;
    private final AuditService audit;

    public SubscriptionAdminController(
            SubscriptionService service, SubscriptionSettingsRepository settingsRepository,
            SubscriptionPeriodRepository periodRepository, SubscriptionPaymentRepository paymentRepository, AuditService audit
    ) {
        this.service = service;
        this.settingsRepository = settingsRepository;
        this.periodRepository = periodRepository;
        this.paymentRepository = paymentRepository;
        this.audit = audit;
    }

    @GetMapping
    public Overview get(@AuthenticationPrincipal Claims claims) {
        return overview(establishmentOf(claims));
    }

    @PutMapping("/settings")
    @Transactional
    public Overview updateSettings(@AuthenticationPrincipal Claims claims, @Valid @RequestBody SettingsRequest r) {
        UUID establishmentId = establishmentOf(claims);
        SubscriptionSettings s = service.settingsFor(establishmentId);
        String changes = describeChanges(s, r);
        s.setModuleEnabled(r.moduleEnabled());
        s.setAnnualPrice(r.annualPrice());
        s.setCurrency(r.currency());
        s.setDurationMonths(r.durationMonths());
        s.setReminderDays(r.reminderDays());
        s.setGraceDays(r.graceDays());
        s.setAutoRenew(r.autoRenew());
        s.setUpdatedAt(Instant.now());
        settingsRepository.save(s);
        audit.record(claims, "SUBSCRIPTION", "SUBSCRIPTION_SETTINGS_UPDATED", "ESTABLISHMENT", establishmentId,
                "Paramètres d'abonnement modifiés" + (changes.isEmpty() ? "" : " : " + changes));
        return overview(establishmentId);
    }

    @PostMapping("/periods")
    @Transactional
    public Overview createPeriod(@AuthenticationPrincipal Claims claims, @Valid @RequestBody PeriodRequest r) {
        UUID establishmentId = establishmentOf(claims);
        SubscriptionPeriod p = service.createPeriod(establishmentId, r.startDate(), blankToNull(r.note()), AuditService.actorName(claims));
        audit.record(claims, "SUBSCRIPTION", "SUBSCRIPTION_PERIOD_CREATED", "SUBSCRIPTION_PERIOD", p.getId(),
                "Période d'abonnement " + p.getStartDate() + " → " + p.getEndDate() + " créée ("
                        + p.getPrice().toPlainString() + " " + p.getCurrency() + ")");
        return overview(establishmentId);
    }

    /** Only a period with no confirmed payment can be cancelled — paid history stays intact. */
    @PostMapping("/periods/{id}/cancel")
    @Transactional
    public Overview cancelPeriod(@AuthenticationPrincipal Claims claims, @PathVariable UUID id) {
        UUID establishmentId = establishmentOf(claims);
        SubscriptionPeriod p = periodOf(establishmentId, id);
        boolean hasPayment = paymentRepository.findByPeriodId(id).stream().anyMatch(x -> x.getStatus() == SubscriptionPayment.Status.CONFIRMED);
        if (hasPayment || p.getStatus() == SubscriptionPeriod.Status.PAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une période réglée ne peut pas être annulée.");
        }
        p.setStatus(SubscriptionPeriod.Status.CANCELLED);
        periodRepository.save(p);
        audit.record(claims, "SUBSCRIPTION", "SUBSCRIPTION_PERIOD_CANCELLED", "SUBSCRIPTION_PERIOD", p.getId(),
                "Période d'abonnement " + p.getStartDate() + " → " + p.getEndDate() + " annulée");
        return overview(establishmentId);
    }

    /** A payment made outside the software (cash, transfer, Mobile Money…), entered by the Super Admin. */
    @PostMapping("/periods/{id}/payments")
    @Transactional
    public Overview recordPayment(@AuthenticationPrincipal Claims claims, @PathVariable UUID id, @Valid @RequestBody PaymentRequest r) {
        UUID establishmentId = establishmentOf(claims);
        SubscriptionPeriod p = periodOf(establishmentId, id);
        if (p.getStatus() == SubscriptionPeriod.Status.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette période est annulée.");
        }
        if (r.method() == SubscriptionPayment.Method.ONLINE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Les paiements en ligne sont enregistrés par le prestataire de paiement.");
        }
        SubscriptionPayment payment = paymentRepository.save(SubscriptionPayment.builder()
                .id(UUID.randomUUID()).periodId(p.getId()).amount(r.amount()).currency(p.getCurrency())
                .method(r.method()).status(SubscriptionPayment.Status.CONFIRMED)
                .providerReference(blankToNull(r.reference())).paidAt(r.paidAt() != null ? r.paidAt() : Instant.now())
                .note(blankToNull(r.note())).recordedAt(Instant.now()).recordedByName(AuditService.actorName(claims))
                .build());
        service.applyPayments(p);
        audit.record(claims, "SUBSCRIPTION", "SUBSCRIPTION_PAYMENT_RECORDED", "SUBSCRIPTION_PAYMENT", payment.getId(),
                "Paiement d'abonnement enregistré : " + payment.getAmount().toPlainString() + " " + payment.getCurrency()
                        + " (" + payment.getMethod() + ") pour la période " + p.getStartDate() + " → " + p.getEndDate()
                        + (p.getStatus() == SubscriptionPeriod.Status.PAID ? " — période réglée" : ""));
        return overview(establishmentId);
    }

    private Overview overview(UUID establishmentId) {
        SubscriptionSettings s = service.settingsFor(establishmentId);
        List<SubscriptionPeriod> periods = periodRepository.findByEstablishmentIdOrderByStartDateDesc(establishmentId);
        List<SubscriptionPayment> payments = periods.isEmpty() ? List.of()
                : paymentRepository.findByPeriodIdInOrderByPaidAtDesc(periods.stream().map(SubscriptionPeriod::getId).toList());
        Map<UUID, BigDecimal> paidByPeriod = payments.stream()
                .filter(x -> x.getStatus() == SubscriptionPayment.Status.CONFIRMED)
                .collect(Collectors.groupingBy(SubscriptionPayment::getPeriodId,
                        Collectors.reducing(BigDecimal.ZERO, SubscriptionPayment::getAmount, BigDecimal::add)));
        return new Overview(
                SettingsView.from(s),
                SubscriptionStatus.compute(periods, s.getReminderDays(), s.getGraceDays(), SubscriptionService.today()),
                periods.stream().map(p -> PeriodView.from(p, paidByPeriod.getOrDefault(p.getId(), BigDecimal.ZERO))).toList(),
                payments
        );
    }

    private SubscriptionPeriod periodOf(UUID establishmentId, UUID id) {
        return periodRepository.findById(id)
                .filter(p -> p.getEstablishmentId().equals(establishmentId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Période introuvable"));
    }

    private static UUID establishmentOf(Claims claims) {
        return UUID.fromString(claims.get("establishmentId", String.class));
    }

    private static String describeChanges(SubscriptionSettings s, SettingsRequest r) {
        List<String> c = new java.util.ArrayList<>();
        if (s.isModuleEnabled() != r.moduleEnabled()) c.add(r.moduleEnabled() ? "module activé" : "module désactivé");
        if (s.getAnnualPrice().compareTo(r.annualPrice()) != 0 || !s.getCurrency().equals(r.currency())) {
            c.add("tarif " + s.getAnnualPrice().toPlainString() + " " + s.getCurrency() + " → " + r.annualPrice().toPlainString() + " " + r.currency());
        }
        if (s.getDurationMonths() != r.durationMonths()) c.add("durée " + s.getDurationMonths() + " → " + r.durationMonths() + " mois");
        if (s.isAutoRenew() != r.autoRenew()) c.add(r.autoRenew() ? "renouvellement automatique activé" : "renouvellement automatique désactivé");
        return String.join(", ", c);
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    public record SettingsRequest(
            boolean moduleEnabled,
            @NotNull @PositiveOrZero @Digits(integer = 12, fraction = 2) BigDecimal annualPrice,
            @NotBlank @Size(max = 10) String currency,
            @Min(1) @Max(60) int durationMonths,
            @Min(0) @Max(365) int reminderDays,
            @Min(0) @Max(365) int graceDays,
            boolean autoRenew
    ) {
    }

    public record PeriodRequest(@NotNull LocalDate startDate, @Size(max = 500) String note) {
    }

    public record PaymentRequest(
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull SubscriptionPayment.Method method,
            @Size(max = 200) String reference,
            Instant paidAt,
            @Size(max = 500) String note
    ) {
    }

    public record SettingsView(
            boolean moduleEnabled, BigDecimal annualPrice, String currency, int durationMonths, int reminderDays, int graceDays,
            boolean autoRenew, Instant updatedAt
    ) {
        static SettingsView from(SubscriptionSettings s) {
            return new SettingsView(s.isModuleEnabled(), s.getAnnualPrice(), s.getCurrency(), s.getDurationMonths(), s.getReminderDays(),
                    s.getGraceDays(), s.isAutoRenew(), s.getUpdatedAt());
        }
    }

    public record PeriodView(
            UUID id, LocalDate startDate, LocalDate endDate, BigDecimal price, String currency, SubscriptionPeriod.Status status,
            BigDecimal paidAmount, String note, Instant createdAt, String createdByName
    ) {
        static PeriodView from(SubscriptionPeriod p, BigDecimal paid) {
            return new PeriodView(p.getId(), p.getStartDate(), p.getEndDate(), p.getPrice(), p.getCurrency(), p.getStatus(), paid,
                    p.getNote(), p.getCreatedAt(), p.getCreatedByName());
        }
    }

    public record Overview(SettingsView settings, SubscriptionStatus status, List<PeriodView> periods, List<SubscriptionPayment> payments) {
    }
}
