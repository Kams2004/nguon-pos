package com.nguonpos.sales.sync;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "terminal")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Terminal {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID gateId;

    private String deviceLabel;

    @Column(nullable = false)
    private Instant lastSeenAt;

    @Column(nullable = false)
    private int localPendingCount;

    @Column(nullable = false)
    private boolean online;

    @Column(nullable = false)
    private boolean loggedIn;

    private UUID currentUserId;

    private String currentUserName;
}
