package com.nguonpos.sales.validation;

public enum ScanResult {
    ACCEPTED,
    REJECTED_ALREADY_REDEEMED,
    // The next two are recorded here for completeness of the enum/audit
    // trail shape even though, per docs/QR_TICKET_SPEC.md, a scan that
    // fails signature or wrong-gate verification is rejected entirely
    // client-side and is never queued for sync in the first place.
    REJECTED_INVALID_SIGNATURE,
    REJECTED_WRONG_GATE,
    // Server-side-only outcome: the ticket id wasn't found in this
    // establishment's data at all when the scan synced (distinct from the
    // client's own, more ambiguous "not recognized on this device" state).
    REJECTED_UNKNOWN_TICKET,
    // The ticket's sale was voided: the ticket no longer admits anyone.
    REJECTED_VOIDED,
    // The scan reached central before the sale that issued the ticket
    // (another till's sale not synced yet). Settled to ACCEPTED or
    // REJECTED_ALREADY_REDEEMED as soon as that sale arrives.
    PENDING_TICKET
}
