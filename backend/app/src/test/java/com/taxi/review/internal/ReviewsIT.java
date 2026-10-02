package com.taxi.review.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** Client reviews: written from the private ride link once completed, moderated by the owner, shown publicly. */
class ReviewsIT extends IntegrationTest {

    private static final Instant LAST_WEEK = Instant.now().minus(Duration.ofDays(7));

    private record TestRide(UUID id, String token) {}

    private UUID guest(String fullName, String email) {
        return jdbc.sql("insert into contacts (full_name, email, phone, notice_given, language) values (:n, :e, '+33699999999', true, 'en') returning id")
                .param("n", fullName).param("e", email).query(UUID.class).single();
    }

    /** A ride inserted directly, e.g. in the past (the API refuses past pickups). */
    private TestRide rawRide(String status, Instant pickup, UUID contact) {
        var row = jdbc.sql("""
                insert into rides (contact_id, driver_id, source, status, pickup_at, pickup_address, pickup_lat, pickup_lng,
                  dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, blocked_range, estimated_price,
                  agreed_price)
                values (:c, :d, 'app', :s, :p, 'A', 48.86, 2.33, 'B', 48.87, 2.29, 4000, 900, tstzrange(:p, :e), 29, 29)
                returning id, access_token""")
                .param("c", contact).param("d", DRIVER).param("s", status)
                .param("p", pickup.atOffset(ZoneOffset.UTC)).param("e", pickup.plus(Duration.ofMinutes(30)).atOffset(ZoneOffset.UTC))
                .query().singleRow();
        return new TestRide((UUID) row.get("id"), (String) row.get("access_token"));
    }

    private static Map<String, Object> review(Object rating, String comment, boolean showPublicly, String city) {
        var m = new HashMap<String, Object>(); // allows nulls
        m.put("rating", rating);
        m.put("comment", comment);
        m.put("show_publicly", showPublicly);
        m.put("city", city);
        return m;
    }

    private void submit(String token, Map<String, Object> review, int status) throws Exception {
        call(put("/api/public/bookings/" + token + "/review"), null, review, status);
    }

    private String submitError(String token, Map<String, Object> review, int status) throws Exception {
        return errorOf(put("/api/public/bookings/" + token + "/review"), null, review, status);
    }

    private JsonNode page(String token) throws Exception {
        return call(get("/api/public/bookings/" + token), null, null, 200);
    }

    private JsonNode published() throws Exception {
        return call(get("/api/public/reviews"), null, null, 200);
    }

    private String reviewId(UUID rideId) {
        return jdbc.sql("select id from reviews where ride_id = :r").param("r", rideId).query(UUID.class).single().toString();
    }

    private int reviewCount() {
        return jdbc.sql("select count(*) from reviews").query(Integer.class).single();
    }

    @Test
    void aRideCannotBeReviewedBeforeItIsCompleted() throws Exception {
        var ride = rawRide("accepted", slot(10), guest("James Smith", "js@example.com"));
        var page = page(ride.token());
        assertThat(page.get("can_review").asBoolean()).isFalse();
        assertThat(page.get("review").isNull()).isTrue();
        assertThat(submitError(ride.token(), review(5, "Great", true, "London"), 409)).isEqualTo("RIDE_NOT_COMPLETED");
        assertThat(reviewCount()).isZero();
    }

