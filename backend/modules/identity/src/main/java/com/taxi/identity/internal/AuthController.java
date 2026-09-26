package com.taxi.identity.internal;

import com.taxi.identity.CurrentUser;
import com.taxi.identity.Role;
import com.taxi.shared.ApiException;
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

    AuthController(AuthService auth, UserRepository users, CurrentUser currentUser) {
        this.auth = auth;
        this.users = users;
        this.currentUser = currentUser;
    }

    @PostMapping("/api/auth/signup")
    @ResponseStatus(HttpStatus.CREATED)
    AuthService.Tokens signUp(@RequestBody @jakarta.validation.Valid SignUpRequest body) {
        return auth.signUp(body.email(), body.password(), body.fullName(), body.phone(), body.language());
    }

    @PostMapping("/api/auth/login")
    AuthService.Tokens login(@RequestBody LoginRequest body) {
        return auth.login(body.email(), body.password());
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

    @PatchMapping("/api/me")
    Me updateMe(@RequestBody @jakarta.validation.Valid ProfileUpdate body) {
        var language = body.language() == null ? null : AuthService.normalizeLanguage(body.language());
        var name = body.fullName() == null ? null : body.fullName().trim();
        users.updateProfile(currentUser.id(), name, body.phone() == null ? null : body.phone().trim(), language);
        return me();
    }

    @DeleteMapping("/api/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteMe() {
        auth.deleteAccount(currentUser.id());
    }
}
