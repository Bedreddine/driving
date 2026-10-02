-- Guest booking from the business-card QR code, customer emails/SMS, business profile.

-- Language of a customer who has no account (guest bookings), for emails and SMS.
alter table contacts add column language text not null default 'fr' check (language in ('fr', 'en'));

-- Private link to follow one ride without an account: /b/<access_token>. Long and random (unguessable).
-- The default fills existing rows and any insert that does not set one (the app sets its own).
alter table rides add column access_token text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index rides_access_token_idx on rides (access_token);

-- The business shown on the booking website and in messages. One row.
create table business_profile (
  id               boolean primary key default true check (id),
  name             text not null default 'Élysée Chauffeur',
  tagline_fr       text not null default 'Votre chauffeur privé à Paris',
  tagline_en       text not null default 'Your private driver in Paris',
  phone            text,
  email            text,
  site_url         text,          -- public address of the booking website, used in links and the QR code
  app_store_url    text,
  play_store_url   text,
  updated_at       timestamptz not null default now()
);
insert into business_profile default values;

-- Emails and SMS to customers, written in the same transaction as the ride change,
-- sent by a background job (retries if the provider is down).
create table customer_messages (
  id          bigint generated always as identity primary key,
  ride_id     uuid references rides (id) on delete cascade,
  channel     text not null check (channel in ('email', 'sms')),
  recipient   text not null,
  subject     text,
  body        text not null,
  created_at  timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text,
  sent_at     timestamptz
);
create index customer_messages_pending_idx on customer_messages (created_at) where sent_at is null;
