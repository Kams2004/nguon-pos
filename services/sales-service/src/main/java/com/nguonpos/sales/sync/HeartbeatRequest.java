package com.nguonpos.sales.sync;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// deviceLabel: a human name for the till ("Porte A · caisse 3f2a"), shown
// in the admin presence list and the activity journal.
public record HeartbeatRequest(@NotNull UUID terminalId, @NotNull UUID gateId, int localPendingCount, String deviceLabel) {
}
