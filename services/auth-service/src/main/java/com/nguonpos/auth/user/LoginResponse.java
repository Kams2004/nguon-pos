package com.nguonpos.auth.user;

import java.util.List;
import java.util.UUID;

public record LoginResponse(
        String token,
        UUID userId,
        String username,
        String fullName,
        Role role,
        UUID establishmentId,
        /** The one allowed gate, when there is exactly one (older clients). */
        UUID assignedGateId,
        /** Gates where this user may work; empty = every gate. */
        List<UUID> gateIds
) {
}
