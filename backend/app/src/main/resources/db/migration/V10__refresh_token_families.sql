-- Refresh token rotation with replay detection: the tokens of one sign-in share a family. A token used twice
-- (copied) ends the whole family. Existing tokens each start their own family.
alter table refresh_tokens add column family_id uuid not null default gen_random_uuid();
create index refresh_tokens_family_idx on refresh_tokens (family_id) where revoked_at is null;
