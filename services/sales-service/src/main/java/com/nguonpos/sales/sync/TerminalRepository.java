package com.nguonpos.sales.sync;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TerminalRepository extends JpaRepository<Terminal, UUID> {
    List<Terminal> findByOnlineTrue();
}
