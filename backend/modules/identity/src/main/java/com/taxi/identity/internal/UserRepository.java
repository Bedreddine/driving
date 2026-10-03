package com.taxi.identity.internal;

import com.taxi.identity.Role;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class UserRepository {

    record UserRow(UUID id, String email, String passwordHash, boolean emailVerified, String fullName, String phone,
                   String language) {}

    private final JdbcClient jdbc;

    UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<UserRow> findByEmail(String email) {
        return jdbc.sql("""
                select id, email, password_hash, email_verified, full_name, phone, language
                from users where lower(email) = lower(:email)""")
                .param("email", email)
                .query(UserRow.class)
                .optional();
    }

    Optional<UserRow> findById(UUID id) {
        return jdbc.sql("""
                select id, email, password_hash, email_verified, full_name, phone, language
                from users where id = :id""")
                .param("id", id)
                .query(UserRow.class)
                .optional();
    }

    UUID insert(String email, String passwordHash, String fullName, String phone, String language) {
        return jdbc.sql("""
                insert into users (email, password_hash, full_name, phone, language)
                values (:email, :hash, :name, :phone, :language) returning id""")
                .param("email", email)
                .param("hash", passwordHash)
                .param("name", fullName)
                .param("phone", phone)
                .param("language", language)
                .query(UUID.class)
                .single();
    }

    void updateProfile(UUID id, String fullName, String phone, String language) {
        jdbc.sql("""
                update users set full_name = coalesce(:name, full_name),
                                 phone = case when cast(:phone as text) is null then phone else nullif(:phone, '') end,
                                 language = coalesce(:language, language)
                where id = :id""")
                .param("id", id)
                .param("name", fullName)
                .param("phone", phone)
                .param("language", language)
                .update();
    }

    void delete(UUID id) {
        jdbc.sql("delete from users where id = :id").param("id", id).update();
    }

    Set<Role> roles(UUID userId) {
        return jdbc.sql("select role from user_roles where user_id = :id")
                .param("id", userId)
                .query(String.class)
                .list()
                .stream()
                .map(Role::of)
                .collect(Collectors.toUnmodifiableSet());
    }

    void addRole(UUID userId, Role role) {
        jdbc.sql("insert into user_roles (user_id, role) values (:id, :role) on conflict do nothing")
                .param("id", userId)
                .param("role", role.value())
                .update();
    }

    List<UUID> usersWithRole(Role role) {
        return jdbc.sql("select user_id from user_roles where role = :role")
                .param("role", role.value())
                .query(UUID.class)
                .list();
    }

    List<UserRow> findAll(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                select id, email, password_hash, email_verified, full_name, phone, language
                from users where id in (:ids)""")
                .param("ids", ids)
                .query(UserRow.class)
                .list();
    }

    // --- refresh tokens (only their SHA-256 hash is stored) ---

    /** The owner of a refresh token and its sign-in (family: the tokens that replaced one another). */
    record Consumed(UUID userId, UUID familyId) {}

    void saveRefreshToken(UUID userId, String tokenHash, UUID familyId, Instant expiresAt) {
        jdbc.sql("insert into refresh_tokens (user_id, token_hash, family_id, expires_at) values (:u, :h, :f, :e)")
                .param("u", userId)
                .param("h", tokenHash)
                .param("f", familyId)
                .param("e", java.sql.Timestamp.from(expiresAt))
                .update();
    }

    /** Marks the token used and returns its owner, if it was valid. One refresh token works once. */
    Optional<Consumed> consumeRefreshToken(String tokenHash, Instant now) {
        return jdbc.sql("""
                update refresh_tokens set revoked_at = :now
                where token_hash = :h and revoked_at is null and expires_at > :now
                returning user_id, family_id""")
                .param("h", tokenHash)
                .param("now", java.sql.Timestamp.from(now))
                .query(Consumed.class)
                .optional();
    }

    /** The sign-in of a token that was already used or revoked (and has not expired): a replay. */
    Optional<UUID> usedRefreshTokenFamily(String tokenHash, Instant now) {
        return jdbc.sql("""
                select family_id from refresh_tokens
                where token_hash = :h and revoked_at is not null and expires_at > :now""")
                .param("h", tokenHash)
                .param("now", java.sql.Timestamp.from(now))
                .query(UUID.class)
                .optional();
    }

    Optional<UUID> familyOf(String tokenHash) {
        return jdbc.sql("select family_id from refresh_tokens where token_hash = :h")
                .param("h", tokenHash)
                .query(UUID.class)
                .optional();
    }

    /** Ends a sign-in: every still-valid token of the family. Returns how many were revoked. */
    int revokeRefreshTokenFamily(UUID familyId, Instant now) {
        return jdbc.sql("update refresh_tokens set revoked_at = :now where family_id = :f and revoked_at is null")
                .param("f", familyId)
                .param("now", java.sql.Timestamp.from(now))
                .update();
    }

    /** Used tokens are kept a week, so a replay is still recognised (and ends the sign-in) after rotation. */
    void deleteExpiredRefreshTokens(Instant now) {
        jdbc.sql("delete from refresh_tokens where expires_at < :now or revoked_at < :now - interval '7 days'")
                .param("now", java.sql.Timestamp.from(now))
                .update();
    }
}
