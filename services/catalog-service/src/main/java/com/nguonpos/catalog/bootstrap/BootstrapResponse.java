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
            UUID id, String name, String logoUrl, String brandPrimaryColor, String brandSecondaryColor,
            String ticketTitle, String ticketSubtitle, String ticketTagline, String ticketLocation, String ticketFooter,
            String ticketBannerUrl, String receiptFooter, String ticketOptions, String receiptOptions,
            String receiptMode // STANDARD | INDIVIDUAL_TICKETS | CONFIGURABLE_PER_TICKET_TYPE
    ) {
    }

    public record GateInfo(UUID id, String name, String code, String signingSecret) {
    }

    public record TicketTypeInfo(UUID id, String name, BigDecimal price, String currency, String printMode, String icon, String color) {
    }
}
