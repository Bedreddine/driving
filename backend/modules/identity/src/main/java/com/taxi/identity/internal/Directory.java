package com.taxi.identity.internal;

import com.taxi.identity.AccessTokens;
import com.taxi.identity.Role;
import com.taxi.identity.UserDirectory;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

/** Public, read-only views of the identity module for other modules. */
@Component
class Directory implements UserDirectory, AccessTokens {

    private final UserRepository users;
    private final JwtDecoder decoder;

    Directory(UserRepository users, JwtDecoder decoder) {
        this.users = users;
        this.decoder = decoder;
    }

    @Override
    public Map<UUID, String> languages(Collection<UUID> userIds) {
        return users.findAll(new ArrayList<>(userIds)).stream()
                .collect(Collectors.toMap(UserRepository.UserRow::id, UserRepository.UserRow::language));
    }

    @Override
    public List<UUID> adminIds() {
        return users.usersWithRole(Role.ADMIN);
    }

    @Override
    public Optional<Account> find(UUID userId) {
        return users.findById(userId)
                .map(u -> new Account(u.id(), u.email(), u.emailVerified(), u.fullName(), u.phone()));
    }

    @Override
    public Optional<UUID> verify(String token) {
        try {
            return Optional.of(UUID.fromString(decoder.decode(token).getSubject()));
        } catch (JwtException | IllegalArgumentException | NullPointerException e) {
            return Optional.empty();
        }
    }
}
