package com.nguonpos.auth.user;

import java.util.UUID;

public record LoginResponse(
        String token,
        UUID userId,
        String username,
        String fullName,
        Role role,
        UUID establishmentId,
        UUID assignedGateId
) {
}
