package com.taxi.booking.internal;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.taxi.booking.internal.BookingModels.BookingRequest;
import com.taxi.booking.internal.BookingModels.BookingResult;
import com.taxi.identity.CurrentUser;
import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class RideController {

    record ContactSummary(UUID id, String fullName, String phone, String email, String language) {}

    record RideView(@JsonUnwrapped Ride ride, ContactSummary contact) {}

    record Reason(@Size(max = 500) String reason) {}

    record PriceBody(@NotNull @DecimalMin("0") BigDecimal price) {}

    record Answer(@NotNull Boolean accept) {}

    record CompleteBody(@DecimalMin("0") BigDecimal finalPrice, @Size(max = 500) String reason) {}

    private final BookingService booking;
    private final RideLifecycle lifecycle;
    private final RideRepository rides;
    private final DriverRepository drivers;
    private final ContactRepository contacts;
    private final CurrentUser currentUser;

    RideController(BookingService booking, RideLifecycle lifecycle, RideRepository rides, DriverRepository drivers,
                   ContactRepository contacts, CurrentUser currentUser) {
        this.booking = booking;
        this.lifecycle = lifecycle;
        this.rides = rides;
        this.drivers = drivers;
        this.contacts = contacts;
        this.currentUser = currentUser;
    }

    /** Customer request, driver quick-add, or a price check with dry_run. */
    @PostMapping("/api/rides")
    BookingResult book(@RequestBody @Valid BookingRequest body) {
        return booking.book(body.ride(), body.isDryRun(), body.isOverride());
    }

    @GetMapping("/api/rides")
    List<RideView> list(@RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to,
                        @RequestParam(name = "status", required = false) List<String> statuses,
                        @RequestParam(defaultValue = "500") int limit) {
        if (statuses != null && statuses.stream().anyMatch(s -> !isStatus(s))) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        var userId = currentUser.id();
        var driverId = currentUser.isStaff() ? drivers.byUser(userId).map(DriverRepository.Driver::id).orElse(null) : null;
        var contactId = contacts.byUser(userId).map(ContactRepository.Contact::id).orElse(null);
        var found = rides.visible(currentUser.isAdmin(), driverId, contactId, from, to, statuses,
                Math.clamp(limit, 1, 2000));
        return withContacts(found);
    }

    @GetMapping("/api/rides/{id}")
    RideView get(@PathVariable UUID id) {
        var ride = rides.find(id).orElseThrow(ApiException::notFound);
        if (!canSee(ride)) {
            throw ApiException.notFound();
        }
        return withContacts(List.of(ride)).getFirst();
    }

    /** Pending request id -> id of the confirmed ride it overlaps. */
    @GetMapping("/api/rides/conflicts")
    Map<UUID, UUID> conflicts() {
        if (!currentUser.isStaff()) {
            throw ApiException.forbidden();
        }
        var driverId = drivers.byUser(currentUser.id()).map(DriverRepository.Driver::id).orElse(null);
        return rides.requestConflicts(currentUser.isAdmin(), driverId);
    }

    @PostMapping("/api/rides/{id}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void accept(@PathVariable UUID id) {
        lifecycle.accept(id);
    }

    @PostMapping("/api/rides/{id}/propose-price")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void propose(@PathVariable UUID id, @RequestBody @Valid PriceBody body) {
        lifecycle.proposePrice(id, body.price());
    }

    @PostMapping("/api/rides/{id}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decline(@PathVariable UUID id, @RequestBody(required = false) @Valid Reason body) {
        lifecycle.decline(id, body == null ? null : body.reason());
    }

    @PostMapping("/api/rides/{id}/respond")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void respond(@PathVariable UUID id, @RequestBody @Valid Answer body) {
        lifecycle.respondToPrice(id, body.accept());
    }

    @PostMapping("/api/rides/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable UUID id, @RequestBody(required = false) @Valid Reason body) {
        lifecycle.cancel(id, body == null ? null : body.reason());
    }

    @PostMapping("/api/rides/{id}/complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void complete(@PathVariable UUID id, @RequestBody(required = false) @Valid CompleteBody body) {
        lifecycle.complete(id, body == null ? null : body.finalPrice(), body == null ? null : body.reason());
    }

    @PostMapping("/api/rides/{id}/no-show")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void noShow(@PathVariable UUID id) {
        lifecycle.markNoShow(id);
    }

    private boolean canSee(Ride ride) {
        if (currentUser.isAdmin()) {
            return true;
        }
        var userId = currentUser.id();
        var isDriver = currentUser.isStaff()
                && drivers.find(ride.driverId()).map(d -> userId.equals(d.userId())).orElse(false);
        var isCustomer = contacts.find(ride.contactId()).map(c -> userId.equals(c.userId())).orElse(false);
        return isDriver || isCustomer;
    }

    private List<RideView> withContacts(List<Ride> list) {
        var byId = contacts.findAll(list.stream().map(Ride::contactId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(ContactRepository.Contact::id, Function.identity()));
        return list.stream().map(r -> {
            var c = byId.get(r.contactId());
            return new RideView(r, c == null ? null : new ContactSummary(c.id(), c.fullName(), c.phone(), c.email(), c.language()));
        }).toList();
    }

    private static boolean isStatus(String s) {
        try {
            RideStatus.of(s);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
