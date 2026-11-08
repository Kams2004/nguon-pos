package com.nguonpos.catalog.media;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "media")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Media {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID establishmentId;

    @Column(nullable = false, unique = true)
    private String objectKey;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false)
    private String contentType;

    @Column(nullable = false)
    private long sizeBytes;

    @Column(nullable = false)
    private String url;

    private String uploadedByName;

    @Column(nullable = false)
    private Instant createdAt;
}
