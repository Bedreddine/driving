-- What a guest typed in THIS booking (public booking website). A returning guest is matched to an existing
-- contact by email + phone, but whoever knows those must not see nor change what the driver has on file:
-- the ride page and the emails for the ride show these values, and the contact is left as it was.
-- Null for account and driver-created rides, and for guest rides made before this column existed
-- (the ride page then shows no name rather than the contact's).
alter table rides add column guest_name text;
alter table rides add column guest_language text check (guest_language in ('fr', 'en'));
