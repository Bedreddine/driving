package com.taxi.notification.internal;

import com.taxi.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class NotificationController {

    /** Expo push tokens look like ExponentPushToken[xxxx]. */
    record TokenBody(@NotBlank @Size(max = 200) @Pattern(regexp = "^(Exponent|Expo)PushToken\\[.+]$") String token) {}

    private final NotificationRepository repo;
    private final CurrentUser currentUser;

    NotificationController(NotificationRepository repo, CurrentUser currentUser) {
        this.repo = repo;
        this.currentUser = currentUser;
    }

    @PostMapping("/api/push-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void register(@RequestBody @Valid TokenBody body) {
        repo.saveToken(body.token(), currentUser.id());
    }

    @DeleteMapping("/api/push-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unregister(@RequestBody @Valid TokenBody body) {
        repo.deleteToken(body.token(), currentUser.id());
    }

    @GetMapping("/api/notifications")
    List<NotificationRepository.Notification> list() {
        return repo.forUser(currentUser.id(), 100);
    }

    @PostMapping("/api/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@PathVariable long id) {
        repo.markRead(currentUser.id(), id);
    }
}
