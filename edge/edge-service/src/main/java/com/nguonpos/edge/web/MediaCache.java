package com.nguonpos.edge.web;

import com.nguonpos.edge.EdgeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The media library's images (logo, ticket banner…) for a till that prints
 * offline: fetched once from central's public /media/, kept in the till's
 * data folder, served from there afterwards. Keys are unique per upload, so
 * a kept copy never goes stale.
 */
@Component
public class MediaCache {

    private static final Logger log = LoggerFactory.getLogger(MediaCache.class);
    /** "2026/11/<uuid>.png": path segments of letters, digits, dot, dash, underscore — nothing that climbs out. */
    static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}(/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}){0,4}");
    private static final Pattern IN_TEXT = Pattern.compile("/media/(" + KEY.pattern() + ")");
    static final long MAX_BYTES = 10L * 1024 * 1024;

    private final EdgeProperties props;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ExecutorService prefetcher = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "media-prefetch");
        t.setDaemon(true);
        return t;
    });

    public MediaCache(EdgeProperties props) {
        this.props = props;
    }

    public static boolean validKey(String key) {
        return key != null && KEY.matcher(key).matches() && !key.contains("..");
    }

    /** The image, from the till's copy or fetched now (then kept). Empty when unknown and central unreachable. */
    public Optional<Path> get(String key) {
        if (!validKey(key)) return Optional.empty();
        Path file = dir().resolve(key);
        if (Files.isRegularFile(file)) return Optional.of(file);
        try {
            return Optional.of(fetch(key, file));
        } catch (IOException | RuntimeException e) {
            log.debug("Media {} unavailable: {}", key, e.getMessage());
            return Optional.empty();
        }
    }

    /** Fetches, in the background, every /media/ image a catalogue (or any text) refers to. */
    public void prefetch(String text) {
        if (text == null || !props.hasCentral()) return;
        Set<String> keys = new LinkedHashSet<>();
        Matcher m = IN_TEXT.matcher(text);
        while (m.find()) keys.add(m.group(1));
        for (String key : keys) {
            prefetcher.execute(() -> get(key));
        }
    }

    private Path fetch(String key, Path file) throws IOException {
        if (!props.hasCentral()) throw new IOException("no central");
        HttpResponse<InputStream> res;
        try {
            res = http.send(HttpRequest.newBuilder(URI.create(props.centralUrl().replaceAll("/+$", "") + "/media/" + key))
                    .timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
        if (res.statusCode() != 200) {
            res.body().close();
            throw new IOException("HTTP " + res.statusCode());
        }
        Files.createDirectories(file.getParent());
        Path part = file.resolveSibling(file.getFileName() + ".part");
        try (InputStream in = res.body()) {
            byte[] bytes = in.readNBytes((int) MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) throw new IOException("too large");
            Files.write(part, bytes);
        }
        Files.move(part, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return file;
    }

    private Path dir() {
        return props.dataDir().resolve("media");
    }

    public static String contentType(Path file) {
        String n = file.getFileName().toString().toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
}
