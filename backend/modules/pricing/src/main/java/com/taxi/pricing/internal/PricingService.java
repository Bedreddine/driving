package com.taxi.pricing.internal;

import com.taxi.pricing.Estimate;
import com.taxi.pricing.Pricing;
import com.taxi.pricing.PricingPolicy;
import com.taxi.pricing.PricingPolicy.Licence;
import com.taxi.shared.ApiException;
import com.taxi.shared.GeoPoint;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class PricingService implements Pricing {

    private final PricingRepository repo;

    PricingService(PricingRepository repo) {
        this.repo = repo;
    }

    @Override
    @Transactional(readOnly = true)
    public PricingPolicy policy(UUID driverId) {
        var s = settings(driverId);
        return new PricingPolicy(Licence.valueOf(s.licence().toUpperCase(Locale.ROOT)), s.currency(),
                s.airportWaitMinutes(), s.meetGreetMinutes(), s.minGapMinutes(), s.leadTimeMinutes());
    }

    @Override
    @Transactional(readOnly = true)
    public Estimate estimate(UUID driverId, ZoneId driverZone, int distanceM, int durationS, Instant pickupAt,
                             GeoPoint pickup, GeoPoint dropoff) {
        var s = settings(driverId);
        var windows = repo.surcharges(driverId).stream()
                .map(x -> new PriceCalculator.SurchargeWindow(Set.copyOf(x.days()), x.startTime(), x.endTime(), x.percent()))
                .toList();
        var percent = PriceCalculator.largestSurcharge(windows, pickupAt.atZone(driverZone));

        var zones = repo.zones();
        var atPickup = zoneIds(zones, pickup);
        var atDropoff = zoneIds(zones, dropoff);
        var fixed = repo.fixedPrices(driverId).stream()
                .filter(f -> (atPickup.contains(f.fromZone()) && atDropoff.contains(f.toZone()))
                        || (f.bothDirections() && atPickup.contains(f.toZone()) && atDropoff.contains(f.fromZone())))
                .min(Comparator.comparing(PricingRepository.FixedPrice::price));
        if (fixed.isPresent()) {
            var f = fixed.get();
            var price = PriceCalculator.withSurcharge(f.price(), f.surchargesApply() ? percent : BigDecimal.ZERO);
            return new Estimate(price, true, s.currency());
        }

        var rates = new PriceCalculator.Rates(s.baseFare(), s.perKm(), s.perMinute(), s.minimumFare());
        var price = PriceCalculator.withSurcharge(PriceCalculator.formula(rates, distanceM, durationS), percent);
        return new Estimate(price, false, s.currency());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isAirportOrStation(GeoPoint point) {
        return repo.zones().stream()
                .anyMatch(z -> ("airport".equals(z.kind()) || "station".equals(z.kind())) && contains(z, point));
    }

    @Override
    @Transactional
    public void ensureSettings(UUID driverId) {
        repo.ensureSettings(driverId);
    }

    private PricingRepository.Settings settings(UUID driverId) {
        return repo.settings(driverId).orElseThrow(() -> ApiException.badRequest("NOT_CONFIGURED"));
    }

    private static Set<UUID> zoneIds(List<PricingRepository.Zone> zones, GeoPoint p) {
        return zones.stream().filter(z -> contains(z, p)).map(PricingRepository.Zone::id)
                .collect(Collectors.toCollection(HashSet::new));
    }

    static boolean contains(PricingRepository.Zone z, GeoPoint p) {
        return new GeoPoint(z.centerLat(), z.centerLng()).distanceTo(p) <= z.radiusM();
    }
}
