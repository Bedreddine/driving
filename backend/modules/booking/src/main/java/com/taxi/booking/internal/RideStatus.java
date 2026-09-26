package com.taxi.booking.internal;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/**
 * <pre>
 *   (new) ──request──▶ requested ──accept──────────▶ accepted ──complete──▶ completed
 *                        │  │                            │  ▲     └─no_show──▶ no_show
 *                        │  └─propose──▶ price_proposed ─┼──┘ (customer accepts)
 *                        │                 │  │  └─customer refuses─▶ declined_by_customer
 *                        ├─decline─────────┼──┴─driver withdraws─▶ declined
 *                        ├─deadline────────┴──▶ expired
 *                        └─customer cancel─────▶ cancelled ◀── cancel (accepted, either side)
 *   (new) ──quick-add (driver)──▶ accepted
 * </pre>
 */
enum RideStatus {
    REQUESTED,
    PRICE_PROPOSED,
    ACCEPTED,
    DECLINED,
    DECLINED_BY_CUSTOMER,
    EXPIRED,
    CANCELLED,
    COMPLETED,
    NO_SHOW;

    /** Statuses that reserve the time slot (the database refuses overlaps between them). */
    static final Set<RideStatus> HOLDS_SLOT = EnumSet.of(ACCEPTED, PRICE_PROPOSED);
    static final Set<RideStatus> OPEN = EnumSet.of(REQUESTED, PRICE_PROPOSED, ACCEPTED);

    String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    static RideStatus of(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }
}
