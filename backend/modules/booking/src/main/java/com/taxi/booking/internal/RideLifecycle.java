package com.taxi.booking.internal;

import static com.taxi.booking.internal.RideStatus.ACCEPTED;
import static com.taxi.booking.internal.RideStatus.CANCELLED;
import static com.taxi.booking.internal.RideStatus.COMPLETED;
import static com.taxi.booking.internal.RideStatus.DECLINED;
import static com.taxi.booking.internal.RideStatus.DECLINED_BY_CUSTOMER;
import static com.taxi.booking.internal.RideStatus.EXPIRED;
import static com.taxi.booking.internal.RideStatus.NO_SHOW;
import static com.taxi.booking.internal.RideStatus.PRICE_PROPOSED;
import static com.taxi.booking.internal.RideStatus.REQUESTED;

import com.taxi.identity.CurrentUser;
import com.taxi.pricing.Pricing;
import com.taxi.pricing.PricingPolicy.Licence;
import com.taxi.shared.ApiException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Every status change of a ride, with who may do it (see the diagram in {@link RideStatus}). */
@Service
class RideLifecycle {

    private static final Duration MIN_ANSWER_TIME = Duration.ofMinutes(30);

    private final RideRepository rides;
    private final DriverRepository drivers;
    private final ContactRepository contacts;
    private final Pricing pricing;
    private final Notices notices;
    private final CurrentUser currentUser;
    private final Clock clock;

