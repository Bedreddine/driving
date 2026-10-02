package com.taxi.booking.internal;

import com.taxi.booking.internal.BookingModels.BookingResult;
import com.taxi.booking.internal.BookingModels.RideInput;
import com.taxi.booking.internal.RideRepository.Neighbour;
import com.taxi.booking.internal.RideRepository.Neighbours;
import com.taxi.booking.internal.RoutingClient.Route;
import com.taxi.identity.CurrentUser;
import com.taxi.pricing.Pricing;
import com.taxi.pricing.PricingPolicy.Licence;
import com.taxi.shared.ApiException;
import com.taxi.shared.GeoPoint;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Bookings by signed-in customers, guests (business-card QR code, no account) and driver quick-adds.
 * 1. Outside the transaction: road times for the ride and to/from the neighbouring rides (slow HTTP calls).
 * 2. In the transaction, with the driver row locked: all checks, the price, then the insert.
 *    If the neighbouring rides changed in between, the customer is asked to retry (AVAILABILITY_CHANGED).
 */
@Service
class BookingService {

    private final RoutingClient routing;
    private final RideRepository rides;
    private final DriverRepository drivers;
    private final ContactRepository contacts;
    private final Pricing pricing;
    private final Notices notices;
    private final CurrentUser currentUser;
    private final TransactionTemplate tx;
    private final Clock clock;

    BookingService(RoutingClient routing, RideRepository rides, DriverRepository drivers, ContactRepository contacts,
                   Pricing pricing, Notices notices, CurrentUser currentUser, TransactionTemplate tx, Clock clock) {
        this.routing = routing;
        this.rides = rides;
        this.drivers = drivers;
        this.contacts = contacts;
        this.pricing = pricing;
        this.notices = notices;
        this.currentUser = currentUser;
        this.tx = tx;
        this.clock = clock;
    }

    /** Who is booking: a signed-in account (customer or staff) or a guest from the booking website. */
    sealed interface Booker permits Account, Guest {}

    record Account(UUID userId, boolean admin, boolean staff) implements Booker {}

    record Guest(String fullName, String phone, String email, String language) implements Booker {}

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Signed-in customer request, or driver quick-add. */
    BookingResult book(RideInput in, boolean dryRun, boolean override) {
        return book(new Account(currentUser.id(), currentUser.isAdmin(), currentUser.isStaff()), in, dryRun, override);
    }

    /**
     * Guest request from the public booking website. Guests cannot quick-add nor override warnings.
     * A price check (dry run) may come before the client typed their details: guest is then null.
     */
    BookingResult bookAsGuest(Guest guest, RideInput in, boolean dryRun) {
        if (in.quickAdd() || (guest == null && !dryRun)) {
            throw ApiException.forbidden();
        }
        return book(guest == null ? ANONYMOUS_QUOTE : guest, in, dryRun, false);
    }

    private static final Guest ANONYMOUS_QUOTE = new Guest("", "", "", "fr");

    private BookingResult book(Booker booker, RideInput in, boolean dryRun, boolean override) {
        var driver = drivers.defaultDriver().orElseThrow(() -> ApiException.badRequest("NO_DRIVER"));
        var pickup = new GeoPoint(in.pickup().lat(), in.pickup().lng());
        var dropoff = new GeoPoint(in.dropoff().lat(), in.dropoff().lng());

        // Neighbours first: any change during the map lookups below is then detected in the transaction.
        var nb = rides.neighbours(driver.id(), in.pickupAt());
        var main = routing.route(pickup, dropoff);
        var fromPrev = nb.prev() == null ? null : routing.route(point(nb.prev()), pickup);
        var toNext = nb.next() == null ? null : routing.route(dropoff, point(nb.next()));

        try {
            return tx.execute(status -> decide(booker, driver.id(), in, main, nb, fromPrev, toNext, dryRun, override));
        } catch (DataIntegrityViolationException e) {
            if (isOverlap(e)) {
                // Backstop: the database refused an overlap the checks above did not see.
                return rejected(List.of("SLOT_TAKEN"), List.of(), null, null, main);
            }
            throw e;
        }
    }

