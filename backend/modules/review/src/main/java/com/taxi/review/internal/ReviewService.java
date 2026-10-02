package com.taxi.review.internal;

import com.taxi.booking.CustomerForgotten;
import com.taxi.booking.RideDirectory;
import com.taxi.booking.RideDirectory.RideFacts;
import com.taxi.booking.RideReviews;
import com.taxi.review.ReviewSubmitted;
import com.taxi.shared.ApiException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * <pre>
 *   ride completed ──client writes──▶ pending ──approve──▶ approved ◀─┐
 *                     (edits allowed)    │                    │ hide  │ approve
 *                                        └──hide──▶ hidden ◀──┘───────┘
 * </pre>
 * Once the owner moderated a review (approved or hidden) the client can no longer change it.
 * Public: only approved reviews of clients who agreed to be shown, under a short name ("J. Smith").
 */
@Service
class ReviewService implements RideReviews {

    static final Set<String> STATUSES = Set.of("pending", "approved", "hidden");
    static final int MAX_COMMENT = 1000;
    static final int MAX_CITY = 60;
    private static final int PUBLIC_LIMIT = 20;
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    record Input(Integer rating, String comment, Boolean showPublicly, String city) {}

    record PublicReview(int rating, String comment, String displayName, String city, String month) {}

    record AdminReview(UUID id, UUID rideId, String clientName, String displayName, int rating, String comment,
                       boolean showPublicly, String city, String status, OffsetDateTime pickupAt,
                       OffsetDateTime createdAt) {}

    private final ReviewRepository reviews;
    private final RideDirectory rides;
    private final ApplicationEventPublisher events;

    ReviewService(ReviewRepository reviews, RideDirectory rides, ApplicationEventPublisher events) {
        this.reviews = reviews;
        this.rides = rides;
        this.events = events;
    }

    /** What the private ride page shows: may the client (still) review, and their review if any. */
    @Override
    public Reviewing of(RideFacts ride) {
        var review = reviews.forRide(ride.id());
        var canReview = ride.completed() && !ride.customerForgotten()
                && review.map(r -> "pending".equals(r.status())).orElse(true);
        return new Reviewing(canReview, review.map(r -> new Review(r.rating(), r.comment(),
                r.showPublicly(), r.city(), r.status())).orElse(null));
    }

    /** The client reviews their ride from its private link (no account needed). */
    @Transactional
    public void submit(String accessToken, Input in) {
        var rating = in.rating();
        var comment = blankToNull(in.comment());
        var city = blankToNull(in.city());
        if (rating == null || rating < 1 || rating > 5
                || (comment != null && comment.length() > MAX_COMMENT) || (city != null && city.length() > MAX_CITY)) {
            throw ApiException.badRequest("BAD_REVIEW");
        }
        var ride = rides.byAccessToken(accessToken).filter(r -> !r.customerForgotten())
                .orElseThrow(ApiException::notFound);
        if (!ride.completed()) {
            throw ApiException.conflict("RIDE_NOT_COMPLETED");
        }
        var saved = reviews.save(ride.id(), rating, comment, Boolean.TRUE.equals(in.showPublicly()), city)
                .orElseThrow(() -> ApiException.conflict("REVIEW_LOCKED"));
        if (saved.created()) {
            events.publishEvent(new ReviewSubmitted(saved.id(), ride.id(), rating));
        }
    }

    /** The reference clients shown on the website, newest first. */
    public List<PublicReview> published() {
        var list = reviews.published(PUBLIC_LIMIT);
        var facts = rides.find(list.stream().map(ReviewRepository.Review::rideId).toList());
        return list.stream()
                .filter(r -> facts.containsKey(r.rideId()) && !facts.get(r.rideId()).customerForgotten())
                .map(r -> {
                    var ride = facts.get(r.rideId());
                    return new PublicReview(r.rating(), r.comment(), DisplayNames.of(ride.customerName()), r.city(),
                            ride.pickupAt().atZoneSameInstant(PARIS).format(MONTH));
                })
                .toList();
    }

    /** Back office list; status null for all. */
    public List<AdminReview> forOwner(String status) {
        if (status != null && !STATUSES.contains(status)) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        var list = reviews.all(status);
        var facts = rides.find(list.stream().map(ReviewRepository.Review::rideId).toList());
        return list.stream()
                .map(r -> {
                    var ride = facts.get(r.rideId());
                    String name = ride == null ? null : ride.customerName();
                    return new AdminReview(r.id(), r.rideId(), name, DisplayNames.of(name), r.rating(), r.comment(),
                            r.showPublicly(), r.city(), r.status(), ride == null ? null : ride.pickupAt(),
                            r.createdAt());
                })
                .toList();
    }

    /** approved or hidden; either way round (an approved review can be hidden later, and back). */
    @Transactional
    public void moderate(UUID reviewId, String status) {
        if (!reviews.setStatus(reviewId, status)) {
            throw ApiException.notFound();
        }
    }

    /** An erased customer's reviews go with the rest of their personal data (same transaction). */
    @EventListener
    void on(CustomerForgotten e) {
        reviews.deleteForRides(e.rideIds());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
