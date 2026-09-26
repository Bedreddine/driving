package com.taxi.identity;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Read-only facts about accounts, for other modules. */
public interface UserDirectory {

    /** Preferred language ("fr" / "en") of each given user. */
    Map<UUID, String> languages(Collection<UUID> userIds);

    List<UUID> adminIds();

    Optional<Account> find(UUID userId);

    record Account(UUID id, String email, boolean emailVerified, String fullName, String phone) {}
}
