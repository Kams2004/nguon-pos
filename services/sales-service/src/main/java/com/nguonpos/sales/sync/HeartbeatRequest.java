package com.nguonpos.sales.sync;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record HeartbeatRequest(@NotNull UUID terminalId, @NotNull UUID gateId, int localPendingCount) {
}
