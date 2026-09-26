package com.taxi.identity;

import com.taxi.shared.ApiException;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** The signed-in person for the current request, read from the access token. */
@Component
public class CurrentUser {

    public UUID id() {
        return UUID.fromString(authentication().getName());
    }

    public Set<Role> roles() {
        return authentication().getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> Role.of(a.substring(5)))
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean isAdmin() {
        return roles().contains(Role.ADMIN);
    }

    /** Driver or admin: someone working for the business. */
    public boolean isStaff() {
        var roles = roles();
        return roles.contains(Role.DRIVER) || roles.contains(Role.ADMIN);
    }

    private Authentication authentication() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        }
        return auth;
    }
}
