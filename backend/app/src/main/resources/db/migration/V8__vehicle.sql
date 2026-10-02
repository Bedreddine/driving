-- The driver's car on the booking website: what it is, and photos of the outside and inside.
-- The free-text `car` column (V4) stays as it is for the older back office.

alter table business_profile
  add column vehicle_model    text check (char_length(vehicle_model) <= 80),     -- e.g. 'Mercedes Classe E 300e'
  add column vehicle_color    text check (char_length(vehicle_color) <= 40),     -- e.g. 'Noir obsidienne'
  add column vehicle_category text check (vehicle_category in ('sedan', 'van', 'suv', 'electric')),
  add column vehicle_year     int  check (vehicle_year between 1990 and 2100),
  -- Ordered list of short labels (e.g. "Sièges cuir"), at most 10, each 1..40 characters (checked by the app).
  add column vehicle_features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(vehicle_features) = 'array' and jsonb_array_length(vehicle_features) <= 10);

-- Photos of the car, served by the app itself like the driver photo. JPEG, PNG or WebP, 3 MB at most, 12 at most
-- (checked by the app). position is the order on the website, 0 first, kept without gaps by the app.
-- Belongs to the single business_profile row: removed with it.
create table vehicle_photos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  boolean not null default true references business_profile (id) on delete cascade,
  kind        text not null check (kind in ('exterior', 'interior')),
  caption     text check (char_length(caption) <= 60),
  position    int not null check (position >= 0),
  photo       bytea not null,
  photo_type  text not null check (photo_type in ('image/jpeg', 'image/png', 'image/webp')),
  version     text not null,                                         -- start of the photo hash, in its URL
  created_at  timestamptz not null default now()
);
create index vehicle_photos_position on vehicle_photos (position);
