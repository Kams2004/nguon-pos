package com.nguonpos.auth.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
    Optional<AppUser> findByUsernameAndActiveTrue(String username);

    boolean existsByUsername(String username);

    List<AppUser> findByEstablishmentIdOrderByFullNameAsc(UUID establishmentId);
}
