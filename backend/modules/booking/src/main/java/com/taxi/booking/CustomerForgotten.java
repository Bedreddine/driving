package com.taxi.booking;

import java.util.List;
import java.util.UUID;

/**
 * Published inside the transaction when a customer is erased (account deletion or GDPR request):
 * other modules delete what they keep about these rides (e.g. the review module, the customer's reviews).
 */
public record CustomerForgotten(UUID contactId, List<UUID> rideIds) {}
