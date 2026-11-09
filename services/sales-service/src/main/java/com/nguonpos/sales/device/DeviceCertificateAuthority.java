package com.nguonpos.sales.device;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMWriter;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaContentVerifierProviderBuilder;
import org.bouncycastle.pkcs.PKCS10CertificationRequest;
import org.bouncycastle.pkcs.jcajce.JcaPKCS10CertificationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Issues the tills' certificates. The issuing CA's certificate and key are
 * mounted from {@code DEVICE_CA_DIR} (a docker secret on the VPS):
 * issuing-ca.crt, issuing-ca.key (PKCS#8 PEM) and ca-chain.pem (issuing +
 * offline root). Without them enrollment is simply unavailable.
 */
@Component
public class DeviceCertificateAuthority {

    private static final Logger log = LoggerFactory.getLogger(DeviceCertificateAuthority.class);
    static final Duration VALIDITY = Duration.ofDays(365);

    private final X509Certificate issuer;
    private final PrivateKey issuerKey;
    private final String chainPem;
    private final SecureRandom random = new SecureRandom();

    public DeviceCertificateAuthority(@Value("${device-ca.dir:/run/secrets/device-ca}") Path dir) {
        X509Certificate cert = null;
        PrivateKey key = null;
        String chain = null;
        if (Files.isReadable(dir.resolve("issuing-ca.crt")) && Files.isReadable(dir.resolve("issuing-ca.key"))) {
            try {
                cert = parseCertificate(Files.readString(dir.resolve("issuing-ca.crt")));
                key = parsePrivateKey(Files.readString(dir.resolve("issuing-ca.key")), cert.getPublicKey().getAlgorithm());
                Path chainFile = dir.resolve("ca-chain.pem");
                chain = Files.isReadable(chainFile) ? Files.readString(chainFile) : toPem(cert);
                log.info("Device CA loaded: {}", cert.getSubjectX500Principal().getName());
            } catch (IOException | GeneralSecurityException e) {
                throw new IllegalStateException("Unreadable device CA in " + dir, e);
            }
        } else {
            log.warn("No device CA in {}: desktop tills cannot be enrolled", dir);
        }
        this.issuer = cert;
        this.issuerKey = key;
        this.chainPem = chain;
    }

    public boolean configured() {
        return issuer != null;
    }

    public String chainPem() {
        return chainPem;
    }

    /** Checks a till's certificate request: well-formed and signed by the key it carries. */
    public PublicKey verifiedPublicKey(String csrPem) {
        try (PEMParser p = new PEMParser(new StringReader(csrPem))) {
            Object o = p.readObject();
            if (!(o instanceof PKCS10CertificationRequest csr)) throw new IllegalArgumentException("Not a certificate request");
            JcaPKCS10CertificationRequest jca = new JcaPKCS10CertificationRequest(csr);
            if (!csr.isSignatureValid(new JcaContentVerifierProviderBuilder().build(csr.getSubjectPublicKeyInfo()))) {
                throw new IllegalArgumentException("Certificate request signature invalid");
            }
            PublicKey key = jca.getPublicKey();
            if (!key.getAlgorithm().equals("EC")) throw new IllegalArgumentException("Device keys must be EC P-256");
            return key;
        } catch (IOException | GeneralSecurityException | org.bouncycastle.operator.OperatorCreationException
                 | org.bouncycastle.pkcs.PKCSException e) {
            throw new IllegalArgumentException("Unreadable certificate request", e);
        }
    }

    /** A one-year client/server certificate naming the device, its gate and its establishment. */
    public X509Certificate issue(UUID deviceId, UUID gateId, UUID establishmentId, PublicKey devicePublicKey) {
        if (!configured()) throw new IllegalStateException("Device CA not configured");
        try {
            Instant now = Instant.now();
            JcaX509v3CertificateBuilder b = new JcaX509v3CertificateBuilder(
                    issuer, new BigInteger(127, random), Date.from(now.minus(Duration.ofMinutes(5))), Date.from(now.plus(VALIDITY)),
                    new X500Name("CN=" + deviceId + ",O=Nguon POS"), devicePublicKey);
            JcaX509ExtensionUtils ext = new JcaX509ExtensionUtils();
            b.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));
            b.addExtension(Extension.keyUsage, true, new KeyUsage(KeyUsage.digitalSignature));
            b.addExtension(Extension.extendedKeyUsage, false,
                    new ExtendedKeyUsage(new KeyPurposeId[]{KeyPurposeId.id_kp_clientAuth, KeyPurposeId.id_kp_serverAuth}));
            b.addExtension(Extension.subjectAlternativeName, false, new GeneralNames(new GeneralName[]{
                    new GeneralName(GeneralName.uniformResourceIdentifier, "urn:nguon:device:" + deviceId),
                    new GeneralName(GeneralName.uniformResourceIdentifier, "urn:nguon:gate:" + gateId),
                    new GeneralName(GeneralName.uniformResourceIdentifier, "urn:nguon:est:" + establishmentId)}));
            b.addExtension(Extension.authorityKeyIdentifier, false, ext.createAuthorityKeyIdentifier(issuer));
            b.addExtension(Extension.subjectKeyIdentifier, false, ext.createSubjectKeyIdentifier(devicePublicKey));
            String alg = issuerKey.getAlgorithm().equals("EC") ? "SHA256withECDSA" : "SHA256withRSA";
            return new JcaX509CertificateConverter().getCertificate(b.build(new JcaContentSignerBuilder(alg).build(issuerKey)));
        } catch (GeneralSecurityException | IOException | org.bouncycastle.operator.OperatorCreationException e) {
            throw new IllegalStateException("Could not sign device certificate", e);
        }
    }

    /** True if `cert` was signed by this CA and is within its validity — re-checked here, not only by nginx. */
    public boolean issuedHere(X509Certificate cert) {
        if (!configured()) return false;
        try {
            cert.checkValidity();
            cert.verify(issuer.getPublicKey());
            return true;
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    public static X509Certificate parseCertificate(String pem) throws GeneralSecurityException {
        return (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)));
    }

    public static String fingerprint(X509Certificate cert) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String toPem(Object o) {
        StringWriter w = new StringWriter();
        try (JcaPEMWriter pw = new JcaPEMWriter(w)) {
            pw.writeObject(o);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return w.toString();
    }

    private static PrivateKey parsePrivateKey(String pem, String algorithm) throws GeneralSecurityException {
        String b64 = pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        return KeyFactory.getInstance(algorithm).generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(b64)));
    }
}
