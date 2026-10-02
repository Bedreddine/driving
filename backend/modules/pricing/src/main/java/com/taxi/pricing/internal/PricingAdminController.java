package com.taxi.pricing.internal;

import com.taxi.pricing.Estimate;
import com.taxi.pricing.Pricing;
import com.taxi.pricing.TripPlanner;
import com.taxi.shared.ApiException;
import com.taxi.shared.GeoPoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Back office: prices, zones, fixed prices, surcharges, price simulator. /api/admin/** requires the admin role. */
@RestController
class PricingAdminController {

    /**
     * The newer fields (distance tiers, van, extras) may be missing: the saved values are then kept, so an older
     * app cannot wipe them. distance_tiers, when present, replaces the whole list.
     */
    record SettingsBody(
            @NotNull @Pattern(regexp = "vtc|taxi") String licence,
            @NotNull @DecimalMin("0") BigDecimal baseFare,
            @NotNull @DecimalMin("0") BigDecimal perKm,
            @NotNull @DecimalMin("0") BigDecimal perMinute,
            @NotNull @DecimalMin("0") BigDecimal minimumFare,
            @Min(0) @Max(600) int airportWaitMinutes,
            @Min(0) @Max(240) int meetGreetMinutes,
            @Min(0) @Max(240) int minGapMinutes,
            @Min(0) @Max(10080) int leadTimeMinutes,
            @Size(max = 5) List<@NotNull @Valid TierBody> distanceTiers,
            @Min(50) @Max(300) Integer vanPercent,
            @DecimalMin("0") BigDecimal meetGreetFee,
            @DecimalMin("0") BigDecimal childSeatFee,
            @Min(0) @Max(20) Integer includedLuggage,
            @DecimalMin("0") BigDecimal extraLuggageFee,
            @DecimalMin("0") BigDecimal waitingPerMinute) {}

    record TierBody(@NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("10000") BigDecimal fromKm,
                    @NotNull @DecimalMin("0") BigDecimal perKm) {}

    record Point(@NotNull @Min(-90) @Max(90) Double lat, @NotNull @Min(-180) @Max(180) Double lng) {}

    /** A price check with the saved settings, or with unsaved values to try (settings). Nothing is saved. */
    record SimulateBody(@NotNull @Valid Point pickup, @NotNull @Valid Point dropoff, @NotNull Instant pickupAt,
                        @Pattern(regexp = "sedan|van") String vehicle, @Min(0) @Max(50) Integer luggage,
                        @Min(0) @Max(3) Integer childSeats, Boolean meetGreet, @Valid SettingsBody settings) {}

    /** @param route the road as [lng, lat] points, or null when the map server did not answer (estimates) */
    record Simulation(BigDecimal estimate, String currency, boolean isFixed, int distanceM, int durationS,
                      List<double[]> route, boolean routeEstimated, List<Estimate.Line> breakdown) {}

    record ZoneBody(@NotBlank @Size(max = 100) String name, @NotNull @Pattern(regexp = "airport|station|other") String kind,
                    @Min(-90) @Max(90) double centerLat, @Min(-180) @Max(180) double centerLng,
                    @Min(1) @Max(100_000) int radiusM) {}

    record FixedPriceBody(@NotNull UUID fromZone, @NotNull UUID toZone, @NotNull @DecimalMin("0") BigDecimal price,
                          Boolean bothDirections, Boolean surchargesApply) {}

    record SurchargeBody(@NotBlank @Size(max = 100) String name, @NotEmpty Set<@Min(0) @Max(6) Integer> days,
                         @NotNull LocalTime startTime, @NotNull LocalTime endTime,
                         @NotNull @DecimalMin("0") @DecimalMax("500") BigDecimal percent) {}

    private final PricingRepository repo;
    private final PricingService pricing;
    private final TripPlanner planner;

    PricingAdminController(PricingRepository repo, PricingService pricing, TripPlanner planner) {
        this.repo = repo;
        this.pricing = pricing;
        this.planner = planner;
    }

    @GetMapping("/api/admin/pricing/{driverId}")
    Map<String, Object> all(@PathVariable UUID driverId) {
        var settings = repo.settings(driverId).orElseThrow(ApiException::notFound);
        return Map.of(
                "settings", settings,
                "zones", repo.zones(),
                "fixed_prices", repo.fixedPrices(driverId),
                "surcharges", repo.surcharges(driverId));
    }

    @PutMapping("/api/admin/pricing/{driverId}/settings")
    @Transactional
    PricingRepository.Settings updateSettings(@PathVariable UUID driverId, @RequestBody @Valid SettingsBody b) {
        var current = repo.settings(driverId).orElseThrow(ApiException::notFound);
        var updated = merge(current, b);
        repo.updateSettings(updated);
        return updated;
    }

