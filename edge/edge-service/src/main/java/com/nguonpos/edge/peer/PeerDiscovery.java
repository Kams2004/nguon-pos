package com.nguonpos.edge.peer;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.DeviceIdentity;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * How the tills of a gate find each other on the LAN without central:
 * every 10 s each one broadcasts "I am till X of gate G, peer port P" (UDP
 * 47311) and listens for the others. The announcement is only a hint —
 * talking to a peer still takes its certificate (PeerSync checks it).
 * Central also passes on each till's addresses, for networks that drop
 * broadcasts, and edge.peers lists fixed ones.
 */
@Component
public class PeerDiscovery {

    private static final Logger log = LoggerFactory.getLogger(PeerDiscovery.class);

    private final EdgeProperties props;
    private final PeerCredentials credentials;
    private final PeerStore store;
    private final DeviceIdentity device;
    private final JsonMapper json;
    private volatile DatagramSocket socket;
    private Thread listener;

    public PeerDiscovery(EdgeProperties props, PeerCredentials credentials, PeerStore store, DeviceIdentity device, JsonMapper json) {
        this.props = props;
        this.credentials = credentials;
        this.store = store;
        this.device = device;
        this.json = json;
    }

    @PostConstruct
    void start() {
        if (props.beaconPort() <= 0 || props.peerPort() <= 0) return;
        try {
            DatagramSocket s = new DatagramSocket(null);
            s.setReuseAddress(true);
            s.setBroadcast(true);
            s.bind(new InetSocketAddress(props.beaconPort()));
            socket = s;
            listener = new Thread(this::listen, "peer-discovery");
            listener.setDaemon(true);
            listener.start();
        } catch (SocketException e) {
            log.warn("LAN announcements unavailable on UDP {}: {}", props.beaconPort(), e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 10_000, initialDelay = 4_000)
    public void announce() {
        DatagramSocket s = socket;
        if (s == null || !credentials.ready()) return;
        var gate = credentials.gateId();
        if (gate.isEmpty()) return;
        byte[] msg = json.writeValueAsBytes(Map.of("t", "nguon-peer", "v", 1, "deviceId", device.deviceId().toString(),
                "gateId", gate.get(), "port", props.peerPort()));
        for (InetAddress to : broadcastAddresses()) {
            try {
                s.send(new DatagramPacket(msg, msg.length, to, props.beaconPort()));
            } catch (Exception e) {
                log.debug("Announcement to {} failed: {}", to, e.getMessage());
            }
        }
    }

    private void listen() {
        byte[] buf = new byte[1024];
        while (socket != null && !socket.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                JsonNode m = json.readTree(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                if (!"nguon-peer".equals(m.path("t").asString(""))) continue;
                String id = m.path("deviceId").asString(""), gate = m.path("gateId").asString("");
                int port = m.path("port").asInt(0);
                if (id.isEmpty() || id.equals(device.deviceId().toString()) || port <= 0 || port > 65535) continue;
                if (!credentials.gateId().map(gate::equals).orElse(false)) continue;
                if (store.revoked(id)) continue;
                store.upsertAddress(id, null, p.getAddress().getHostAddress() + ":" + port, "BROADCAST");
            } catch (Exception e) {
                if (socket == null || socket.isClosed()) return;
                log.debug("Ignored announcement: {}", e.getMessage());
            }
        }
    }

    /** This till's addresses on its LANs (private IPv4), as host:peerPort — reported to central for the other tills. */
    public List<String> lanAddresses() {
        if (props.peerPort() <= 0) return List.of();
        Set<String> out = new LinkedHashSet<>();
        for (InterfaceAddress ia : interfaceAddresses()) {
            if (ia.getAddress() instanceof Inet4Address a && a.isSiteLocalAddress()) out.add(a.getHostAddress() + ":" + props.peerPort());
        }
        return new ArrayList<>(out);
    }

    private List<InetAddress> broadcastAddresses() {
        Set<InetAddress> out = new LinkedHashSet<>();
        for (InterfaceAddress ia : interfaceAddresses()) {
            if (ia.getBroadcast() != null) out.add(ia.getBroadcast());
        }
        if (out.isEmpty()) {
            try {
                out.add(InetAddress.getByName("255.255.255.255"));
            } catch (Exception ignored) {
                // none
            }
        }
        return new ArrayList<>(out);
    }

    private static List<InterfaceAddress> interfaceAddresses() {
        List<InterfaceAddress> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual() || ni.getName().startsWith("docker") || ni.getName().startsWith("br-")
                        || ni.getName().startsWith("veth")) continue;
                out.addAll(ni.getInterfaceAddresses());
            }
        } catch (SocketException e) {
            // no interfaces readable
        }
        return out;
    }

    @PreDestroy
    void stop() {
        DatagramSocket s = socket;
        socket = null;
        if (s != null) s.close();
    }
}
