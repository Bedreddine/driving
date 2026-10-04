-- Ride-day moments, told to the customer: the driver is on the way (driver taps), arriving (automatic, from the
-- driver's live position, about 5 minutes away) and arrived at the pickup point (driver taps).
-- Each moment is recorded once per ride.
create table ride_moments (
  ride_id uuid        not null references rides (id) on delete cascade,
  kind    text        not null check (kind in ('on_the_way', 'arriving', 'arrived')),
  at      timestamptz not null default now(),
  primary key (ride_id, kind)
);

-- Short messages between the driver and the client of a ride (open from the request until 12 hours after pickup).
-- Personal data: deleted when the ride's personal data is stripped (customer erased), and 90 days after pickup
-- by the nightly retention job (see RideRepository.applyRetention).
create table ride_messages (
  id         uuid        primary key default gen_random_uuid(),
  ride_id    uuid        not null references rides (id) on delete cascade,
  sender     text        not null check (sender in ('driver', 'client')),
  body       text        not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index ride_messages_ride_idx on ride_messages (ride_id, created_at);