    RideLifecycle(RideRepository rides, DriverRepository drivers, ContactRepository contacts, Pricing pricing,
                  Notices notices, CurrentUser currentUser, Clock clock) {
        this.rides = rides;
        this.drivers = drivers;
        this.contacts = contacts;
        this.pricing = pricing;
        this.notices = notices;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional
    public void accept(UUID rideId) {
        var r = loadForSlotChange(rideId);
        requireStaff(r);
        requireStatus(r, REQUESTED);
        requireOpenDeadline(r);
        var licence = pricing.policy(r.driverId()).licence();
        var agreed = licence == Licence.VTC || r.isFixedPrice() ? r.estimatedPrice() : null;
        requireFreeSlot(r);
        change(r, ACCEPTED, cols("agreed_price", agreed, "answer_deadline", null), null);
        notices.about(r).tellCustomer("ride_accepted").publish();
    }

    @Transactional
    public void proposePrice(UUID rideId, BigDecimal price) {
        var r = loadForSlotChange(rideId);
        requireStaff(r);
        requireStatus(r, REQUESTED);
        requireOpenDeadline(r);
        if (price == null || price.signum() < 0) {
            throw ApiException.badRequest("BAD_PRICE");
        }
        if (pricing.policy(r.driverId()).licence() == Licence.TAXI) {
            throw ApiException.badRequest("NOT_ALLOWED_FOR_TAXI");
        }
        // The customer always gets at least 30 minutes to answer.
        var now = clock.instant();
        var deadline = earliest(now.plus(Duration.ofHours(12)), r.pickup().minus(Duration.ofHours(2)));
        if (deadline.isBefore(now.plus(MIN_ANSWER_TIME))) {
            throw ApiException.badRequest("TOO_LATE_TO_PROPOSE");
        }
        requireFreeSlot(r);
        change(r, PRICE_PROPOSED, cols("proposed_price", price, "answer_deadline", deadline), price.toPlainString());
        notices.about(r).tellCustomer("price_proposed", Map.of("price", price)).publish();
    }

    /** Driver declines a request, or withdraws a price proposal. */
    @Transactional
    public void decline(UUID rideId, String reason) {
        var r = load(rideId);
        requireStaff(r);
        requireStatus(r, REQUESTED, PRICE_PROPOSED);
        change(r, DECLINED, cols("cancel_reason", blankToNull(reason), "answer_deadline", null), reason);
        notices.about(r).tellCustomer("ride_declined", payload("reason", blankToNull(reason))).publish();
    }

    @Transactional
    public void respondToPrice(UUID rideId, boolean accept) {
        var r = accept ? loadForSlotChange(rideId) : load(rideId);
        requireCustomer(r);
        respond(r, accept);
    }

    /** Guest answering from the private link of the ride (no account). */
    @Transactional
    public void respondAsGuest(String accessToken, boolean accept) {
        var id = byToken(accessToken).id();
        respond(accept ? loadForSlotChange(id) : load(id), accept);
    }

    private void respond(Ride r, boolean accept) {
        requireStatus(r, PRICE_PROPOSED);
        requireOpenDeadline(r);
        if (accept) {
            change(r, ACCEPTED, cols("agreed_price", r.proposedPrice(), "answer_deadline", null), null);
            notices.about(r).tellDriver("price_accepted").publish();
        } else {
            change(r, DECLINED_BY_CUSTOMER, cols("answer_deadline", null), null);
            notices.about(r).tellDriver("price_refused").publish();
        }
    }

    @Transactional
    public void cancel(UUID rideId, String reason) {
        var r = load(rideId);
        if (isCustomer(r)) {
            cancelByCustomer(r, reason);
            return;
        }
        requireStaff(r);
        requireStatus(r, ACCEPTED);
        if (blankToNull(reason) == null) {
            throw ApiException.badRequest("REASON_REQUIRED");
        }
        change(r, CANCELLED, cols("cancel_reason", reason.trim(), "answer_deadline", null), reason);
        notices.about(r).tellCustomer("ride_cancelled_by_driver", Map.of("reason", reason.trim())).publish();
    }

    /** Guest cancelling from the private link of the ride (no account). */
    @Transactional
    public void cancelAsGuest(String accessToken) {
        cancelByCustomer(load(byToken(accessToken).id()), null);
    }

    private void cancelByCustomer(Ride r, String reason) {
        requireStatus(r, REQUESTED, PRICE_PROPOSED, ACCEPTED);
        change(r, CANCELLED, cols("cancel_reason", blankToNull(reason), "answer_deadline", null), reason);
        notices.about(r).tellDriver("ride_cancelled_by_customer").tellCustomer("ride_cancelled_confirmation").publish();
    }

    @Transactional
    public void complete(UUID rideId, BigDecimal finalPrice, String reason) {
        var r = load(rideId);
        requireStaff(r);
        requireStatus(r, ACCEPTED);
        if (clock.instant().isBefore(r.pickup())) {
            throw ApiException.badRequest("TOO_EARLY");
        }
        BigDecimal price;
        if (pricing.policy(r.driverId()).licence() == Licence.TAXI) {
            if (finalPrice == null) {
                throw ApiException.badRequest("FINAL_PRICE_REQUIRED"); // meter reading or fixed fare
            }
            price = finalPrice;
        } else {
            price = finalPrice != null ? finalPrice : r.agreedPrice() != null ? r.agreedPrice() : r.estimatedPrice();
            if (r.agreedPrice() != null && price.compareTo(r.agreedPrice()) != 0 && blankToNull(reason) == null) {
                throw ApiException.badRequest("REASON_REQUIRED");
            }
        }
        if (price == null || price.signum() < 0) {
            throw ApiException.badRequest("BAD_PRICE");
        }
        change(r, COMPLETED, cols("final_price", price, "final_price_reason", blankToNull(reason)), reason);
        notices.about(r).tellCustomer("ride_completed", payload("final_price", price, "reason", blankToNull(reason)))
                .publish();
    }

    @Transactional
    public void markNoShow(UUID rideId) {
        var r = load(rideId);
        requireStaff(r);
        requireStatus(r, ACCEPTED);
        if (clock.instant().isBefore(r.pickup().plus(Duration.ofMinutes(r.pickupAllowanceMin())))) {
            throw ApiException.badRequest("TOO_EARLY");
        }
        change(r, NO_SHOW, Map.of(), null);
        notices.about(r).tellCustomer("ride_no_show").publish();
    }

    // ------------------------------------------------------------------ scheduled jobs

    /** Requests and proposals nobody answered in time. */
    @Transactional
    public int expireOverdue() {
        var overdue = rides.overdue(clock.instant());
        for (var r : overdue) {
            rides.update(r.id(), EXPIRED, cols("answer_deadline", null));
            rides.logEvent(r.id(), r.rideStatus(), EXPIRED, null, null);
            notices.about(r).tellCustomer("ride_expired").tellDriver("ride_expired").publish();
        }
        return overdue.size();
    }

    /** Remind the driver once about accepted rides left open 2 hours after their end. */
    @Transactional
    public int remindOpenRides() {
        var open = rides.openTooLong(clock.instant());
        for (var r : open) {
            rides.logEvent(r.id(), ACCEPTED, ACCEPTED, null, "close_reminder");
            notices.about(r).tellDriver("close_ride_reminder").publish();
        }
        return open.size();
    }

    /** Account deletion: cancel open rides (telling the driver), keep past rides without personal data. */
    @Transactional
    public void forgetCustomer(UUID userId) {
        var contact = contacts.byUser(userId);
        if (contact.isEmpty()) {
            return;
        }
        for (var r : rides.openForContact(contact.get().id())) {
            rides.update(r.id(), CANCELLED, cols("cancel_reason", "account deleted", "answer_deadline", null));
            rides.logEvent(r.id(), r.rideStatus(), CANCELLED, null, "account deleted");
            notices.about(r).tellDriver("ride_cancelled_by_customer").publish();
        }
        rides.stripPersonalData(contact.get().id());
        contacts.anonymize(contact.get().id());
    }

    // ------------------------------------------------------------------ helpers

    private Ride byToken(String accessToken) {
        if (accessToken == null || accessToken.length() < 32) {
            throw ApiException.notFound();
        }
        return rides.byAccessToken(accessToken).orElseThrow(ApiException::notFound);
    }

    private Ride load(UUID id) {
        return rides.lock(id).orElseThrow(ApiException::notFound);
    }

    /** For changes that reserve the slot: lock the driver first (same order as bookings), then the ride. */
    private Ride loadForSlotChange(UUID id) {
        var driverId = rides.find(id).orElseThrow(ApiException::notFound).driverId();
        drivers.lock(driverId);
        return load(id);
    }

    private void requireFreeSlot(Ride r) {
        var gap = Duration.ofMinutes(pricing.policy(r.driverId()).minGapMinutes());
        if (rides.overlapping(r.driverId(), r.pickup(), r.endsAt().plus(gap), r.id()).isPresent()) {
            throw ApiException.conflict("SLOT_TAKEN");
        }
    }

    private void change(Ride r, RideStatus to, Map<String, Object> columns, String note) {
        try {
            rides.update(r.id(), to, columns);
        } catch (DataIntegrityViolationException e) {
            if (BookingService.isOverlap(e)) {
                throw ApiException.conflict("SLOT_TAKEN");
            }
            throw e;
        }
        rides.logEvent(r.id(), r.rideStatus(), to, currentUser.idIfSignedIn().orElse(null), blankToNull(note));
    }

    private void requireStaff(Ride r) {
        if (currentUser.isAdmin()) {
            return;
        }
        var driver = drivers.find(r.driverId()).orElseThrow(ApiException::forbidden);
        if (!currentUser.isStaff() || !currentUser.id().equals(driver.userId())) {
            throw ApiException.forbidden();
        }
    }

    private boolean isCustomer(Ride r) {
        var me = currentUser.idIfSignedIn().orElse(null);
        return me != null && contacts.find(r.contactId()).map(c -> me.equals(c.userId())).orElse(false);
    }

    private void requireCustomer(Ride r) {
        if (!isCustomer(r)) {
            throw ApiException.forbidden();
        }
    }

    private static void requireStatus(Ride r, RideStatus... allowed) {
        if (!Arrays.asList(allowed).contains(r.rideStatus())) {
            throw ApiException.conflict("WRONG_STATUS");
        }
    }

    private void requireOpenDeadline(Ride r) {
        if (r.answerDeadline() != null && !r.answerDeadline().toInstant().isAfter(clock.instant())) {
            throw ApiException.conflict("EXPIRED");
        }
    }

    /** Column map that allows null values (Map.of does not). */
    private static Map<String, Object> cols(Object... kv) {
        var m = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static Map<String, Object> payload(Object... kv) {
        return cols(kv);
    }

    private static Instant earliest(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
