package com.taxi.booking;

import java.util.List;
import java.util.UUID;
import org.springframework.modulith.events.Externalized;

/**
 * Published inside the transaction when a customer is erased (account deletion or GDPR request):
 * other modules delete what they keep about these rides. The review module does it in the same transaction
 * (in-process listener); the notification module reads it from Kafka (topic taxi.customer-events, keyed by contact)
 * and deletes the emails / SMS, notices and browser subscriptions of these rides.
 *
 * @param eventId unique per event, so that consumers can ignore a delivery they already handled
 */
@Externalized(EventTopics.CUSTOMER_EVENTS + "::#{contactId()}")
public record CustomerForgotten(UUID eventId, UUID contactId, List<UUID> rideIds) {}
