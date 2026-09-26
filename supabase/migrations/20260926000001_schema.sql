-- Core schema for the taxi booking app.
-- Design: docs/designs/taxi-booking-app.md

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('customer', 'driver', 'admin');

create type public.ride_status as enum (
  'requested',            -- customer asked, driver has not answered
  'price_proposed',       -- driver proposed another price, waiting for customer
  'accepted',             -- confirmed ride
  'declined',             -- driver said no (or withdrew a proposal)
  'declined_by_customer', -- customer refused the proposed price
  'expired',              -- nobody answered before the deadline
  'cancelled',
  'completed',
  'no_show'
);

create type public.ride_source as enum ('app', 'phone', 'whatsapp', 'in_person', 'other');
create type public.vehicle_size as enum ('sedan', 'van');
create type public.zone_kind as enum ('airport', 'station', 'other');
create type public.licence_kind as enum ('vtc', 'taxi');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  phone      text,
  language   text not null default 'fr' check (language in ('fr', 'en')),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role    public.app_role not null,
  primary key (user_id, role)
);

-- A customer record that does not need an app account (phone / WhatsApp bookings).
create table public.contacts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles (id) on delete set null,
  full_name      text not null,
  phone          text,
  email          text,
  notice_given   boolean not null default false, -- privacy notice given for manual entries
  created_by     uuid references public.profiles (id) on delete set null,
  anonymized_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index contacts_phone_idx on public.contacts (phone);
create index contacts_email_idx on public.contacts (lower(email));

-- Driver-private notes, kept apart so customers can never read them.
create table public.contact_notes (
  contact_id uuid primary key references public.contacts (id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Drivers, hours, time off
-- ---------------------------------------------------------------------------
create table public.drivers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles (id) on delete set null,
  display_name text not null,
  phone        text,
  timezone     text not null default 'Europe/Paris',
  seats        int not null default 4 check (seats > 0),
  luggage      int not null default 3 check (luggage >= 0),
  vehicle      public.vehicle_size not null default 'sedan',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- weekday follows extract(dow): 0 = Sunday ... 6 = Saturday, local driver time.
create table public.working_hours (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (start_time < end_time)
);

create table public.time_off (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  period     tstzrange not null check (not isempty(period)),
  reason     text,
  created_at timestamptz not null default now()
);
create index time_off_period_idx on public.time_off using gist (driver_id, period);

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
create table public.pricing_settings (
  driver_id            uuid primary key references public.drivers (id) on delete cascade,
  licence              public.licence_kind not null default 'vtc',
  currency             text not null default 'EUR',
  base_fare            numeric(10, 2) not null default 0,
  per_km               numeric(10, 2) not null default 0,
  per_minute           numeric(10, 2) not null default 0,
  minimum_fare         numeric(10, 2) not null default 0,
  airport_wait_minutes int not null default 45 check (airport_wait_minutes >= 0),
  meet_greet_minutes   int not null default 15 check (meet_greet_minutes >= 0),
  min_gap_minutes      int not null default 15 check (min_gap_minutes >= 0),
  lead_time_minutes    int not null default 180 check (lead_time_minutes >= 0)
);

-- A zone is a circle (center + radius). Used for fixed prices and airport/station detection.
create table public.zones (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  kind      public.zone_kind not null default 'other',
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  radius_m  int not null check (radius_m > 0)
);

create table public.fixed_prices (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references public.drivers (id) on delete cascade,
  from_zone        uuid not null references public.zones (id) on delete cascade,
  to_zone          uuid not null references public.zones (id) on delete cascade,
  price            numeric(10, 2) not null check (price >= 0),
  both_directions  boolean not null default true,
  surcharges_apply boolean not null default false
);

-- A window with start_time > end_time crosses midnight (e.g. 20:00 -> 07:00).
create table public.surcharges (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  name       text not null,
  days       smallint[] not null check (days <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_time time not null,
  end_time   time not null,
  percent    numeric(5, 2) not null check (percent >= 0),
  check (start_time <> end_time)
);

-- ---------------------------------------------------------------------------
-- Rides
-- ---------------------------------------------------------------------------
create table public.rides (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts (id),
  driver_id           uuid not null references public.drivers (id),
  created_by          uuid references public.profiles (id) on delete set null,
  source              public.ride_source not null,
  status              public.ride_status not null,

  pickup_at           timestamptz not null,
  pickup_address      text not null,
  pickup_lat          double precision not null,
  pickup_lng          double precision not null,
  dropoff_address     text not null,
  dropoff_lat         double precision not null,
  dropoff_lng         double precision not null,

  distance_m          int not null check (distance_m >= 0),
  duration_s          int not null check (duration_s >= 0),
  pickup_allowance_min int not null default 0,
  blocked_range       tstzrange not null,

  passengers          int not null default 1 check (passengers > 0),
  luggage             int not null default 0 check (luggage >= 0),
  vehicle             public.vehicle_size not null default 'sedan',
  meet_greet          boolean not null default false,
  travel_ref          text,  -- flight or train number
  customer_notes      text,

  currency            text not null default 'EUR',
  is_fixed_price      boolean not null default false,
  estimated_price     numeric(10, 2),
  proposed_price      numeric(10, 2),
  agreed_price        numeric(10, 2),
  final_price         numeric(10, 2),
  final_price_reason  text,

  answer_deadline     timestamptz, -- expiry for requested / price_proposed
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- The database itself refuses two slot-holding rides that overlap for one driver.
  constraint rides_no_overlap exclude using gist (
    driver_id with =,
    blocked_range with &&
  ) where (status in ('accepted', 'price_proposed'))
);
create index rides_driver_pickup_idx on public.rides (driver_id, pickup_at);
create index rides_contact_idx on public.rides (contact_id);
create index rides_deadline_idx on public.rides (answer_deadline)
  where status in ('requested', 'price_proposed');

create table public.ride_events (
  id          bigint generated always as identity primary key,
  ride_id     uuid not null references public.rides (id) on delete cascade,
  from_status public.ride_status,
  to_status   public.ride_status not null,
  actor       uuid references public.profiles (id) on delete set null,
  note        text,
  at          timestamptz not null default now()
);
create index ride_events_ride_idx on public.ride_events (ride_id);

-- ---------------------------------------------------------------------------
-- Notifications (outbox) and push tokens
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  ride_id      uuid references public.rides (id) on delete cascade,
  kind         text not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  pushed_at    timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

create table public.push_tokens (
  token      text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger rides_touch before update on public.rides
  for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();
