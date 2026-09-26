package com.taxi.booking.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Background work. Safe with one app instance; with several instances, add a lock (e.g. ShedLock)
 * so each job runs once.
 */
@Component
class BookingJobs {

    private static final Logger log = LoggerFactory.getLogger(BookingJobs.class);

    private final RideLifecycle lifecycle;
    private final RideRepository rides;
    private final ContactRepository contacts;

    BookingJobs(RideLifecycle lifecycle, RideRepository rides, ContactRepository contacts) {
        this.lifecycle = lifecycle;
        this.rides = rides;
        this.contacts = contacts;
    }

    @Scheduled(fixedDelayString = "${taxi.jobs.expiry-delay:PT1M}", initialDelayString = "PT30S")
    void expireAndRemind() {
        int expired = lifecycle.expireOverdue();
        int reminded = lifecycle.remindOpenRides();
        if (expired + reminded > 0) {
            log.info("Expired {} unanswered rides, reminded {} rides to close", expired, reminded);
        }
    }

    /** Data retention, every night (see design doc, "Privacy and data"). */
    @Scheduled(cron = "0 15 3 * * *", zone = "UTC")
    @Transactional
    void retention() {
        rides.applyRetention();
        int removed = contacts.deleteInactiveWithoutRides();
        log.info("Retention done, {} inactive contacts removed", removed);
    }
}
