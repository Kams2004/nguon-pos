package com.nguonpos.synccore.qr;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The shared vectors were produced by the PWA's TypeScript signer; the same
 * file is checked by frontend/pos-pwa (vitest). If either side drifts, a
 * ticket printed by one kind of till would be refused by the other.
 */
class TicketSignaturesVectorTest {

    private static final File VECTORS = new File("../../docs/test-vectors/qr-v1.json");

    @TestFactory
    List<DynamicTest> sharedVectors() throws IOException {
        JsonNode root = new ObjectMapper().readTree(VECTORS);
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : root.get("valid")) {
            JsonNode p = c.get("payload");
            TicketPayload payload = new TicketPayload(p.get("v").asInt(), p.get("tid").asText(), p.get("gw").asText(),
                    p.get("tt").asText(), p.get("tx").asText(), p.get("tn").asText(), p.get("iat").asText());
            String secret = c.get("secretHex").asText();
            String qr = c.get("qr").asText();
            tests.add(DynamicTest.dynamicTest("serialises like JSON.stringify: " + payload.tn(),
                    () -> assertEquals(c.get("payloadJson").asText(), payload.toJson())));
            tests.add(DynamicTest.dynamicTest("signs identically: " + payload.tn(),
                    () -> assertEquals(qr, TicketSignatures.sign(payload, secret))));
            tests.add(DynamicTest.dynamicTest("verifies: " + payload.tn(), () -> {
                TicketSignatures.Verification v = TicketSignatures.verify(qr, secret);
                assertTrue(v.ok());
                assertEquals(payload, v.payload());
            }));
        }
        for (JsonNode c : root.get("invalid")) {
            tests.add(DynamicTest.dynamicTest("rejects: " + c.get("name").asText(), () -> {
                TicketSignatures.Verification v = TicketSignatures.verify(c.get("qr").asText(), c.get("secretHex").asText());
                assertFalse(v.ok());
                assertEquals(TicketSignatures.Reason.valueOf(c.get("reason").asText()), v.reason());
            }));
        }
        return tests;
    }
}
