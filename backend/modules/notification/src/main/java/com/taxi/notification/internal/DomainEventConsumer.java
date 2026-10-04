package com.taxi.notification.internal;

import com.taxi.booking.CustomerForgotten;
import com.taxi.booking.EventTopics;
import com.taxi.booking.RideChanged;
import com.taxi.booking.RideMessagePosted;
import com.taxi.booking.RideMomentReached;
import com.taxi.review.ReviewSubmitted;
import com.taxi.shared.EventJson;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.JacksonException;

/**
 * Reads the domain events from Kafka (consumer group {@value #GROUP}) and hands each one to its listener.
 * <ul>
 *   <li>Message format: JSON body (snake_case), header {@value EventTopics#EVENT_TYPE_HEADER} with the event's name.</li>
 *   <li>Idempotent: the event id is marked in processed_events in the same transaction as the listener's writes
 *       (notices, queued emails / SMS); a redelivered event is skipped.</li>
 *   <li>After that transaction: open screens are told (WebSocket) and browsers pushed, first delivery only.</li>
 *   <li>Failures are retried with back-off, then the message goes to the dead-letter topic (see
 *       {@link EventConsumerConfig}); an unreadable message goes there at once.</li>
 * </ul>
 * One ride's events share a partition (key = ride id), so they are handled in the order they happened.
 */
@Component
class DomainEventConsumer {

    static final String GROUP = "taxi-notification";

    private static final Logger log = LoggerFactory.getLogger(DomainEventConsumer.class);

    private record Handler<E>(Class<E> type, Function<E, UUID> id, Consumer<E> store, Consumer<E> afterCommit) {}

    private final Map<String, Handler<?>> handlers;
    private final ProcessedEvents processed;
    private final TransactionTemplate tx;
    private final EventJson json;

    DomainEventConsumer(RideChangeListener rideChanges, RideMomentListener moments, RideMessageListener messages,
                        ReviewListener reviews, CustomerMessages customerMessages, WebPushes webPushes,
                        ProcessedEvents processed, TransactionTemplate tx, EventJson json) {
        this.processed = processed;
        this.tx = tx;
        this.json = json;
        this.handlers = Map.of(
                RideChanged.class.getSimpleName(), new Handler<>(RideChanged.class, RideChanged::eventId,
                        rideChanges::store, rideChanges::afterCommit),
                RideMomentReached.class.getSimpleName(), new Handler<>(RideMomentReached.class,
                        RideMomentReached::eventId, moments::store, moments::afterCommit),
                RideMessagePosted.class.getSimpleName(), new Handler<>(RideMessagePosted.class,
                        RideMessagePosted::eventId, messages::store, messages::afterCommit),
                ReviewSubmitted.class.getSimpleName(), new Handler<>(ReviewSubmitted.class, ReviewSubmitted::eventId,
                        reviews::on, e -> {}),
                CustomerForgotten.class.getSimpleName(), new Handler<>(CustomerForgotten.class,
                        CustomerForgotten::eventId, e -> {
                            // The erased customer's emails / SMS, conversation notices and browsers, all at once.
                            customerMessages.on(e);
                            messages.on(e);
                            webPushes.on(e);
                        }, e -> {}));
    }

    /** Not started by one-off commands (--taxi.make-owner): they exit at once and must not join the group. */
    private static final String NOT_A_ONE_OFF = "#{environment['taxi.make-owner'] == null}";

    @KafkaListener(id = "notification-ride-events", groupId = GROUP, topics = EventTopics.RIDE_EVENTS,
            autoStartup = NOT_A_ONE_OFF)
    void onRideEvent(ConsumerRecord<String, byte[]> record) {
        handle(record);
    }

    @KafkaListener(id = "notification-customer-events", groupId = GROUP, topics = EventTopics.CUSTOMER_EVENTS,
            autoStartup = NOT_A_ONE_OFF)
    void onCustomerEvent(ConsumerRecord<String, byte[]> record) {
        handle(record);
    }

    void handle(ConsumerRecord<String, byte[]> record) {
        var header = record.headers().lastHeader(EventTopics.EVENT_TYPE_HEADER);
        var type = header == null ? null : new String(header.value(), StandardCharsets.UTF_8);
        var handler = type == null ? null : handlers.get(type);
        if (handler == null) {
            throw new UnreadableEvent("unknown event type at " + where(record));
        }
        process(handler, record);
    }

    private <E> void process(Handler<E> handler, ConsumerRecord<String, byte[]> record) {
        E event;
        try {
            event = record.value() == null ? null : json.mapper().readValue(record.value(), handler.type());
        } catch (JacksonException e) {
            // Jackson's message may quote the content (names, addresses): only its kind is kept.
            throw new UnreadableEvent("unreadable " + handler.type().getSimpleName() + " at " + where(record)
                    + " (" + e.getClass().getSimpleName() + ")");
        }
        var eventId = event == null ? null : handler.id().apply(event);
        if (eventId == null) {
            throw new UnreadableEvent(handler.type().getSimpleName() + " without event id at " + where(record));
        }
        var first = tx.execute(status -> {
            if (!processed.firstTime(eventId)) {
                return false;
            }
            handler.store().accept(event);
            return true;
        });
        if (!Boolean.TRUE.equals(first)) {
            log.debug("Event {} already processed: skipped", eventId);
            return;
        }
        try {
            handler.afterCommit().accept(event);
        } catch (RuntimeException e) {
            // Saved already; a missed screen refresh or browser push is not worth a redelivery.
            log.warn("After-commit step of event {} failed: {}", eventId, e.getClass().getSimpleName());
        }
    }

    private static String where(ConsumerRecord<?, ?> record) {
        return record.topic() + "-" + record.partition() + "@" + record.offset();
    }

    /** A message that will never be readable: not retried, sent straight to the dead-letter topic. */
    static class UnreadableEvent extends RuntimeException {
        UnreadableEvent(String message) {
            super(message, null, false, false);
        }
    }
}
