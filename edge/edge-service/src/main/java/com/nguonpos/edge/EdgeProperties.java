package com.nguonpos.edge;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.List;

/**
 * @param dataDir        where the encrypted database, key material and UI token live
 * @param centralUrl     central server, e.g. https://pos.nguonevents.com (blank: never sync)
 * @param keyProvider    auto | dpapi | systemd-creds | file
 * @param allowedOrigins browser origins allowed to call the local API (the Tauri webview; Vite dev server)
 * @param syncIntervalMs pause between two sync rounds with central
 */
@ConfigurationProperties(prefix = "edge")
public record EdgeProperties(
        Path dataDir,
        String centralUrl,
        String keyProvider,
        List<String> allowedOrigins,
        long syncIntervalMs
) {
    public EdgeProperties {
        if (dataDir == null) dataDir = Path.of("data");
        if (keyProvider == null || keyProvider.isBlank()) keyProvider = "auto";
        if (allowedOrigins == null) allowedOrigins = List.of();
        if (syncIntervalMs <= 0) syncIntervalMs = 5_000;
    }

    public boolean hasCentral() {
        return centralUrl != null && !centralUrl.isBlank();
    }
}
