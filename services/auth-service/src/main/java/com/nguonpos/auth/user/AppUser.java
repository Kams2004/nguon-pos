package com.nguonpos.auth.user;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AppUser {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    /**
     * The gates where this cashier/coordinator may work; empty = every gate
     * (new ones included). A till is fixed to one gate: whoever is allowed
     * there may log in on it.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_gate", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "gate_id", nullable = false)
    @Builder.Default
    private Set<UUID> gateIds = new HashSet<>();

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public boolean allowedAt(UUID gateId) {
        return gateIds.isEmpty() || gateIds.contains(gateId);
    }

    /** Sorted, for stable output. */
    public List<UUID> gateIdList() {
        return gateIds.stream().sorted().toList();
    }

    /** The one gate when there is exactly one — what older clients call "assigned gate". */
    public UUID singleGateId() {
        return gateIds.size() == 1 ? gateIds.iterator().next() : null;
    }
}
