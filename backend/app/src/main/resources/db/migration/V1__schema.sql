-- Taxi booking schema. Business rules live in the Java modules; the database keeps
-- the guarantees that must hold even under concurrent requests (constraints below).
-- Design: docs/designs/taxi-booking-app.md

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- identity module
-- ---------------------------------------------------------------------------
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  password_hash  text not null,
  email_verified boolean not null default false,
  full_name      text not null default '',
  phone          text,
  language       text not null default 'fr' check (language in ('fr', 'en')),
  created_at     timestamptz not null default now()
);
create unique index users_email_idx on users (lower(email));

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role    text not null check (role in ('customer', 'driver', 'admin')),
  primary key (user_id, role)
);

create table refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- booking module: drivers, customers (contacts), availability
-- ---------------------------------------------------------------------------
create table drivers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references users (id) on delete set null,
  display_name text not null,
  phone        text,
  timezone     text not null default 'Europe/Paris',
  seats        int not null default 4 check (seats > 0),
  luggage      int not null default 3 check (luggage >= 0),
  vehicle      text not null default 'sedan' check (vehicle in ('sedan', 'van')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- A customer record that does not need an app account (phone / WhatsApp bookings).
create table contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references users (id) on delete set null,
  full_name     text not null,
  phone         text,
  email         text,
  notice_given  boolean not null default false,
  created_by    uuid references users (id) on delete set null,
  anonymized_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index contacts_phone_idx on contacts (phone);
create index contacts_email_idx on contacts (lower(email));

-- Driver-private notes, kept apart so no customer query can ever return them.
create table contact_notes (
  contact_id uuid primary key references contacts (id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

-- weekday follows Java/ISO minus 7 for Sunday: 0 = Sunday ... 6 = Saturday, driver local time.
create table working_hours (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references drivers (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (start_time < end_time)
);

create table time_off (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references drivers (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_driver_idx on time_off (driver_id, starts_at);

-- ---------------------------------------------------------------------------
-- pricing module
-- ---------------------------------------------------------------------------
create table pricing_settings (
  driver_id            uuid primary key references drivers (id) on delete cascade,
  licence              text not null default 'vtc' check (licence in ('vtc', 'taxi')),
  currency             text not null default 'EUR',
  base_fare            numeric(10, 2) not null default 0 check (base_fare >= 0),
  per_km               numeric(10, 2) not null default 0 check (per_km >= 0),
  per_minute           numeric(10, 2) not null default 0 check (per_minute >= 0),
  minimum_fare         numeric(10, 2) not null default 0 check (minimum_fare >= 0),
  airport_wait_minutes int not null default 45 check (airport_wait_minutes >= 0),
  meet_greet_minutes   int not null default 15 check (meet_greet_minutes >= 0),
  min_gap_minutes      int not null default 15 check (min_gap_minutes >= 0),
  lead_time_minutes    int not null default 180 check (lead_time_minutes >= 0)
);

-- A zone is a circle (center + radius): fixed prices and airport/station detection.
create table zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'other' check (kind in ('airport', 'station', 'other')),
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  radius_m   int not null check (radius_m > 0)
);

create table fixed_prices (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references drivers (id) on delete cascade,
  from_zone        uuid not null references zones (id) on delete cascade,
  to_zone          uuid not null references zones (id) on delete cascade,
  price            numeric(10, 2) not null check (price >= 0),
  both_directions  boolean not null default true,
  surcharges_apply boolean not null default false
);

-- days: 0 = Sunday ... 6 = Saturday. start_time > end_time crosses midnight (20:00 -> 07:00).
create table surcharges (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references drivers (id) on delete cascade,
  name       text not null,
  days       smallint[] not null check (days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(days) > 0),
  start_time time not null,
  end_time   time not null,
  percent    numeric(5, 2) not null check (percent >= 0),
  check (start_time <> end_time)
);

-- ---------------------------------------------------------------------------
-- booking module: rides
-- ---------------------------------------------------------------------------
create table rides (
  id                   uuid primary key default gen_random_uuid(),
  contact_id           uuid not null references contacts (id),
  driver_id            uuid not null references drivers (id),
  created_by           uuid references users (id) on delete set null,
  source               text not null check (source in ('app', 'phone', 'whatsapp', 'in_person', 'other')),
  status               text not null check (status in (
                         'requested', 'price_proposed', 'accepted', 'declined', 'declined_by_customer',
                         'expired', 'cancelled', 'completed', 'no_show')),

  pickup_at            timestamptz not null,
  pickup_address       text not null,
  pickup_lat           double precision not null,
  pickup_lng           double precision not null,
  dropoff_address      text not null,
  dropoff_lat          double precision not null,
  dropoff_lng          double precision not null,

  distance_m           int not null check (distance_m >= 0),
  duration_s           int not null check (duration_s >= 0),
  pickup_allowance_min int not null default 0 check (pickup_allowance_min >= 0),
  blocked_range        tstzrange not null,

  passengers           int not null default 1 check (passengers > 0),
  luggage              int not null default 0 check (luggage >= 0),
  vehicle              text not null default 'sedan' check (vehicle in ('sedan', 'van')),
  meet_greet           boolean not null default false,
  travel_ref           text,
  customer_notes       text,

  currency             text not null default 'EUR',
  is_fixed_price       boolean not null default false,
  estimated_price      numeric(10, 2),
  proposed_price       numeric(10, 2),
  agreed_price         numeric(10, 2),
  final_price          numeric(10, 2),
  final_price_reason   text,

  answer_deadline      timestamptz,
  cancel_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- The database itself refuses two slot-holding rides that overlap for one driver.
  constraint rides_no_overlap exclude using gist (
    driver_id with =,
    blocked_range with &&
  ) where (status in ('accepted', 'price_proposed'))
);
create index rides_driver_pickup_idx on rides (driver_id, pickup_at);
create index rides_contact_idx on rides (contact_id);
create index rides_deadline_idx on rides (answer_deadline) where status in ('requested', 'price_proposed');

create table ride_events (
  id          bigint generated always as identity primary key,
  ride_id     uuid not null references rides (id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor       uuid references users (id) on delete set null,
  note        text,
  at          timestamptz not null default now()
);
create index ride_events_ride_idx on ride_events (ride_id);

-- ---------------------------------------------------------------------------
-- notification module
-- ---------------------------------------------------------------------------
create table notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references users (id) on delete cascade,
  ride_id      uuid references rides (id) on delete cascade,
  kind         text not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  pushed_at    timestamptz
);
create index notifications_recipient_idx on notifications (recipient_id, created_at desc);
create index notifications_unpushed_idx on notifications (created_at) where pushed_at is null;

create table push_tokens (
  token      text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now()
);
