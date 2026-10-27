package com.nguonpos.catalog.gate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface GateRepository extends JpaRepository<Gate, UUID> {
}
