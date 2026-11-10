package com.nguonpos.edge.peer;

import com.nguonpos.edge.central.Enrollment;
import com.nguonpos.edge.core.DeviceIdentity;
import org.springframework.stereotype.Component;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The till's identity on the local network: its device certificate (issued
 * at enrollment by the Nguon device CA) for mutual TLS with the other tills,
 * and the checks a peer's certificate must pass — issued by that same CA,
 * still valid, for this very gate.
 */
@Component
public class PeerCredentials {

    private final Enrollment enrollment;
    private final DeviceIdentity device;

    private volatile String builtFor;
    private volatile SSLContext context;

    public PeerCredentials(Enrollment enrollment, DeviceIdentity device) {
        this.enrollment = enrollment;
        this.device = device;
    }

    public boolean ready() {
        return enrollment.enrolled() && enrollment.chainPem().isPresent();
    }

    /** This till's gate, from its own certificate. */
    public Optional<String> gateId() {
        return enrollment.certificatePem().flatMap(pem -> identity(parse(pem)).map(Identity::gateId));
    }

    /** Fingerprint of the certificate in use, to notice a new one (re-enrollment). */
    public String version() {
        return enrollment.certificatePem().map(p -> Integer.toHexString(p.hashCode())).orElse("none");
    }

    /** TLS with this till's certificate, trusting only the Nguon device CA. */
    public synchronized SSLContext sslContext() throws GeneralSecurityException {
        String v = version();
        if (context != null && v.equals(builtFor)) return context;
        try {
            List<X509Certificate> cas = caChain();
            List<java.security.cert.Certificate> chain = new ArrayList<>();
            chain.add(parse(enrollment.certificatePem().orElseThrow()));
            chain.addAll(cas);
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(null, null);
            char[] pass = UUID.randomUUID().toString().toCharArray();
            ks.setKeyEntry("device", device.keyPair().getPrivate(), pass, chain.toArray(java.security.cert.Certificate[]::new));
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, pass);
            KeyStore trust = KeyStore.getInstance("PKCS12");
            trust.load(null, null);
            int i = 0;
            for (X509Certificate ca : cas) trust.setCertificateEntry("nguon-ca-" + i++, ca);
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(trust);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);
            context = ctx;
            builtFor = v;
            return ctx;
        } catch (java.io.IOException e) {
            throw new GeneralSecurityException(e);
        }
    }

    public String certificatePem() {
        return enrollment.certificatePem().orElseThrow();
    }

    /**
     * A peer's (or a relayed record's) certificate: issued by our CA, valid
     * now, and for our gate. Returns who it is, or empty when any check fails.
     */
    public Optional<Identity> verify(X509Certificate cert) {
        try {
            cert.checkValidity();
            boolean issuedByOurCa = false;
            for (X509Certificate ca : caChain()) {
                if (ca.getSubjectX500Principal().equals(cert.getIssuerX500Principal())) {
                    cert.verify(ca.getPublicKey());
                    issuedByOurCa = true;
                }
            }
            if (!issuedByOurCa) return Optional.empty();
            Optional<Identity> id = identity(cert);
            Optional<String> ourGate = gateId();
            if (id.isEmpty() || ourGate.isEmpty() || !id.get().gateId().equals(ourGate.get())) return Optional.empty();
            return id;
        } catch (GeneralSecurityException | RuntimeException e) {
            return Optional.empty();
        }
    }

    public Optional<Identity> verifyPem(String pem) {
        try {
            return verify(parse(pem));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /** Device and gate from the certificate's names (urn:nguon:device:…, urn:nguon:gate:…). */
    static Optional<Identity> identity(X509Certificate cert) {
        try {
            String deviceId = null, gateId = null;
            Collection<List<?>> sans = cert.getSubjectAlternativeNames();
            if (sans == null) return Optional.empty();
            for (List<?> san : sans) {
                if (!Integer.valueOf(6).equals(san.get(0))) continue; // URI
                String uri = String.valueOf(san.get(1));
                if (uri.startsWith("urn:nguon:device:")) deviceId = uri.substring("urn:nguon:device:".length());
                if (uri.startsWith("urn:nguon:gate:")) gateId = uri.substring("urn:nguon:gate:".length());
            }
            return deviceId == null || gateId == null ? Optional.empty() : Optional.of(new Identity(deviceId, gateId));
        } catch (GeneralSecurityException e) {
            return Optional.empty();
        }
    }

    private List<X509Certificate> caChain() throws GeneralSecurityException {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        List<X509Certificate> out = new ArrayList<>();
        String pem = enrollment.chainPem().orElse("");
        for (var c : cf.generateCertificates(new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)))) {
            out.add((X509Certificate) c);
        }
        return out;
    }

    public static X509Certificate parse(String pem) {
        try {
            return (X509Certificate) CertificateFactory.getInstance("X.509")
                    .generateCertificate(new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException(e);
        }
    }

    public static String toPem(X509Certificate cert) {
        try {
            return "-----BEGIN CERTIFICATE-----\n" + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(cert.getEncoded())
                    + "\n-----END CERTIFICATE-----\n";
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException(e);
        }
    }

    public record Identity(String deviceId, String gateId) {
    }
}
