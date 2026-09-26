package com.taxi.pricing.internal;

import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Back office: prices, zones, fixed prices, surcharges. /api/admin/** requires the admin role. */
@RestController
class PricingAdminController {

    record SettingsBody(
            @NotNull @Pattern(regexp = "vtc|taxi") String licence,
            @NotNull @DecimalMin("0") BigDecimal baseFare,
            @NotNull @DecimalMin("0") BigDecimal perKm,
            @NotNull @DecimalMin("0") BigDecimal perMinute,
            @NotNull @DecimalMin("0") BigDecimal minimumFare,
            @Min(0) @Max(600) int airportWaitMinutes,
            @Min(0) @Max(240) int meetGreetMinutes,
            @Min(0) @Max(240) int minGapMinutes,
            @Min(0) @Max(10080) int leadTimeMinutes) {}

    record ZoneBody(@NotBlank @Size(max = 100) String name, @NotNull @Pattern(regexp = "airport|station|other") String kind,
                    @Min(-90) @Max(90) double centerLat, @Min(-180) @Max(180) double centerLng,
                    @Min(1) @Max(100_000) int radiusM) {}

    record FixedPriceBody(@NotNull UUID fromZone, @NotNull UUID toZone, @NotNull @DecimalMin("0") BigDecimal price,
                          Boolean bothDirections, Boolean surchargesApply) {}

    record SurchargeBody(@NotBlank @Size(max = 100) String name, @NotEmpty Set<@Min(0) @Max(6) Integer> days,
                         @NotNull LocalTime startTime, @NotNull LocalTime endTime,
                         @NotNull @DecimalMin("0") @jakarta.validation.constraints.DecimalMax("500") BigDecimal percent) {}

    private final PricingRepository repo;

    PricingAdminController(PricingRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/api/admin/pricing/{driverId}")
    Map<String, Object> all(@PathVariable UUID driverId) {
        var settings = repo.settings(driverId).orElseThrow(ApiException::notFound);
        return Map.of(
                "settings", settings,
                "zones", repo.zones(),
                "fixedPrices", repo.fixedPrices(driverId),
                "surcharges", repo.surcharges(driverId));
    }

    @PutMapping("/api/admin/pricing/{driverId}/settings")
    PricingRepository.Settings updateSettings(@PathVariable UUID driverId, @RequestBody @Valid SettingsBody b) {
        var current = repo.settings(driverId).orElseThrow(ApiException::notFound);
        var updated = new PricingRepository.Settings(driverId, b.licence(), current.currency(), b.baseFare(), b.perKm(),
                b.perMinute(), b.minimumFare(), b.airportWaitMinutes(), b.meetGreetMinutes(), b.minGapMinutes(),
                b.leadTimeMinutes());
        repo.updateSettings(updated);
        return updated;
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
