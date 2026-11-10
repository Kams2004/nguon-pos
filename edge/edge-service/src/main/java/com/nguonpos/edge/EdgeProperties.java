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
 * @param channelUrl     wss URL of the tills' live channel (default: wss://edge.<central host>/edge/v1/ws)
 * @param channelCaFile  extra CA (PEM) to trust for the channel's server certificate — local tests only
 * @param peerPort       TLS port other tills of the gate sync with over the LAN (0: no peer sync)
 * @param beaconPort     UDP port of the LAN announcements that let tills find each other (0: none)
 * @param peers          extra peer addresses (host:port), for networks that block broadcasts
 */
@ConfigurationProperties(prefix = "edge")
public record EdgeProperties(
        Path dataDir,
        String centralUrl,
        String keyProvider,
        List<String> allowedOrigins,
        long syncIntervalMs,
        String channelUrl,
        Path channelCaFile,
        Integer peerPort,
        Integer beaconPort,
        List<String> peers
) {
    public EdgeProperties {
        if (dataDir == null) dataDir = Path.of("data");
        if (keyProvider == null || keyProvider.isBlank()) keyProvider = "auto";
        if (allowedOrigins == null) allowedOrigins = List.of();
        if (syncIntervalMs <= 0) syncIntervalMs = 5_000;
        if (peerPort == null) peerPort = 47310;
        if (beaconPort == null) beaconPort = 47311;
        if (peers == null) peers = List.of();
    }

    /** The certificate-guarded live channel; derived from the central URL unless set. */
    public String channelWebSocketUrl() {
        if (channelUrl != null && !channelUrl.isBlank()) return channelUrl;
        if (!hasCentral()) return null;
        String host = java.net.URI.create(centralUrl).getHost();
        return "wss://edge." + host + "/edge/v1/ws";
    }

    public boolean hasCentral() {
        return centralUrl != null && !centralUrl.isBlank();
    }
}
