package com.nguonpos.sales.sync;

import com.nguonpos.sales.transaction.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SaleSyncRequest(
        @NotNull UUID terminalId,
        @NotNull UUID gateId,
        @NotEmpty @Size(max = 500) @Valid List<SaleEntry> entries
) {
    public record SaleEntry(
            @NotNull UUID idempotencyKey,
            @NotNull PaymentMethod paymentMethod,
            @NotNull Instant createdAtClient,
            @NotEmpty @Valid List<LineEntry> lines,
            @NotEmpty @Valid List<TicketEntry> tickets
    ) {
    }

    public record LineEntry(@NotNull UUID ticketTypeId, @Positive @Max(1000) int quantity, @NotNull @PositiveOrZero BigDecimal unitPrice) {
    }

    public record TicketEntry(
            @NotNull UUID id, @NotNull UUID ticketTypeId, @NotNull @Size(max = 100) String ticketNumber,
            @NotNull @Size(max = 4000) String qrSignature
    ) {
    }
}
