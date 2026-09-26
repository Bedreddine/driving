package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.taxi.support.IntegrationTest;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Status changes, who may do them, scheduled jobs and account deletion. */
class RideLifecycleIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;
    @Autowired RideLifecycle lifecycle;
    @Autowired RideRepository rides;
    @Autowired ContactRepository contacts;

    @BeforeEach
    void roads() {
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false));
    }

    private void act(UUID ride, String action, String token, Object body, int status) throws Exception {
        call(post("/api/rides/" + ride + "/" + action), token, body, status);
    }

    private String actError(UUID ride, String action, String token, Object body, int status) throws Exception {
        return errorOf(post("/api/rides/" + ride + "/" + action), token, body, status);
    }

    private BigDecimal price(UUID ride, String column) {
        return jdbc.sql("select " + column + " from rides where id = :id").param("id", ride)
                .query(BigDecimal.class).single();
    }

    /** A ride inserted directly, e.g. in the past (the API refuses past pickups). */
    private UUID rawRide(String status, Instant pickup, UUID contact) {
        return jdbc.sql("""
                insert into rides (contact_id, driver_id, source, status, pickup_at, pickup_address, pickup_lat, pickup_lng,
                  dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, blocked_range, estimated_price,
                  agreed_price)
                values (:c, :d, 'app', :s, :p, 'A', 48.86, 2.33, 'B', 48.87, 2.29, 4000, 900, tstzrange(:p, :e), 29, 29)
                returning id""")
                .param("c", contact).param("d", DRIVER).param("s", status)
                .param("p", pickup.atOffset(ZoneOffset.UTC)).param("e", pickup.plus(Duration.ofMinutes(30)).atOffset(ZoneOffset.UTC))
                .query(UUID.class).single();
    }

    // ------------------------------------------------------------------ access

    @Test
    void customersOnlySeeAndTouchTheirOwnRides() throws Exception {
        var mine = bookId(clientToken, ride(slot(10)));
        var otherToken = signUp("other@taxi.test", "Other", null);
        var theirs = bookId(otherToken, ride(slot(12)));

        var list = call(get("/api/rides"), clientToken, null, 200);
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).get("id").asString()).isEqualTo(mine.toString());
        assertThat(errorOf(get("/api/rides/" + theirs), clientToken, null, 404)).isEqualTo("NOT_FOUND");
        assertThat(call(get("/api/rides"), ownerToken, null, 200).size()).isEqualTo(2);

        assertThat(actError(mine, "accept", clientToken, null, 403)).isEqualTo("FORBIDDEN");
        assertThat(actError(theirs, "cancel", clientToken, null, 403)).isEqualTo("FORBIDDEN");
        assertThat(errorOf(get("/api/contacts/" + contactOf(clientId) + "/notes"), clientToken, null, 403)).isEqualTo("FORBIDDEN");
        call(get("/api/admin/contact-links"), clientToken, null, 403);
        call(put("/api/admin/working-hours"), clientToken, java.util.List.of(), 403);
        call(get("/api/rides"), null, null, 401);
    }

    // ------------------------------------------------------------------ state machine

    @Test
    void driverAcceptsAndTheCustomerIsTold() throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        act(id, "accept", ownerToken, null, 204);
        assertThat(status(id)).isEqualTo("accepted");
        assertThat(price(id, "agreed_price")).isEqualByComparingTo("20.00");
        assertThat(call(get("/api/notifications"), clientToken, null, 200).get(0).get("kind").asString())
                .isEqualTo("ride_accepted");
    }

    @Test
    void priceProposalRoundTrips() throws Exception {
        var accepted = bookId(clientToken, ride(slot(58)));
        act(accepted, "propose-price", ownerToken, Map.of("price", 30), 204);
        act(accepted, "respond", clientToken, Map.of("accept", true), 204);
        assertThat(status(accepted)).isEqualTo("accepted");
        assertThat(price(accepted, "agreed_price")).isEqualByComparingTo("30");

        var refused = bookId(clientToken, ride(slot(82)));
        act(refused, "propose-price", ownerToken, Map.of("price", 40), 204);
        act(refused, "respond", clientToken, Map.of("accept", false), 204);
        assertThat(status(refused)).isEqualTo("declined_by_customer");

        var withdrawn = bookId(clientToken, ride(slot(106)));
        act(withdrawn, "propose-price", ownerToken, Map.of("price", 40), 204);
        act(withdrawn, "decline", ownerToken, Map.of("reason", "changed my mind"), 204);
        assertThat(status(withdrawn)).isEqualTo("declined");
    }

    @Test
    void proposalsLeaveTheCustomerAtLeast30Minutes() throws Exception {
        var late = rawRide("requested", Instant.now().plus(Duration.ofMinutes(140)), contactOf(clientId));
        assertThat(actError(late, "propose-price", ownerToken, Map.of("price", 50), 400)).isEqualTo("TOO_LATE_TO_PROPOSE");
    }

    @Test
    void taxiLicenceCannotProposePrices() throws Exception {
        jdbc.sql("update pricing_settings set licence = 'taxi'").update();
        var id = bookId(clientToken, ride(slot(10)));
        assertThat(actError(id, "propose-price", ownerToken, Map.of("price", 50), 400)).isEqualTo("NOT_ALLOWED_FOR_TAXI");
    }

    @Test
    void onlyOneOfTwoOverlappingRequestsCanHoldTheSlot() throws Exception {
        var a = bookId(clientToken, ride(slot(178)));
        var b = bookId(clientToken, ride(slot(178.1)));
        assertThat(call(get("/api/rides/conflicts"), ownerToken, null, 200).size()).isZero();

        act(a, "accept", ownerToken, null, 204);
        assertThat(call(get("/api/rides/conflicts"), ownerToken, null, 200).get(b.toString()).asString())
                .isEqualTo(a.toString());
        assertThat(actError(b, "accept", ownerToken, null, 409)).isEqualTo("SLOT_TAKEN");
        assertThat(actError(b, "propose-price", ownerToken, Map.of("price", 20), 409)).isEqualTo("SLOT_TAKEN");
    }

    @Test
    void theDatabaseItselfRefusesOverlaps() {
        var contact = contactOf(clientId);
        rawRide("accepted", slot(10), contact);
        var error = org.assertj.core.api.Assertions.catchThrowable(() -> rawRide("accepted", slot(10.1), contact));
        assertThat(error).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(BookingService.isOverlap((org.springframework.dao.DataIntegrityViolationException) error)).isTrue();
    }

    @Test
    void cancellingCompletingAndNoShows() throws Exception {
        var future = bookId(clientToken, ride(slot(10)));
        act(future, "accept", ownerToken, null, 204);
        assertThat(actError(future, "cancel", ownerToken, Map.of(), 400)).isEqualTo("REASON_REQUIRED");
        assertThat(actError(future, "complete", ownerToken, null, 400)).isEqualTo("TOO_EARLY");
        assertThat(actError(future, "no-show", ownerToken, null, 400)).isEqualTo("TOO_EARLY");
        act(future, "cancel", clientToken, null, 204);
        assertThat(status(future)).isEqualTo("cancelled");
        assertThat(actError(future, "accept", ownerToken, null, 409)).isEqualTo("WRONG_STATUS");

        var past = rawRide("accepted", Instant.now().minus(Duration.ofHours(3)), contactOf(clientId));
        assertThat(actError(past, "complete", ownerToken, Map.of("final_price", 35), 400)).isEqualTo("REASON_REQUIRED");
        act(past, "complete", ownerToken, Map.of("final_price", 35, "reason", "20 min waiting"), 204);
        assertThat(status(past)).isEqualTo("completed");
        assertThat(price(past, "final_price")).isEqualByComparingTo("35");
    }

    // ------------------------------------------------------------------ jobs

    @Test
    void unansweredRequestsExpireAndBothSidesAreTold() throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        jdbc.sql("update rides set answer_deadline = now() - interval '1 minute' where id = :id").param("id", id).update();
        assertThat(lifecycle.expireOverdue()).isEqualTo(1);
        assertThat(status(id)).isEqualTo("expired");
        assertThat(call(get("/api/notifications"), clientToken, null, 200).get(0).get("kind").asString())
                .isEqualTo("ride_expired");
        assertThat(actError(id, "accept", ownerToken, null, 409)).isEqualTo("WRONG_STATUS");
    }

    @Test
    void theDriverIsRemindedOnceAboutRidesLeftOpen() {
        rawRide("accepted", Instant.now().minus(Duration.ofHours(5)), contactOf(clientId));
        assertThat(lifecycle.remindOpenRides()).isEqualTo(1);
        assertThat(lifecycle.remindOpenRides()).isZero();
    }

    @Test
    void retentionRemovesOldDataButKeepsAccounts() {
        var phone = contacts.insert(null, "Old phone customer", "+33699999999", null, true, null);
        jdbc.sql("update contacts set updated_at = now() - interval '3 years' where id = :id").param("id", phone).update();
        var old = rawRide("cancelled", Instant.now().minus(Duration.ofDays(400)), contactOf(clientId));
        jdbc.sql("update rides set updated_at = now() - interval '13 months' where id = :id").param("id", old).update();

        rides.applyRetention();
        assertThat(contacts.deleteInactiveWithoutRides()).isEqualTo(1);
        assertThat(rides.find(old)).isEmpty();
        assertThat(contacts.byUser(clientId)).isPresent();
    }

    // ------------------------------------------------------------------ accounts

    @Test
    void deletingAnAccountCancelsOpenRidesAndRemovesPersonalData() throws Exception {
        var open = bookId(clientToken, ride(slot(10)));
        var contact = contactOf(clientId);
        call(delete("/api/me"), clientToken, null, 204);

        assertThat(status(open)).isEqualTo("cancelled");
        var c = contacts.find(contact).orElseThrow();
        assertThat(c.fullName()).isEqualTo("Deleted customer");
        assertThat(c.phone()).isNull();
        assertThat(rides.find(open).orElseThrow().pickupAddress()).isEqualTo("(address removed)");
        assertThat(call(get("/api/notifications"), ownerToken, null, 200).get(0).get("kind").asString())
                .isEqualTo("ride_cancelled_by_customer");
        call(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "password123"), 401);
    }

    @Test
    void theOwnerAccountCannotBeSelfDeleted() throws Exception {
        assertThat(errorOf(delete("/api/me"), ownerToken, null, 400)).isEqualTo("STAFF_ACCOUNT");
    }

    @Test
    void aNewAccountCanBeLinkedToTheCustomerTheDriverAlreadyHad() throws Exception {
        var phoneOnly = UUID.fromString(call(post("/api/contacts"), ownerToken,
                Map.of("full_name", "Client by phone", "phone", "+33611111111"), 201).get("id").asString());
        var oldRide = rawRide("completed", Instant.now().minus(Duration.ofDays(10)), phoneOnly);

        var suggestions = call(get("/api/admin/contact-links"), ownerToken, null, 200);
        assertThat(suggestions.get(0).get("existing_contact_id").asString()).isEqualTo(phoneOnly.toString());
        assertThat(suggestions.get(0).get("match").asString()).isEqualTo("phone");

        call(post("/api/admin/contact-links"), ownerToken,
                Map.of("account_contact_id", contactOf(clientId).toString(), "existing_contact_id", phoneOnly.toString()), 204);
        assertThat(contactOf(clientId)).isEqualTo(phoneOnly);
        assertThat(call(get("/api/rides/" + oldRide), clientToken, null, 200).get("id").asString())
                .isEqualTo(oldRide.toString()); // the customer now sees their phone-booked history
    }
}
