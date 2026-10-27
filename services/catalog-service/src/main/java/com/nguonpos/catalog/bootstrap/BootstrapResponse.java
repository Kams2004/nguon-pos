package com.nguonpos.catalog.bootstrap;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record BootstrapResponse(
        EstablishmentInfo establishment,
        GateInfo gate,
        List<TicketTypeInfo> ticketTypes
) {
    public record EstablishmentInfo(
            UUID id, String name, String logoUrl, String brandPrimaryColor, String brandSecondaryColor
    ) {
    }

    public record GateInfo(UUID id, String name, String code, String signingSecret) {
    }

    public record TicketTypeInfo(UUID id, String name, BigDecimal price, String currency, String printMode) {
    }
}
