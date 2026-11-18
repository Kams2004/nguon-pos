package com.nguonpos.edge.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * The media library's images for the till's screens and printouts (logo,
 * ticket banner), from the till's own copy — so tickets print complete
 * offline. Public content, like central's /media/: no token needed, and the
 * server only listens on this machine.
 */
@RestController
public class MediaController {

    private final MediaCache cache;

    public MediaController(MediaCache cache) {
        this.cache = cache;
    }

    @GetMapping("/media/**")
    public ResponseEntity<Resource> media(HttpServletRequest req) {
        String key = req.getRequestURI().substring("/media/".length());
        return cache.get(key)
                .map(f -> ResponseEntity.ok()
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(1)))
                        .contentType(MediaType.parseMediaType(MediaCache.contentType(f)))
                        .<Resource>body(new FileSystemResource(f)))
                .orElse(ResponseEntity.notFound().build());
    }
}
