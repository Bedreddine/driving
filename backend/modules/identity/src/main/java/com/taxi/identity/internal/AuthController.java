package com.taxi.identity.internal;

import com.taxi.identity.CurrentUser;
import com.taxi.identity.IdentityEvents;
import com.taxi.identity.Role;
import com.taxi.shared.ApiException;
import com.taxi.shared.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.annotation.Transactional;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuthController {

    record SignUpRequest(String email, String password, @Size(max = 200) String fullName,
                         @Size(max = 40) String phone, String language) {}

    record LoginRequest(String email, String password) {}

    record RefreshRequest(String refreshToken) {}

    record Me(UUID id, String email, boolean emailVerified, String fullName, String phone, String language,
              List<String> roles) {}

    record ProfileUpdate(@Size(max = 200) String fullName, @Size(max = 40) String phone, String language) {}

    private final AuthService auth;
    private final UserRepository users;
    private final CurrentUser currentUser;
    private final RateLimiter limiter;
    private final ApplicationEventPublisher events;

    private final int maxSignups;
    private final int maxLoginsPerIp;
    private final int maxLoginsPerAccount;

    AuthController(AuthService auth, UserRepository users, CurrentUser currentUser, RateLimiter limiter,
                   ApplicationEventPublisher events,
                   @Value("${taxi.auth.max-signups-per-hour:10}") int maxSignups,
                   @Value("${taxi.auth.max-logins-per-hour:50}") int maxLoginsPerIp,
                   @Value("${taxi.auth.max-logins-per-account-per-15-min:10}") int maxLoginsPerAccount) {
        this.maxSignups = maxSignups;
        this.maxLoginsPerIp = maxLoginsPerIp;
        this.maxLoginsPerAccount = maxLoginsPerAccount;
        this.auth = auth;
        this.users = users;
        this.currentUser = currentUser;
        this.limiter = limiter;
        this.events = events;
    }

    @PostMapping("/api/auth/signup")
    @ResponseStatus(HttpStatus.CREATED)
    AuthService.Tokens signUp(@RequestBody @jakarta.validation.Valid SignUpRequest body, HttpServletRequest request) {
        limit("signup:" + request.getRemoteAddr(), maxSignups, Duration.ofHours(1));
        return auth.signUp(body.email(), body.password(), body.fullName(), body.phone(), body.language());
    }

    /** Limited per address and per account, against password guessing. */
    @PostMapping("/api/auth/login")
    AuthService.Tokens login(@RequestBody LoginRequest body, HttpServletRequest request) {
        limit("login-ip:" + request.getRemoteAddr(), maxLoginsPerIp, Duration.ofHours(1));
        var email = body.email() == null ? "" : body.email().trim().toLowerCase(java.util.Locale.ROOT);
        limit("login-email:" + email, maxLoginsPerAccount, Duration.ofMinutes(15));
        return auth.login(body.email(), body.password());
    }

    private void limit(String key, int max, Duration window) {
        if (!limiter.allow(key, max, window)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
    }

    @PostMapping("/api/auth/refresh")
    AuthService.Tokens refresh(@RequestBody RefreshRequest body) {
        return auth.refresh(body.refreshToken());
    }

    @PostMapping("/api/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@RequestBody RefreshRequest body) {
        auth.logout(body.refreshToken());
    }

    @GetMapping("/api/me")
    Me me() {
        var id = currentUser.id();
        var u = users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED"));
        // Roles come from the database, not the token, so the app sees changes immediately.
        var roles = users.roles(id).stream().map(Role::value).sorted().toList();
        return new Me(u.id(), u.email(), u.emailVerified(), u.fullName(), u.phone(), u.language(), roles);
    }

    /** The driver's view of the customer (contact) follows the change, in the same transaction. */
    @PatchMapping("/api/me")
    @Transactional
    Me updateMe(@RequestBody @jakarta.validation.Valid ProfileUpdate body) {
        var language = body.language() == null ? null : AuthService.normalizeLanguage(body.language());
        var name = body.fullName() == null ? null : body.fullName().trim();
        users.updateProfile(currentUser.id(), name, body.phone() == null ? null : body.phone().trim(), language);
        var me = me();
        events.publishEvent(new IdentityEvents.ProfileUpdated(me.id(), me.fullName(), me.phone(), me.language()));
        return me;
    }

    @DeleteMapping("/api/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteMe() {
        auth.deleteAccount(currentUser.id());
    }
}
