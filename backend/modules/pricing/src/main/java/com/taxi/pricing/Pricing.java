package com.taxi.pricing;

import com.taxi.shared.GeoPoint;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

/** What other modules may ask the pricing module. */
public interface Pricing {

    /** Throws NOT_CONFIGURED when the driver has no pricing yet. */
    PricingPolicy policy(UUID driverId);

    /** Prices of the ride options (meet & greet, child seats, luggage, waiting). Throws NOT_CONFIGURED. */
    Extras extras(UUID driverId);

    /**
     * Price for a ride. A fixed zone-to-zone price wins over the formula; the van percentage applies to either;
     * surcharges are decided by the pickup time in the driver's timezone; priced extras come last.
     */
    Estimate estimate(UUID driverId, ZoneId driverZone, int distanceM, int durationS, Instant pickupAt,
                      GeoPoint pickup, GeoPoint dropoff, Options options);

    /** True when the point is inside an airport or station zone (extra waiting time at pickup). */
    boolean isAirportOrStation(GeoPoint point);

    /** Creates default (empty) pricing for a new driver. */
    void ensureSettings(UUID driverId);

    /** The ride choices that change the price. vehicle: "sedan" or "van". */
    record Options(String vehicle, int luggage, int childSeats, boolean meetGreet) {

        public static final Options NONE = new Options("sedan", 0, 0, false);

        public boolean van() {
            return "van".equals(vehicle);
        }
    }
}
