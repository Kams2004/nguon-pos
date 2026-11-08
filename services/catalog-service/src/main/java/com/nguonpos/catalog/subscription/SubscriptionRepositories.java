package com.nguonpos.catalog.subscription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface SubscriptionSettingsRepository extends JpaRepository<SubscriptionSettings, UUID> {
}

interface SubscriptionPeriodRepository extends JpaRepository<SubscriptionPeriod, UUID> {
    List<SubscriptionPeriod> findByEstablishmentIdOrderByStartDateDesc(UUID establishmentId);
}

interface SubscriptionPaymentRepository extends JpaRepository<SubscriptionPayment, UUID> {
    List<SubscriptionPayment> findByPeriodIdInOrderByPaidAtDesc(Collection<UUID> periodIds);

    List<SubscriptionPayment> findByPeriodId(UUID periodId);
}
