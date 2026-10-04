package com.taxi.booking.internal;

import static com.taxi.booking.internal.DriverRepository.utc;

import com.taxi.booking.RideMessagePosted;
import com.taxi.shared.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Short messages between the driver and the client of one ride ("I'm at door B", "5 minutes late").
 * Open while the ride is requested, price_proposed or accepted, until 12 hours after pickup; readable afterwards.
 * Personal data: deleted with the customer's personal data (RideRepository.stripPersonalData) and 90 days after
 * pickup (RideRepository.applyRetention).
 */
@Component
class RideMessages {

    static final int MAX_LENGTH = 500;
    static final Duration OPEN_AFTER_PICKUP = Duration.ofHours(12);

    /** @param from "driver" or "client" */
    record Message(UUID id, String from, String body, OffsetDateTime at) {}

    private final JdbcClient jdbc;
    private final RideRepository rides;
    private final Notices notices;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    RideMessages(JdbcClient jdbc, RideRepository rides, Notices notices, ApplicationEventPublisher events,
                 Clock clock) {
        this.jdbc = jdbc;
        this.rides = rides;
        this.notices = notices;
        this.events = events;
        this.clock = clock;
    }

    /** Oldest first. */
    List<Message> of(UUID rideId) {
        return jdbc.sql("""
                select id, sender as "from", body, created_at as at from ride_messages
                where ride_id = :r order by created_at, id limit 1000""")
                .param("r", rideId).query(Message.class).list();
    }

    /** The body, trimmed; BAD_INPUT when empty or too long. */
    static String clean(String body) {
        var text = body == null ? "" : body.strip();
        if (text.isEmpty() || text.length() > MAX_LENGTH) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        return text;
    }

    void requireOpen(Ride ride) {
        var open = RideStatus.OPEN.contains(ride.rideStatus())
                && clock.instant().isBefore(ride.pickup().plus(OPEN_AFTER_PICKUP));
        if (!open) {
            throw ApiException.conflict("MESSAGES_CLOSED");
        }
    }

    /** Saves a message (body already cleaned) and tells the other side. */
    @Transactional
    public Message post(UUID rideId, String from, String body) {
        var ride = rides.lock(rideId).orElseThrow(ApiException::notFound);
        requireOpen(ride);
        var now = clock.instant();
        var message = jdbc.sql("""
                insert into ride_messages (ride_id, sender, body, created_at) values (:r, :s, :b, :at)
                returning id, sender as "from", body, created_at as at""")
                .param("r", ride.id()).param("s", from).param("b", body).param("at", utc(now))
                .query(Message.class).single();
        var c = notices.about(ride);
        events.publishEvent(new RideMessagePosted(UUID.randomUUID(), ride.id(), message.id(), from, body, now,
                c.customerUser(), c.driverUser(), firstName(c.customer().fullName()), c.customer().language(),
                ride.accessToken()));
        return message;
    }

    static String firstName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return null;
        }
        return fullName.strip().split("\\s+")[0];
    }
}
