-- Driver-configurable pricing: distance tiers, van price, priced extras; child seats on rides.
-- Every default keeps the prices of existing drivers unchanged.

alter table pricing_settings
  -- Price of a van ride in percent of the sedan price (100 = same price).
  add column van_percent         int not null default 100 check (van_percent between 50 and 300),
  add column meet_greet_fee      numeric(10, 2) not null default 0 check (meet_greet_fee >= 0),
  add column child_seat_fee      numeric(10, 2) not null default 0 check (child_seat_fee >= 0),   -- per seat
  add column included_luggage    int not null default 3 check (included_luggage between 0 and 20),
  add column extra_luggage_fee   numeric(10, 2) not null default 0 check (extra_luggage_fee >= 0), -- per bag over included
  -- Shown to clients only (waiting is charged on the day, never added to a quote).
  add column waiting_per_minute  numeric(10, 2) not null default 0 check (waiting_per_minute >= 0);

-- Distance tiers: pricing_settings.per_km applies from 0 to the first tier's from_km, each tier's per_km from its
-- from_km to the next tier's (or without end). At most 5 per driver (checked by the app).
create table pricing_distance_tiers (
  driver_id uuid not null references drivers (id) on delete cascade,
  from_km   numeric(9, 3) not null check (from_km > 0),
  per_km    numeric(10, 2) not null check (per_km >= 0),
  primary key (driver_id, from_km)
);

alter table rides add column child_seats int not null default 0 check (child_seats between 0 and 3);
