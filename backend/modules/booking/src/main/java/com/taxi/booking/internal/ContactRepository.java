package com.taxi.booking.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ContactRepository {

    record Contact(UUID id, UUID userId, String fullName, String phone, String email, boolean noticeGiven,
                   UUID createdBy, String language) {}

    record LinkSuggestion(UUID accountContactId, UUID existingContactId, String match) {}

    private static final String COLUMNS = "id, user_id, full_name, phone, email, notice_given, created_by, language";
    private static final String PREFIXED_COLUMNS =
            "c.id, c.user_id, c.full_name, c.phone, c.email, c.notice_given, c.created_by, c.language";

    private final JdbcClient jdbc;

    ContactRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Contact> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from contacts where id = :id").param("id", id)
                .query(Contact.class).optional();
    }

    List<Contact> findAll(java.util.Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + COLUMNS + " from contacts where id in (:ids)").param("ids", List.copyOf(ids))
                .query(Contact.class).list();
    }

    Optional<Contact> byUser(UUID userId) {
        return jdbc.sql("select " + COLUMNS + " from contacts where user_id = :u").param("u", userId)
                .query(Contact.class).optional();
    }

    UUID insert(UUID userId, String fullName, String phone, String email, boolean noticeGiven, UUID createdBy) {
        return insert(userId, fullName, phone, email, noticeGiven, createdBy, "fr");
    }

    UUID insert(UUID userId, String fullName, String phone, String email, boolean noticeGiven, UUID createdBy,
                String language) {
        return jdbc.sql("""
                insert into contacts (user_id, full_name, phone, email, notice_given, created_by, language)
                values (:u, :n, :p, :e, :notice, :by, :lang) returning id""")
                .param("u", userId).param("n", fullName).param("p", phone).param("e", email)
                .param("notice", noticeGiven).param("by", createdBy).param("lang", language)
                .query(UUID.class).single();
    }

    /**
     * A guest who books again with the same email and phone reuses their contact (one history).
     * Contacts that belong to an account are never reused this way.
     */
    Optional<Contact> guestMatch(String email, String phone) {
        if (email == null || phone == null) {
            return Optional.empty();
        }
        return jdbc.sql("select " + COLUMNS + " from contacts where user_id is null and anonymized_at is null"
                        + " and lower(email) = lower(:e)"
                        + " and regexp_replace(phone, '[^0-9+]', '', 'g') = regexp_replace(:p, '[^0-9+]', '', 'g')"
                        + " order by created_at limit 1")
                .param("e", email).param("p", phone).query(Contact.class).optional();
    }

    void updateGuestLanguage(UUID id, String language) {
        jdbc.sql("update contacts set language = :l, updated_at = now() where id = :id")
                .param("l", language).param("id", id).update();
    }

    /** An account holder changed their profile: the driver sees the same name, phone and language. */
    void updateFromProfile(UUID userId, String fullName, String phone, String language) {
        jdbc.sql("update contacts set full_name = :n, phone = :p, language = :l, updated_at = now() where user_id = :u")
                .param("n", fullName).param("p", phone).param("l", language).param("u", userId).update();
    }

    boolean isAnonymized(UUID id) {
        return jdbc.sql("select anonymized_at is not null from contacts where id = :id").param("id", id)
                .query(Boolean.class).optional().orElse(false);
    }

    /**
     * Contacts a staff member may see: all for an admin; for a driver, customers of their rides
     * and contacts they created themselves.
     */
    List<Contact> search(String query, boolean admin, UUID driverId, UUID userId, int limit) {
        var q = query == null ? "" : query.trim();
        return jdbc.sql("""
                select %s from contacts c
                where c.anonymized_at is null
                  and (:q = '' or c.full_name ilike '%%' || :q || '%%' or c.phone ilike '%%' || :q || '%%'
                       or c.email ilike '%%' || :q || '%%')
                  and (:admin or c.created_by = :user
                       or exists (select 1 from rides r where r.contact_id = c.id and r.driver_id = :driver))
                order by c.full_name limit :limit""".formatted(PREFIXED_COLUMNS))
                .param("q", q).param("admin", admin).param("user", userId).param("driver", driverId)
                .param("limit", limit)
                .query(Contact.class).list();
    }

    boolean visibleToDriver(UUID contactId, UUID driverId, UUID userId) {
        return jdbc.sql("""
                select exists (select 1 from contacts c where c.id = :c and (c.created_by = :u
                  or exists (select 1 from rides r where r.contact_id = c.id and r.driver_id = :d)))""")
                .param("c", contactId).param("u", userId).param("d", driverId).query(Boolean.class).single();
    }

    String notes(UUID contactId) {
        return jdbc.sql("select notes from contact_notes where contact_id = :c").param("c", contactId)
                .query(String.class).optional().orElse("");
    }

    void saveNotes(UUID contactId, String notes) {
        jdbc.sql("""
                insert into contact_notes (contact_id, notes) values (:c, :n)
                on conflict (contact_id) do update set notes = excluded.notes, updated_at = now()""")
                .param("c", contactId).param("n", notes).update();
    }

    /** Accounts whose email or phone matches a contact created by the driver. Always confirmed by a person. */
    List<LinkSuggestion> linkSuggestions() {
        return jdbc.sql("""
                select a.id as account_contact_id, e.id as existing_contact_id,
                       case when a.email is not null and lower(a.email) = lower(e.email) then 'email'
                            else 'phone' end as match
                from contacts a
                join contacts e on e.user_id is null and e.id <> a.id and e.anonymized_at is null
                 and ((a.email is not null and lower(a.email) = lower(e.email))
                      or (a.phone is not null and a.phone = e.phone))
                where a.user_id is not null
                order by a.created_at desc""")
                .query(LinkSuggestion.class).list();
    }

    /** The driver-created contact survives (it holds the history); the sign-up contact is merged into it. */
    void link(Contact account, Contact existing) {
        jdbc.sql("update rides set contact_id = :e where contact_id = :a").param("e", existing.id()).param("a", account.id()).update();
        jdbc.sql("delete from contacts where id = :a").param("a", account.id()).update();
        jdbc.sql("""
                update contacts set user_id = :u, full_name = coalesce(nullif(full_name, ''), :n),
                  phone = coalesce(phone, :p), email = coalesce(email, :m), updated_at = now()
                where id = :e""")
                .param("u", account.userId()).param("n", account.fullName()).param("p", account.phone())
                .param("m", account.email()).param("e", existing.id())
                .update();
    }

    void anonymize(UUID contactId) {
        jdbc.sql("""
                update contacts set full_name = 'Deleted customer', phone = null, email = null,
                  anonymized_at = now(), user_id = null, updated_at = now()
                where id = :c""").param("c", contactId).update();
        jdbc.sql("delete from contact_notes where contact_id = :c").param("c", contactId).update();
    }

    int deleteInactiveWithoutRides() {
        return jdbc.sql("""
                delete from contacts c where c.user_id is null and c.updated_at < now() - interval '24 months'
                  and not exists (select 1 from rides r where r.contact_id = c.id)""").update();
    }
}
