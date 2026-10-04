-- Browser push (standard Web Push with VAPID keys) for guests following a ride on its private link /b/{token}.
-- One row per browser; the endpoint is the push service address of that browser (secret: never logged in full).
-- Deleted with the ride, when the push service says the browser is gone (404/410), when the customer is erased,
-- and by the nightly retention job once the ride is over (see WebPushes).
create table web_push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  ride_id    uuid        not null references rides (id) on delete cascade,
  endpoint   text        not null unique check (char_length(endpoint) <= 1000),
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);
create index web_push_subscriptions_ride_idx on web_push_subscriptions (ride_id);
