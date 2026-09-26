package com.taxi.booking.internal;

import com.taxi.identity.CurrentUser;
import com.taxi.pricing.Pricing;
import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
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

@RestController
class DriverController {

    record DriverInfo(UUID id, String displayName, String phone, int seats, int luggage, String vehicle,
                      String timezone, String licence, String currency) {}

    record TimeOffBody(@NotNull Instant startsAt, @NotNull Instant endsAt, @Size(max = 200) String reason) {}

    record HoursBody(@Min(0) @Max(6) int weekday, @NotNull LocalTime startTime, @NotNull LocalTime endTime) {}

    private final DriverRepository drivers;
    private final Pricing pricing;
    private final CurrentUser currentUser;
    private final Clock clock;

    DriverController(DriverRepository drivers, Pricing pricing, CurrentUser currentUser, Clock clock) {
        this.drivers = drivers;
        this.pricing = pricing;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    /** The driver customers book: name, phone (for short-notice calls), vehicle capacity, licence. */
    @GetMapping("/api/drivers/current")
    DriverInfo current() {
        var d = drivers.defaultDriver().orElseThrow(() -> ApiException.badRequest("NO_DRIVER"));
        var policy = pricing.policy(d.id());
        return new DriverInfo(d.id(), d.displayName(), d.phone(), d.seats(), d.luggage(), d.vehicle(), d.timezone(),
                policy.licence().value(), policy.currency());
    }

    @GetMapping("/api/driver/time-off")
    List<DriverRepository.TimeOff> timeOff() {
        return drivers.upcomingTimeOff(myDriver().id(), clock.instant());
    }

    @PostMapping("/api/driver/time-off")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, UUID> addTimeOff(@RequestBody @Valid TimeOffBody body) {
        if (!body.endsAt().isAfter(body.startsAt())) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        var reason = body.reason() == null || body.reason().isBlank() ? null : body.reason().trim();
        return Map.of("id", drivers.insertTimeOff(myDriver().id(), body.startsAt(), body.endsAt(), reason));
    }

    @DeleteMapping("/api/driver/time-off/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteTimeOff(@PathVariable UUID id) {
        if (!drivers.deleteTimeOff(myDriver().id(), id)) {
            throw ApiException.notFound();
        }
    }

    @GetMapping("/api/admin/working-hours")
    List<DriverRepository.WorkingHours> hours() {
        return drivers.workingHours(drivers.defaultDriver().orElseThrow(ApiException::notFound).id());
    }

    /** Replaces the whole week. An empty list means customers can book at any time. */
    @PutMapping("/api/admin/working-hours")
    @Transactional
    List<DriverRepository.WorkingHours> setHours(@RequestBody @Valid List<@Valid HoursBody> body) {
        if (body.stream().anyMatch(h -> !h.startTime().isBefore(h.endTime()))) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        var driverId = drivers.defaultDriver().orElseThrow(ApiException::notFound).id();
        drivers.replaceWorkingHours(driverId,
                body.stream().map(h -> new DriverRepository.WorkingHours(h.weekday(), h.startTime(), h.endTime())).toList());
        return drivers.workingHours(driverId);
    }

    private DriverRepository.Driver myDriver() {
        if (!currentUser.isStaff()) {
            throw ApiException.forbidden();
        }
        return drivers.byUser(currentUser.id()).orElseThrow(ApiException::forbidden);
    }
}
