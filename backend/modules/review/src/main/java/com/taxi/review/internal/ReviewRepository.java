package com.taxi.review.internal;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ReviewRepository {

    record Review(UUID id, UUID rideId, int rating, String comment, boolean showPublicly, String city, String status,
                  OffsetDateTime createdAt) {}

    private static final String COLUMNS = "id, ride_id, rating, comment, show_publicly, city, status, created_at";

    private final JdbcClient jdbc;

    ReviewRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Review> forRide(UUID rideId) {
        return jdbc.sql("select " + COLUMNS + " from reviews where ride_id = :r").param("r", rideId)
                .query(Review.class).optional();
    }

    /**
     * Creates the review, or edits it while it is still pending, in one statement (two quick submissions
     * cannot both create one). Empty when the review is already moderated (locked); otherwise the review id
     * and whether it was just created.
     */
    Optional<Saved> save(UUID rideId, int rating, String comment, boolean showPublicly, String city) {
        return jdbc.sql("""
                insert into reviews (ride_id, rating, comment, show_publicly, city) values (:r, :rating, :c, :p, :city)
                on conflict (ride_id) do update set rating = excluded.rating, comment = excluded.comment,
                  show_publicly = excluded.show_publicly, city = excluded.city, updated_at = now()
                  where reviews.status = 'pending'
                returning id, (xmax = 0) as created""")
                .param("r", rideId).param("rating", rating).param("c", comment).param("p", showPublicly)
                .param("city", city)
                .query(Saved.class).optional();
    }

    record Saved(UUID id, boolean created) {}

    /** Approved reviews of clients who agreed to be shown, newest first. */
    List<Review> published(int limit) {
        return jdbc.sql("select " + COLUMNS + " from reviews where status = 'approved' and show_publicly"
                        + " order by created_at desc limit :l")
                .param("l", limit).query(Review.class).list();
    }

    /** For the back office; status null means all. */
    List<Review> all(String status) {
        return jdbc.sql("select " + COLUMNS + " from reviews where (cast(:s as text) is null or status = :s)"
                        + " order by created_at desc")
                .param("s", status).query(Review.class).list();
    }

    boolean setStatus(UUID id, String status) {
        return jdbc.sql("update reviews set status = :s, updated_at = now() where id = :id")
                .param("s", status).param("id", id).update() > 0;
    }

    void deleteForRides(List<UUID> rideIds) {
        if (!rideIds.isEmpty()) {
            jdbc.sql("delete from reviews where ride_id in (:ids)").param("ids", rideIds).update();
        }
    }
}
