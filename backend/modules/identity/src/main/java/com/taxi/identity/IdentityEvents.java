package com.taxi.identity;

import java.util.UUID;

/**
 * Events other modules react to. They are published inside the same transaction,
 * so a listener failure rolls the whole operation back.
 */
public final class IdentityEvents {

    private IdentityEvents() {}

    /** A new account was created (the booking module creates the matching customer contact). */
    public record UserRegistered(UUID userId, String email, String fullName, String phone) {}

    /** An account is about to be deleted (the booking module cancels open rides and anonymizes data). */
    public record UserDeleting(UUID userId) {}

    /** An account became the business owner (the booking module links it to the driver). */
    public record OwnerAssigned(UUID userId, String displayName) {}
}
