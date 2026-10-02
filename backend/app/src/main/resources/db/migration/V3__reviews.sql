-- Client reviews ("reference clients"): one per completed ride, moderated by the owner before it is public.

-- review module. The public name ("J. Smith") is not stored: it is derived from the contact when read,
-- so an erased customer never shows (their reviews are also deleted when they are forgotten).
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null unique references rides (id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (char_length(comment) <= 1000),
  show_publicly boolean not null default false,  -- the client agrees to appear as a reference client
  city          text check (char_length(city) <= 60),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reviews_public_idx on reviews (created_at desc) where status = 'approved' and show_publicly;
