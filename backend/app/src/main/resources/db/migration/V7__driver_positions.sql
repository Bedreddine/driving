-- Live driver position, shown to a customer only around their accepted ride (see DriverTracking).
-- Only the latest position per driver is kept (upsert), never a history. Personal data: deleted with the driver
-- account, and never written to the logs.
create table driver_positions (
  driver_id  uuid primary key references drivers (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  heading    double precision check (heading >= 0 and heading < 360),
  speed      double precision check (speed >= 0),     -- m/s
  accuracy   double precision check (accuracy >= 0),  -- m
  updated_at timestamptz not null
);