    @Test
    void theClientReviewsACompletedRideAndEditsItWhilePending() throws Exception {
        var ride = rawRide("completed", LAST_WEEK, guest("James Smith", "js@example.com"));
        var before = page(ride.token());
        assertThat(before.get("can_review").asBoolean()).isTrue();
        assertThat(before.get("review").isNull()).isTrue();

        submit(ride.token(), review(4, "  Very punctual.  ", false, " London "), 204);
        var review = page(ride.token()).get("review");
        assertThat(review.get("rating").asInt()).isEqualTo(4);
        assertThat(review.get("comment").asString()).isEqualTo("Very punctual.");
        assertThat(review.get("show_publicly").asBoolean()).isFalse();
        assertThat(review.get("city").asString()).isEqualTo("London");
        assertThat(review.get("status").asString()).isEqualTo("pending");

        // The owner is told once, about the new review
        var notice = call(get("/api/notifications"), ownerToken, null, 200).get(0);
        assertThat(notice.get("kind").asString()).isEqualTo("new_review");
        assertThat(notice.get("ride_id").asString()).isEqualTo(ride.id().toString());

        // Still pending: the client may change their mind; an empty comment means none
        submit(ride.token(), review(5, "   ", true, null), 204);
        var page = page(ride.token());
        assertThat(page.get("can_review").asBoolean()).isTrue();
        assertThat(page.get("review").get("rating").asInt()).isEqualTo(5);
        assertThat(page.get("review").get("comment").isNull()).isTrue();
        assertThat(page.get("review").get("show_publicly").asBoolean()).isTrue();
        assertThat(page.get("review").get("city").isNull()).isTrue();
        assertThat(reviewCount()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from notifications where kind = 'new_review'").query(Integer.class).single())
                .isEqualTo(1);
    }

    @Test
    void onlyApprovedReviewsOfConsentingClientsArePublic() throws Exception {
        var pickup = Instant.parse("2026-08-31T22:30:00Z"); // already September in Paris
        var shown = rawRide("completed", pickup, guest("Mr James Smith", "js@example.com"));
        var notShown = rawRide("completed", LAST_WEEK, guest("Claire Dubois", "cd@example.com"));
        submit(shown.token(), review(5, "Perfect", true, "London"), 204);
        submit(notShown.token(), review(5, "Discreet please", false, "Lyon"), 204);
        assertThat(published()).isEmpty(); // nothing until the owner approves

        var pending = call(get("/api/admin/reviews?status=pending"), ownerToken, null, 200);
        assertThat(pending).hasSize(2);
        var smith = pending.get(0).get("ride_id").asString().equals(shown.id().toString()) ? pending.get(0) : pending.get(1);
        assertThat(smith.get("client_name").asString()).isEqualTo("Mr James Smith");
        assertThat(smith.get("display_name").asString()).isEqualTo("J. Smith");
        assertThat(smith.get("status").asString()).isEqualTo("pending");
        assertThat(smith.get("pickup_at").isNull()).isFalse();
        assertThat(smith.get("created_at").isNull()).isFalse();

        call(post("/api/admin/reviews/" + reviewId(shown.id()) + "/approve"), ownerToken, null, 204);
        call(post("/api/admin/reviews/" + reviewId(notShown.id()) + "/approve"), ownerToken, null, 204);
        var list = published();
        assertThat(list).hasSize(1);
        var item = list.get(0);
        assertThat(item.get("rating").asInt()).isEqualTo(5);
        assertThat(item.get("comment").asString()).isEqualTo("Perfect");
        assertThat(item.get("display_name").asString()).isEqualTo("J. Smith");
        assertThat(item.get("city").asString()).isEqualTo("London");
        assertThat(item.get("month").asString()).isEqualTo("2026-09");
        assertThat(item.has("ride_id")).isFalse(); // no internal ids, no full name in public
        assertThat(item.toString()).doesNotContain("James");

        assertThat(call(get("/api/admin/reviews?status=approved"), ownerToken, null, 200)).hasSize(2);
        assertThat(call(get("/api/admin/reviews?status=pending"), ownerToken, null, 200)).isEmpty();
        assertThat(call(get("/api/admin/reviews"), ownerToken, null, 200)).hasSize(2);

        // Hiding takes it off the website; approving again brings it back
        call(post("/api/admin/reviews/" + reviewId(shown.id()) + "/hide"), ownerToken, null, 204);
        assertThat(published()).isEmpty();
        assertThat(call(get("/api/admin/reviews?status=hidden"), ownerToken, null, 200)).hasSize(1);
        call(post("/api/admin/reviews/" + reviewId(shown.id()) + "/approve"), ownerToken, null, 204);
        assertThat(published()).hasSize(1);
    }

    @Test
    void aModeratedReviewIsLocked() throws Exception {
        var approved = rawRide("completed", LAST_WEEK, guest("James Smith", "js@example.com"));
        submit(approved.token(), review(5, "Great", true, null), 204);
        call(post("/api/admin/reviews/" + reviewId(approved.id()) + "/approve"), ownerToken, null, 204);
        assertThat(submitError(approved.token(), review(1, "Changed my mind", true, null), 409)).isEqualTo("REVIEW_LOCKED");
        var page = page(approved.token());
        assertThat(page.get("can_review").asBoolean()).isFalse();
        assertThat(page.get("review").get("status").asString()).isEqualTo("approved");
        assertThat(page.get("review").get("rating").asInt()).isEqualTo(5);

        var hidden = rawRide("completed", LAST_WEEK.minus(Duration.ofDays(1)), guest("Claire Dubois", "cd@example.com"));
        submit(hidden.token(), review(2, "Late", true, null), 204);
        call(post("/api/admin/reviews/" + reviewId(hidden.id()) + "/hide"), ownerToken, null, 204);
        assertThat(submitError(hidden.token(), review(5, "Fine after all", true, null), 409)).isEqualTo("REVIEW_LOCKED");
    }

    @Test
    void moderationIsForTheOwnerOnly() throws Exception {
        var ride = rawRide("completed", LAST_WEEK, guest("James Smith", "js@example.com"));
        submit(ride.token(), review(5, null, true, null), 204);
        var id = reviewId(ride.id());

        call(get("/api/admin/reviews"), clientToken, null, 403);
        call(post("/api/admin/reviews/" + id + "/approve"), clientToken, null, 403);
        call(post("/api/admin/reviews/" + id + "/hide"), clientToken, null, 403);
        call(get("/api/admin/reviews"), null, null, 401);
        assertThat(jdbc.sql("select status from reviews").query(String.class).single()).isEqualTo("pending");

        call(post("/api/admin/reviews/" + UUID.randomUUID() + "/approve"), ownerToken, null, 404);
        call(post("/api/admin/reviews/" + UUID.randomUUID() + "/hide"), ownerToken, null, 404);
        assertThat(errorOf(get("/api/admin/reviews?status=deleted"), ownerToken, null, 400)).isEqualTo("BAD_INPUT");
    }

    @Test
    void forgettingACustomerDeletesTheirReviews() throws Exception {
        var contact = guest("James Smith", "js@example.com");
        var ride = rawRide("completed", LAST_WEEK, contact);
        submit(ride.token(), review(5, "Great", true, "London"), 204);
        call(post("/api/admin/reviews/" + reviewId(ride.id()) + "/approve"), ownerToken, null, 204);
        assertThat(published()).hasSize(1);

        call(post("/api/admin/contacts/" + contact + "/forget"), ownerToken, null, 204);
        assertThat(reviewCount()).isZero();
        assertThat(published()).isEmpty();
        // The link still shows the (stripped) ride, but nothing can be reviewed any more
        assertThat(page(ride.token()).get("can_review").asBoolean()).isFalse();
        submit(ride.token(), review(5, "Great", true, "London"), 404);
    }

    @Test
    void deletingAnAccountDeletesItsReviews() throws Exception {
        var ride = rawRide("completed", LAST_WEEK, contactOf(clientId));
        submit(ride.token(), review(4, "Good", true, null), 204);
        call(delete("/api/me"), clientToken, null, 204);
        assertThat(reviewCount()).isZero();
    }

    @Test
    void badReviewsAreRefused() throws Exception {
        var ride = rawRide("completed", LAST_WEEK, guest("James Smith", "js@example.com"));
        for (var bad : java.util.List.of(
                review(0, null, true, null),
                review(6, null, true, null),
                review(null, "No rating", true, null),
                review(5, "x".repeat(1001), true, null),
                review(5, null, true, "y".repeat(61)))) {
            assertThat(submitError(ride.token(), bad, 400)).isEqualTo("BAD_REVIEW");
        }
        assertThat(reviewCount()).isZero();
        submit(ride.token(), review(5, "x".repeat(1000), true, "y".repeat(60)), 204);
        assertThat(errorOf(put("/api/public/bookings/not-a-real-token-0000000000000000000000/review"), null,
                review(5, null, true, null), 404)).isEqualTo("NOT_FOUND");
    }

    @Test
    void theThankYouEmailInvitesAReview() throws Exception {
        call(put("/api/admin/business"), ownerToken, Map.of("name", "Élysée Chauffeur",
                "tagline_fr", "Votre chauffeur privé à Paris", "tagline_en", "Your private driver in Paris",
                "site_url", "https://elysee-chauffeur.example"), 200);
        var ride = rawRide("accepted", Instant.now().minus(Duration.ofHours(3)), guest("James Smith", "js@example.com"));
        call(post("/api/rides/" + ride.id() + "/complete"), ownerToken, new LinkedHashMap<>(), 204);

        var body = jdbc.sql("select body from customer_messages where channel = 'email' order by id desc limit 1")
                .query(String.class).single();
        assertThat(body).contains("Leave us a review: https://elysee-chauffeur.example/b/" + ride.token());
        assertThat(page(ride.token()).get("can_review").asBoolean()).isTrue();
    }
}
