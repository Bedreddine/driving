package com.taxi.pricing;

/**
 * The driver's commercial rules used when booking.
 *
 * @param licence            VTC (price agreed in advance) or TAXI (meter decides, no price proposals)
 * @param airportWaitMinutes time kept free at airport/station pickups (delays, baggage)
 * @param meetGreetMinutes   extra time for a meet & greet with a sign
 * @param minGapMinutes      minimum gap between the end of one ride and the next pickup
 * @param leadTimeMinutes    how far ahead customers must book in the app
 */
public record PricingPolicy(Licence licence, String currency, int airportWaitMinutes, int meetGreetMinutes,
                            int minGapMinutes, int leadTimeMinutes) {

    public enum Licence {
        VTC,
        TAXI;

        public String value() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }
}
