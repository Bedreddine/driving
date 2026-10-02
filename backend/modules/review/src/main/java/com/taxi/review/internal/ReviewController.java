package com.taxi.review.internal;

import com.taxi.review.internal.ReviewService.AdminReview;
import com.taxi.review.internal.ReviewService.Input;
import com.taxi.review.internal.ReviewService.PublicReview;
import com.taxi.shared.ApiException;
import com.taxi.shared.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Reviews: written from the ride's private link, moderated in the back office, shown on the website. */
@RestController
class ReviewController {

    private static final Duration HOUR = Duration.ofHours(1);

    private final ReviewService reviews;
    private final RateLimiter limiter;
    private final int maxReviews;

    ReviewController(ReviewService reviews, RateLimiter limiter,
                     @Value("${taxi.public.max-reviews-per-hour:20}") int maxReviews) {
        this.reviews = reviews;
        this.limiter = limiter;
        this.maxReviews = maxReviews;
    }

    /** Create or edit (until moderated) the review of a completed ride. */
    @PutMapping("/api/public/bookings/{token}/review")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void review(@PathVariable String token, @RequestBody Input body, HttpServletRequest request) {
        if (!limiter.allow("review:" + request.getRemoteAddr(), maxReviews, HOUR)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
        reviews.submit(token, body);
    }

    /** Reference clients for the booking website. */
    @GetMapping("/api/public/reviews")
    List<PublicReview> published() {
        return reviews.published();
    }

    @GetMapping("/api/admin/reviews")
    List<AdminReview> list(@RequestParam(required = false) String status) {
        return reviews.forOwner(status);
    }

    @PostMapping("/api/admin/reviews/{id}/approve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void approve(@PathVariable UUID id) {
        reviews.moderate(id, "approved");
    }

    @PostMapping("/api/admin/reviews/{id}/hide")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void hide(@PathVariable UUID id) {
        reviews.moderate(id, "hidden");
    }
}
