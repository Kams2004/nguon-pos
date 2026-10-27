package com.nguonpos.sales.transaction;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TransactionLineRepository extends JpaRepository<TransactionLine, UUID> {
    List<TransactionLine> findByTransactionId(UUID transactionId);
}
