package com.taxi.notification.internal;

import com.taxi.identity.UserDirectory;
import com.taxi.review.ReviewSubmitted;
import java.util.Map;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** The owner is told in the app (and by push) when a client leaves a review to moderate. */
@Component
class ReviewListener {

    private final NotificationRepository repo;
    private final UserDirectory users;

    ReviewListener(NotificationRepository repo, UserDirectory users) {
        this.repo = repo;
        this.users = users;
    }

    /** Stored in the same transaction as the review. */
    @EventListener
    void on(ReviewSubmitted e) {
        for (var admin : users.adminIds()) {
            repo.insert(admin, e.rideId(), "new_review", Map.of("review_id", e.reviewId(), "rating", e.rating()));
        }
    }
}
