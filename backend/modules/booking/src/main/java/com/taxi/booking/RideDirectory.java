package com.taxi.booking;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Read-only facts about rides and their customer, for other modules. */
public interface RideDirectory {

    /** The ride behind a private link /b/{token}, or empty for an unknown token. */
    Optional<RideFacts> byAccessToken(String accessToken);

    /** The given rides (unknown ids are left out). */
    Map<UUID, RideFacts> find(Collection<UUID> rideIds);

    /**
     * @param customerName      the customer's current full name (read every time: follows profile changes)
     * @param customerForgotten the customer was erased (GDPR): nothing personal may be shown about them
     */
    record RideFacts(UUID id, String status, OffsetDateTime pickupAt, String customerName, boolean customerForgotten) {

        public boolean completed() {
            return "completed".equals(status);
        }
    }
}
