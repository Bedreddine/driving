package com.taxi.identity.internal;

import com.taxi.identity.IdentityEvents.OwnerAssigned;
import com.taxi.identity.IdentityEvents.UserDeleting;
import com.taxi.identity.IdentityEvents.UserRegistered;
import com.taxi.identity.Owners;
import com.taxi.identity.Role;
import com.taxi.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AuthService implements Owners {

    record Tokens(String accessToken, String refreshToken, long expiresIn) {}

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int MAX_EMAIL = 254;
    /** BCrypt only uses the first 72 bytes of a password (and refuses longer ones). */
    static final int MAX_PASSWORD_BYTES = 72;

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JwtEncoder jwt;
    private final SecurityProperties props;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AuthService.class);
    // Checked when the email is unknown, so a wrong email takes as long as a wrong password.
    private final String dummyHash;

    AuthService(UserRepository users, PasswordEncoder passwords, JwtEncoder jwt, SecurityProperties props,
                ApplicationEventPublisher events, Clock clock) {
        this.users = users;
        this.passwords = passwords;
        this.jwt = jwt;
        this.props = props;
        this.events = events;
        this.clock = clock;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    Tokens signUp(String email, String password, String fullName, String phone, String language) {
        var cleanEmail = email == null ? "" : email.trim();
        if (cleanEmail.length() > MAX_EMAIL || !EMAIL.matcher(cleanEmail).matches()) {
            throw ApiException.badRequest("BAD_EMAIL");
        }
        if (password == null || password.length() < 8) {
            throw ApiException.badRequest("WEAK_PASSWORD");
        }
        if (tooLong(password)) {
            throw ApiException.badRequest("PASSWORD_TOO_LONG");
        }
        var name = fullName == null || fullName.isBlank() ? cleanEmail : fullName.trim();
        var cleanPhone = phone == null || phone.isBlank() ? null : phone.trim();
        UUID id;
        try {
            id = users.insert(cleanEmail, passwords.encode(password), name, cleanPhone, normalizeLanguage(language));
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("EMAIL_TAKEN");
        }
        users.addRole(id, Role.CUSTOMER);
        events.publishEvent(new UserRegistered(id, cleanEmail, name, cleanPhone, normalizeLanguage(language)));
        return issue(id);
    }

    @Transactional
    Tokens login(String email, String password) {
        var user = users.findByEmail(email == null ? "" : email.trim());
        var hash = user.map(UserRepository.UserRow::passwordHash).orElse(dummyHash);
        // A password BCrypt cannot check is simply wrong (same answer and about the same time as any wrong one).
        var given = password == null || tooLong(password) ? "" : password;
        var matches = passwords.matches(given, hash) && !tooLong(password);
        if (user.isEmpty() || !matches) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        return issue(user.get().id());
    }

    /**
     * Rotation: each refresh token works once and is replaced by a new one of the same sign-in ("family").
     * A token used a second time means it was copied (stolen, or replayed): the whole sign-in is ended, so the
     * thief's tokens stop working too (the real user signs in again). Not rolled back by the refusal.
     */
    @Transactional(noRollbackFor = ApiException.class)
    Tokens refresh(String refreshToken) {
        var now = clock.instant();
        var tokenHash = hash(refreshToken);
        var consumed = users.consumeRefreshToken(tokenHash, now);
        if (consumed.isEmpty()) {
            users.usedRefreshTokenFamily(tokenHash, now).ifPresent(family -> {
                int ended = users.revokeRefreshTokenFamily(family, now);
                log.warn("A used refresh token was presented again: sign-in ended ({} active token(s) revoked)", ended);
            });
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        }
        return issue(consumed.get().userId(), consumed.get().familyId());
    }

    /** Ends this sign-in (every token of its family). Access tokens already given expire on their own (15 min). */
    @Transactional
    void logout(String refreshToken) {
        users.familyOf(hash(refreshToken)).ifPresent(family -> users.revokeRefreshTokenFamily(family, clock.instant()));
    }

    /** Customers delete their own account; the owner's account holds the business and is refused. */
    @Transactional
    void deleteAccount(UUID userId) {
        var roles = users.roles(userId);
        if (roles.contains(Role.DRIVER) || roles.contains(Role.ADMIN)) {
            throw ApiException.badRequest("STAFF_ACCOUNT");
        }
        events.publishEvent(new UserDeleting(userId));
        users.delete(userId);
    }

    @Override
    @Transactional
    public UUID makeOwner(String email) {
        var user = users.findByEmail(email).orElseThrow(ApiException::notFound);
        users.addRole(user.id(), Role.ADMIN);
        users.addRole(user.id(), Role.DRIVER);
        events.publishEvent(new OwnerAssigned(user.id(), user.fullName()));
        return user.id();
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    @Transactional
    void cleanUpRefreshTokens() {
        users.deleteExpiredRefreshTokens(clock.instant());
    }

    private Tokens issue(UUID userId) {
        return issue(userId, UUID.randomUUID()); // a new sign-in
    }

    private Tokens issue(UUID userId, UUID familyId) {
        Instant now = clock.instant();
        Set<Role> roles = users.roles(userId);
        var claims = JwtClaimsSet.builder()
                .issuer("taxi")
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(props.accessTokenTtl()))
                .claim("roles", roles.stream().map(Role::value).sorted().toList())
                .build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        var access = jwt.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        var bytes = new byte[32];
        random.nextBytes(bytes);
        var refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        users.saveRefreshToken(userId, hash(refresh), familyId, now.plus(props.refreshTokenTtl()));
        return new Tokens(access, refresh, props.accessTokenTtl().toSeconds());
    }

    private static boolean tooLong(String password) {
        return password != null && password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES;
    }

    static String normalizeLanguage(String language) {
        return "en".equals(language) ? "en" : "fr";
    }

    private static String hash(String token) {
        if (token == null) {
            return "";
        }
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