    private BookingResult decide(Booker booker, UUID driverId, RideInput in, Route main, Neighbours seen,
                                 Route fromPrev, Route toNext, boolean dryRun, boolean override) {
        var driver = drivers.lock(driverId).orElseThrow(() -> ApiException.badRequest("NO_DRIVER"));
        var policy = pricing.policy(driver.id());
        var quick = in.quickAdd();
        var now = clock.instant();

        var actor = booker instanceof Account a ? a.userId() : null;
        UUID contactId = null; // guests: created only when the booking is accepted for real
        if (quick) {
            var staffForDriver = booker instanceof Account a
                    && (a.admin() || (a.staff() && a.userId().equals(driver.userId())));
            if (!staffForDriver) {
                throw ApiException.forbidden();
            }
            contactId = in.contactId();
            if (contactId == null || contacts.find(contactId).isEmpty()) {
                throw ApiException.badRequest("CONTACT_REQUIRED");
            }
        } else if (booker instanceof Account a) {
            contactId = contacts.byUser(a.userId()).orElseThrow(ApiException::forbidden).id();
        }

        var pickup = new GeoPoint(in.pickup().lat(), in.pickup().lng());
        var dropoff = new GeoPoint(in.dropoff().lat(), in.dropoff().lng());
        var travelRef = blankToNull(in.travelRef());
        var meetGreet = Boolean.TRUE.equals(in.meetGreet());
        var passengers = in.passengers() == null ? 1 : in.passengers();
        var luggage = in.luggage() == null ? 0 : in.luggage();
        var vehicle = in.vehicle() == null ? "sedan" : in.vehicle();

        int allowance = (travelRef != null || pricing.isAirportOrStation(pickup) ? policy.airportWaitMinutes() : 0)
                + (meetGreet ? policy.meetGreetMinutes() : 0);
        var start = in.pickupAt();
        var end = start.plusSeconds(main.durationS()).plus(Duration.ofMinutes(allowance));
        var gap = Duration.ofMinutes(policy.minGapMinutes());

        var errors = new ArrayList<String>();
        var warnings = new ArrayList<String>();

        // Hard rules for everyone
        if (start.isBefore(now)) {
            errors.add("PICKUP_IN_PAST");
        }
        if (!quick && start.isBefore(now.plus(Duration.ofMinutes(policy.leadTimeMinutes())))) {
            errors.add("TOO_SHORT_NOTICE");
        }

        // Rules a driver may override on a quick-add, but that block a customer request
        if (passengers > driver.seats() || luggage > driver.luggage()) {
            warnings.add("OVER_CAPACITY");
        }
        if (!vehicle.equals(driver.vehicle())) {
            warnings.add("VEHICLE_UNAVAILABLE");
        }
        if (outsideWorkingHours(driver, start)) {
            warnings.add("OUTSIDE_HOURS");
        }
        if (drivers.hasTimeOffOverlapping(driver.id(), start, end)) {
            warnings.add("DRIVER_UNAVAILABLE");
        }

        // Overlap with a slot-holding ride: never allowed (the exclusion constraint agrees).
        var clash = rides.overlapping(driver.id(), start, end.plus(gap), null);
        if (clash.isPresent()) {
            errors.add("SLOT_TAKEN");
        } else {
            var now2 = rides.neighbours(driver.id(), start);
            if (!sameIds(now2, seen)) {
                errors.add("AVAILABILITY_CHANGED");
            } else if (tooTight(now2, start, end, gap, fromPrev, toNext)) {
                warnings.add("TIGHT_SCHEDULE");
            }
        }

        var estimate = pricing.estimate(driver.id(), ZoneId.of(driver.timezone()), main.distanceM(), main.durationS(),
                start, pickup, dropoff);

        // Customers cannot override anything
        if (!quick) {
            errors.addAll(warnings);
            warnings.clear();
        }
        if (!errors.isEmpty() || (!warnings.isEmpty() && !override && !dryRun)) {
            return new BookingResult(false, null, dryRun, estimate.price(), estimate.currency(), estimate.fixed(),
                    policy.licence().value(), allowance, errors, warnings, errors.isEmpty(),
                    clash.map(Ride::id).orElse(null), main.distanceM(), main.durationS(), main.estimated(), null);
        }
        if (dryRun) {
            return new BookingResult(true, null, true, estimate.price(), estimate.currency(), estimate.fixed(),
                    policy.licence().value(), allowance, List.of(), warnings, false, null, main.distanceM(),
                    main.durationS(), main.estimated(), null);
        }

        var status = quick ? RideStatus.ACCEPTED : RideStatus.REQUESTED;
        var agreed = !quick ? null
                : in.agreedPrice() != null ? in.agreedPrice()
                : policy.licence() == Licence.VTC || estimate.fixed() ? estimate.price() : null;
        var deadline = quick ? null : earliest(now.plus(Duration.ofHours(24)), start.minus(Duration.ofHours(2)));
        if (booker instanceof Guest g) {
            contactId = guestContact(g);
        }
        var accessToken = newAccessToken();
        var rideId = rides.insert(new RideRepository.NewRide(contactId, driver.id(), actor,
                quick ? Objects.requireNonNullElse(in.source(), "phone") : "app", status, start,
                in.pickup().address().trim(), pickup.lat(), pickup.lng(), in.dropoff().address().trim(), dropoff.lat(),
                dropoff.lng(), main.distanceM(), main.durationS(), allowance, end.plus(gap), passengers, luggage,
                vehicle, meetGreet, travelRef, blankToNull(in.customerNotes()), estimate.currency(), estimate.fixed(),
                estimate.price(), agreed, deadline, accessToken));
        rides.logEvent(rideId, null, status, actor, warnings.isEmpty() ? null : "overridden: " + String.join(",", warnings));

        var change = notices.about(rideId);
        if (quick) {
            change.tellCustomer("ride_booked");
        } else {
            change.tellDriver("new_request").tellCustomer("request_received");
        }
        change.publish();

        return new BookingResult(true, rideId, false, estimate.price(), estimate.currency(), estimate.fixed(),
                policy.licence().value(), allowance, List.of(), warnings, false, null, main.distanceM(),
                main.durationS(), main.estimated(), accessToken);
    }

