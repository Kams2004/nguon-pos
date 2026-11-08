package com.nguonpos.synccore.qr;

/**
 * What a ticket QR code carries (QR v1) — see docs/QR_TICKET_SPEC.md.
 *
 * @param v   format version, 1
 * @param tid ticket id
 * @param gw  gate code: the ticket is only valid at this gate
 * @param tt  ticket type id
 * @param tx  transaction id (= the sale's idempotency key)
 * @param tn  printed ticket number
 * @param iat issue time, as the till wrote it (ISO-8601)
 */
public record TicketPayload(int v, String tid, String gw, String tt, String tx, String tn, String iat) {

    /**
     * The exact text the PWA's {@code JSON.stringify(payload)} produces —
     * same key order, same escaping — so a ticket signed here and one signed
     * by a browser till are byte-for-byte the same QR.
     */
    public String toJson() {
        StringBuilder sb = new StringBuilder(160);
        sb.append("{\"v\":").append(v);
        field(sb, "tid", tid);
        field(sb, "gw", gw);
        field(sb, "tt", tt);
        field(sb, "tx", tx);
        field(sb, "tn", tn);
        field(sb, "iat", iat);
        return sb.append('}').toString();
    }

    private static void field(StringBuilder sb, String name, String value) {
        sb.append(",\"").append(name).append("\":");
        Json.writeString(sb, value);
    }
}
