package com.nguonpos.sales.release;

import com.nguonpos.sales.edgesync.EdgeSessions;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** "Versions": desktop till releases and the establishment's deployment choice. */
@RestController
@RequestMapping("/sales/admin/releases")
public class ReleaseAdminController {

    private final Releases releases;
    private final EdgeSessions sessions;

    public ReleaseAdminController(Releases releases, EdgeSessions sessions) {
        this.releases = releases;
        this.sessions = sessions;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'COORDINATOR')")
    public Map<String, Object> list(@AuthenticationPrincipal Claims claims) {
        UUID est = establishmentOf(claims);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("releases", releases.all());
        m.put("targetVersion", releases.target(est).orElse(null));
        return m;
    }

    /** {"version": "0.2.0"} publishes it to the tills; {"version": null} freezes them. */
    @PutMapping("/target")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public Map<String, Object> setTarget(@AuthenticationPrincipal Claims claims, @Valid @RequestBody TargetRequest req) {
        UUID est = establishmentOf(claims);
        releases.setTarget(est, req.version(), claims);
        sessions.releaseChanged(est);
        return list(claims);
    }

    private static UUID establishmentOf(Claims claims) {
        return UUID.fromString(claims.get("establishmentId", String.class));
    }

    public record TargetRequest(@Size(max = 40) @Pattern(regexp = "[0-9A-Za-z.+-]+") String version) {
    }
}
