package com.nguonpos.catalog.media;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MediaRepository extends JpaRepository<Media, UUID> {
    List<Media> findByEstablishmentIdOrderByCreatedAtDesc(UUID establishmentId);
}