    /** What a ride would cost, with the saved settings or unsaved ones. Ignores hours and availability. */
    @PostMapping("/api/admin/pricing/{driverId}/simulate")
    Simulation simulate(@PathVariable UUID driverId, @RequestBody @Valid SimulateBody b) {
        var current = repo.settings(driverId).orElseThrow(ApiException::notFound);
        var settings = b.settings() == null ? current : merge(current, b.settings());
        var zone = planner.driverZone(driverId).orElseThrow(ApiException::notFound);
        var pickup = new GeoPoint(b.pickup().lat(), b.pickup().lng());
        var dropoff = new GeoPoint(b.dropoff().lat(), b.dropoff().lng());
        var road = planner.route(pickup, dropoff);
        var options = new Pricing.Options(b.vehicle() == null ? "sedan" : b.vehicle(),
                b.luggage() == null ? 0 : b.luggage(), b.childSeats() == null ? 0 : b.childSeats(),
                Boolean.TRUE.equals(b.meetGreet()));
        var e = pricing.estimate(settings, zone, road.distanceM(), road.durationS(), b.pickupAt(), pickup, dropoff,
                options);
        return new Simulation(e.price(), e.currency(), e.fixed(), road.distanceM(), road.durationS(), road.path(),
                road.estimated(), e.breakdown());
    }

    /** The saved settings with the body's values; money is rounded to cents like the database does. */
    private static PricingRepository.Settings merge(PricingRepository.Settings c, SettingsBody b) {
        return new PricingRepository.Settings(c.driverId(), b.licence(), c.currency(), money(b.baseFare()),
                money(b.perKm()), money(b.perMinute()), money(b.minimumFare()), b.airportWaitMinutes(),
                b.meetGreetMinutes(), b.minGapMinutes(), b.leadTimeMinutes(),
                b.distanceTiers() == null ? c.distanceTiers() : tiers(b.distanceTiers()),
                b.vanPercent() == null ? c.vanPercent() : b.vanPercent(),
                b.meetGreetFee() == null ? c.meetGreetFee() : money(b.meetGreetFee()),
                b.childSeatFee() == null ? c.childSeatFee() : money(b.childSeatFee()),
                b.includedLuggage() == null ? c.includedLuggage() : b.includedLuggage(),
                b.extraLuggageFee() == null ? c.extraLuggageFee() : money(b.extraLuggageFee()),
                b.waitingPerMinute() == null ? c.waitingPerMinute() : money(b.waitingPerMinute()));
    }

    /** Sorted by from_km; two tiers starting at the same km are refused. */
    private static List<PricingRepository.DistanceTier> tiers(List<TierBody> body) {
        var tiers = body.stream()
                .map(t -> new PricingRepository.DistanceTier(t.fromKm().setScale(3, RoundingMode.HALF_UP), money(t.perKm())))
                .sorted(Comparator.comparing(PricingRepository.DistanceTier::fromKm))
                .toList();
        for (int i = 0; i < tiers.size(); i++) {
            var from = tiers.get(i).fromKm();
            if (from.signum() <= 0 || (i > 0 && from.compareTo(tiers.get(i - 1).fromKm()) == 0)) {
                throw ApiException.badRequest("BAD_INPUT");
            }
        }
        return tiers;
    }

    private static BigDecimal money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    @PostMapping("/api/admin/zones")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, UUID> addZone(@RequestBody @Valid ZoneBody b) {
        return Map.of("id", repo.insertZone(b.name().trim(), b.kind(), b.centerLat(), b.centerLng(), b.radiusM()));
    }

    @DeleteMapping("/api/admin/zones/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteZone(@PathVariable UUID id) {
        if (!repo.deleteZone(id)) {
            throw ApiException.notFound();
        }
    }

    @PostMapping("/api/admin/pricing/{driverId}/fixed-prices")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, UUID> addFixedPrice(@PathVariable UUID driverId, @RequestBody @Valid FixedPriceBody b) {
        var zones = repo.zones().stream().map(PricingRepository.Zone::id).toList();
        if (!zones.containsAll(List.of(b.fromZone(), b.toZone()))) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        return Map.of("id", repo.insertFixedPrice(driverId, b.fromZone(), b.toZone(), b.price(),
                b.bothDirections() == null || b.bothDirections(), Boolean.TRUE.equals(b.surchargesApply())));
    }

    @DeleteMapping("/api/admin/fixed-prices/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteFixedPrice(@PathVariable UUID id) {
        if (!repo.deleteFixedPrice(id)) {
            throw ApiException.notFound();
        }
    }

    @PostMapping("/api/admin/pricing/{driverId}/surcharges")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, UUID> addSurcharge(@PathVariable UUID driverId, @RequestBody @Valid SurchargeBody b) {
        if (b.startTime().equals(b.endTime())) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        return Map.of("id", repo.insertSurcharge(driverId, b.name().trim(), b.days(), b.startTime(), b.endTime(), b.percent()));
    }

    @DeleteMapping("/api/admin/surcharges/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteSurcharge(@PathVariable UUID id) {
        if (!repo.deleteSurcharge(id)) {
            throw ApiException.notFound();
        }
    }
}