    /** A returning guest (same email and phone) keeps one customer record and one history. */
    private UUID guestContact(Guest g) {
        var existing = contacts.guestMatch(g.email(), g.phone());
        if (existing.isPresent()) {
            contacts.updateGuestDetails(existing.get().id(), g.fullName(), g.language());
            return existing.get().id();
        }
        // The booking page shows the privacy notice before sending, hence notice_given = true.
        return contacts.insert(null, g.fullName(), g.phone(), g.email(), true, null, g.language());
    }

    private static String newAccessToken() {
        var bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return java.util.HexFormat.of().formatHex(bytes);
    }

    private boolean outsideWorkingHours(DriverRepository.Driver driver, Instant start) {
        var hours = drivers.workingHours(driver.id());
        if (hours.isEmpty()) {
            return false; // no hours set: no limit
        }
        var local = start.atZone(ZoneId.of(driver.timezone()));
        int weekday = local.getDayOfWeek().getValue() % 7;
        var time = local.toLocalTime();
        return hours.stream().noneMatch(h -> h.weekday() == weekday
                && !time.isBefore(h.startTime()) && time.isBefore(h.endTime()));
    }

    /** Not enough road time from the previous drop-off, or to the next pickup (never less than the minimum gap). */
    static boolean tooTight(Neighbours nb, Instant start, Instant end, Duration gap, Route fromPrev, Route toNext) {
        if (nb.prev() != null) {
            var needed = max(gap, Duration.ofSeconds(fromPrev == null ? 0 : fromPrev.durationS()));
            if (Duration.between(nb.prev().at(), start).compareTo(needed) < 0) {
                return true;
            }
        }
        if (nb.next() != null) {
            var needed = max(gap, Duration.ofSeconds(toNext == null ? 0 : toNext.durationS()));
            return Duration.between(end, nb.next().at()).compareTo(needed) < 0;
        }
        return false;
    }

    private static boolean sameIds(Neighbours a, Neighbours b) {
        return Objects.equals(id(a.prev()), id(b.prev())) && Objects.equals(id(a.next()), id(b.next()));
    }

    private static UUID id(Neighbour n) {
        return n == null ? null : n.id();
    }

    private static GeoPoint point(Neighbour n) {
        return new GeoPoint(n.lat(), n.lng());
    }

    private static Duration max(Duration a, Duration b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    private static Instant earliest(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static BookingResult rejected(List<String> errors, List<String> warnings, String currency, String licence,
                                          Route main) {
        return new BookingResult(false, null, false, null, currency, null, licence, null, errors, warnings, false,
                null, main.distanceM(), main.durationS(), main.estimated(), null);
    }

    static boolean isOverlap(DataIntegrityViolationException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.sql.SQLException sql && "23P01".equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }
}
