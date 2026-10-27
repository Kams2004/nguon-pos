package com.nguonpos.sales.validation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EntryScanRepository extends JpaRepository<EntryScan, UUID> {
}
