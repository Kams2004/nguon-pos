package com.nguonpos.catalog.gate;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "gate")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Gate {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String code;

    // HMAC secret for client-side QR signing/verification at this gate —
    // provisioned to the PWA at login, cached locally, never sent to the
    // server again. See docs/QR_TICKET_SPEC.md.
    @Column(nullable = false)
    private String signingSecret;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;
}
