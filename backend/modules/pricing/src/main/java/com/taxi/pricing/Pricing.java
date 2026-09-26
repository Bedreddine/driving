package com.taxi.pricing;

import com.taxi.shared.GeoPoint;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

/** What other modules may ask the pricing module. */
public interface Pricing {

    /** Throws NOT_CONFIGURED when the driver has no pricing yet. */
    PricingPolicy policy(UUID driverId);

    /**
     * Price for a ride. A fixed zone-to-zone price wins over the formula; surcharges are decided
     * by the pickup time in the driver's timezone.
     */
    Estimate estimate(UUID driverId, ZoneId driverZone, int distanceM, int durationS, Instant pickupAt,
                      GeoPoint pickup, GeoPoint dropoff);

    /** True when the point is inside an airport or station zone (extra waiting time at pickup). */
    boolean isAirportOrStation(GeoPoint point);

    /** Creates default (empty) pricing for a new driver. */
    void ensureSettings(UUID driverId);
}
