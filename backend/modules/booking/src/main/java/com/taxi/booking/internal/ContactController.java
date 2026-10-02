package com.taxi.booking.internal;

import com.taxi.identity.CurrentUser;
import com.taxi.shared.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Customers as seen by the driver and the back office. */
@RestController
class ContactController {

    record NewContact(@NotBlank @Size(max = 200) String fullName, @Size(max = 40) String phone,
                      @jakarta.validation.constraints.Email @Size(max = 200) String email, Boolean noticeGiven) {}

    record Notes(@NotNull @Size(max = 5000) String notes) {}

    record LinkBody(@NotNull UUID accountContactId, @NotNull UUID existingContactId) {}

    private final ContactRepository contacts;
    private final DriverRepository drivers;
    private final CurrentUser currentUser;
    private final RideLifecycle lifecycle;

    ContactController(ContactRepository contacts, DriverRepository drivers, CurrentUser currentUser,
                      RideLifecycle lifecycle) {
        this.contacts = contacts;
        this.drivers = drivers;
        this.currentUser = currentUser;
        this.lifecycle = lifecycle;
    }

    @GetMapping("/api/contacts")
    List<ContactRepository.Contact> search(@RequestParam(defaultValue = "") String q,
                                           @RequestParam(defaultValue = "50") int limit) {
        requireStaff();
        return contacts.search(q, currentUser.isAdmin(), myDriverId(), currentUser.id(), Math.clamp(limit, 1, 1000));
    }

    /** A phone / WhatsApp customer without an app account. */
    @PostMapping("/api/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    ContactRepository.Contact create(@RequestBody @Valid NewContact body) {
        requireStaff();
        var id = contacts.insert(null, body.fullName().trim(), blankToNull(body.phone()), blankToNull(body.email()),
                Boolean.TRUE.equals(body.noticeGiven()), currentUser.id());
        return contacts.find(id).orElseThrow();
    }

    @GetMapping("/api/contacts/{id}/notes")
    Map<String, String> notes(@PathVariable UUID id) {
        requireVisible(id);
        return Map.of("notes", contacts.notes(id));
    }

    @PutMapping("/api/contacts/{id}/notes")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void saveNotes(@PathVariable UUID id, @RequestBody @Valid Notes body) {
        requireVisible(id);
        contacts.saveNotes(id, body.notes());
    }

    /** New accounts whose email or phone matches an existing customer. A person always confirms. */
    @GetMapping("/api/admin/contact-links")
    List<ContactRepository.LinkSuggestion> suggestions() {
        return contacts.linkSuggestions();
    }

    @PostMapping("/api/admin/contact-links")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void link(@RequestBody @Valid LinkBody body) {
        var account = contacts.find(body.accountContactId()).orElseThrow(ApiException::notFound);
        var existing = contacts.find(body.existingContactId()).orElseThrow(ApiException::notFound);
        if (account.userId() == null || existing.userId() != null || account.id().equals(existing.id())
                || contacts.isAnonymized(existing.id())) {
            throw ApiException.badRequest("BAD_LINK");
        }
        contacts.link(account, existing);
    }

    /** Back office: erase a customer on request (GDPR). Accounts are deleted by their owner in the app. */
    @PostMapping("/api/admin/contacts/{id}/forget")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void forget(@PathVariable UUID id) {
        var contact = contacts.find(id).orElseThrow(ApiException::notFound);
        if (contact.userId() != null) {
            throw ApiException.badRequest("HAS_ACCOUNT");
        }
        lifecycle.forgetContact(id);
    }

    private void requireStaff() {
        if (!currentUser.isStaff()) {
            throw ApiException.forbidden();
        }
    }

    private UUID myDriverId() {
        return drivers.byUser(currentUser.id()).map(DriverRepository.Driver::id).orElse(null);
    }

    private void requireVisible(UUID contactId) {
        requireStaff();
        contacts.find(contactId).orElseThrow(ApiException::notFound);
        if (!currentUser.isAdmin() && !contacts.visibleToDriver(contactId, myDriverId(), currentUser.id())) {
            throw ApiException.notFound();
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
