package com.nguonpos.sales.sync;

import com.nguonpos.sales.transaction.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SaleSyncRequest(
        @NotNull UUID terminalId,
        @NotNull UUID gateId,
        @NotEmpty @Valid List<SaleEntry> entries
) {
    public record SaleEntry(
            @NotNull UUID idempotencyKey,
            @NotNull PaymentMethod paymentMethod,
            @NotNull Instant createdAtClient,
            @NotEmpty @Valid List<LineEntry> lines,
            @NotEmpty @Valid List<TicketEntry> tickets
    ) {
    }

    public record LineEntry(@NotNull UUID ticketTypeId, int quantity, @NotNull BigDecimal unitPrice) {
    }

    public record TicketEntry(
            @NotNull UUID id, @NotNull UUID ticketTypeId, @NotNull String ticketNumber, @NotNull String qrSignature
    ) {
    }
}
