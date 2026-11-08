package com.nguonpos.catalog.media;

import com.nguonpos.catalog.audit.AuditService;
import io.jsonwebtoken.Claims;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// The media library ("Médiathèque"): logo, login background, ticket
// artwork and per-ticket-type pictures are all picked from here.
@RestController
@RequestMapping("/catalog/admin/media")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class MediaAdminController {

    private static final long MAX_BYTES = 5L * 1024 * 1024;
    // No SVG: it's served from this app's own origin and can carry script.
    private static final Map<String, String> ALLOWED = Map.of(
            "image/png", "png", "image/jpeg", "jpg", "image/webp", "webp", "image/gif", "gif"
    );
    private static final DateTimeFormatter KEY_PREFIX = DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);

    private final MediaRepository mediaRepository;
    private final MediaStorage storage;
    private final AuditService audit;

    public MediaAdminController(MediaRepository mediaRepository, MediaStorage storage, AuditService audit) {
        this.mediaRepository = mediaRepository;
        this.storage = storage;
        this.audit = audit;
    }

    @GetMapping
    public List<MediaSummary> list(@AuthenticationPrincipal Claims claims) {
        return mediaRepository.findByEstablishmentIdOrderByCreatedAtDesc(establishmentId(claims)).stream()
                .map(MediaSummary::from).toList();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public MediaSummary upload(@AuthenticationPrincipal Claims claims, @RequestParam("file") MultipartFile file) {
        String ext = ALLOWED.get(file.getContentType());
        if (ext == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Formats acceptés : PNG, JPEG, WebP, GIF.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image trop lourde (5 Mo maximum).");
        }
        Instant now = Instant.now();
        String key = KEY_PREFIX.format(now) + "/" + UUID.randomUUID() + "." + ext;
        try {
            storage.put(key, file.getInputStream(), file.getSize(), file.getContentType());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stockage des images indisponible : " + e.getMessage());
        }
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : key;
        Media media = Media.builder()
                .establishmentId(establishmentId(claims))
                .objectKey(key)
                .originalName(originalName)
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
                .url("/media/" + key)
                .uploadedByName(AuditService.actorName(claims))
                .createdAt(now)
                .build();
        mediaRepository.save(media);
        audit.record(claims, "MEDIA", "MEDIA_UPLOADED", "MEDIA", media.getId(), "Image « " + originalName + " » ajoutée à la médiathèque");
        return MediaSummary.from(media);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal Claims claims) {
        Media media = mediaRepository.findById(id)
                .filter(m -> m.getEstablishmentId().equals(establishmentId(claims)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image introuvable."));
        try {
            storage.remove(media.getObjectKey());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stockage des images indisponible : " + e.getMessage());
        }
        mediaRepository.delete(media);
        audit.record(claims, "MEDIA", "MEDIA_DELETED", "MEDIA", media.getId(), "Image « " + media.getOriginalName() + " » supprimée");
    }

    private static UUID establishmentId(Claims claims) {
        return UUID.fromString(claims.get("establishmentId", String.class));
    }

    public record MediaSummary(UUID id, String url, String originalName, String contentType, long sizeBytes, String uploadedByName, Instant createdAt) {
        static MediaSummary from(Media m) {
            return new MediaSummary(m.getId(), m.getUrl(), m.getOriginalName(), m.getContentType(), m.getSizeBytes(), m.getUploadedByName(), m.getCreatedAt());
        }
    }
}
