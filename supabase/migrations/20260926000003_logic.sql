-- Business rules: pricing, availability, ride creation and the status state machine.
-- Every status change goes through these functions; the app can never write rides directly.
--
--   (new) ──request──▶ requested ──accept──────────▶ accepted ──complete──▶ completed
--                        │  │                            │  ▲     └─no_show──▶ no_show
--                        │  └─propose──▶ price_proposed ─┼──┘ (customer accepts)
--                        │                 │  │  └─customer refuses─▶ declined_by_customer
--                        ├─decline─────────┼──┴─driver withdraws─▶ declined
--                        ├─deadline────────┴──▶ expired
--                        └─customer cancel─────▶ cancelled ◀── cancel (accepted, either side)
--   (new) ──quick-add (driver)──▶ accepted

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create function public.geo_distance_m(lat1 double precision, lng1 double precision,
                                      lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create function public.zones_at(p_lat double precision, p_lng double precision)
returns setof public.zones language sql stable set search_path = '' as $$
  select z.* from public.zones z
  where public.geo_distance_m(p_lat, p_lng, z.center_lat, z.center_lng) <= z.radius_m;
$$;

-- Largest surcharge percent that applies at the scheduled pickup time (driver's timezone).
create function public.surcharge_percent(p_driver uuid, p_pickup_at timestamptz)
returns numeric language plpgsql stable set search_path = '' as $$
declare
  v_tz    text;
  v_local timestamp;
  v_day   smallint;
  v_prev  smallint;
  v_time  time;
  v_pct   numeric;
begin
  select timezone into v_tz from public.drivers where id = p_driver;
  v_local := p_pickup_at at time zone coalesce(v_tz, 'Europe/Paris');
  v_day   := extract(dow from v_local)::smallint;
  v_prev  := ((v_day + 6) % 7)::smallint;
  v_time  := v_local::time;

  select max(s.percent) into v_pct
  from public.surcharges s
  where s.driver_id = p_driver and (
    (s.start_time < s.end_time and v_day = any (s.days)
       and v_time >= s.start_time and v_time < s.end_time)
    or (s.start_time > s.end_time and (
         (v_day = any (s.days) and v_time >= s.start_time)
         or (v_prev = any (s.days) and v_time < s.end_time)))
  );
  return coalesce(v_pct, 0);
end $$;

-- Estimate for one ride. Fixed zone-to-zone prices win over the formula.
create function public.estimate_price(
  p_driver uuid, p_distance_m int, p_duration_s int, p_pickup_at timestamptz,
  p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_lat double precision, p_dropoff_lng double precision,
  out price numeric, out is_fixed boolean)
language plpgsql stable set search_path = '' as $$
declare
  s     public.pricing_settings;
  v_pct numeric := public.surcharge_percent(p_driver, p_pickup_at);
  v_fix record;
begin
  select * into s from public.pricing_settings where driver_id = p_driver;
  if not found then
    raise exception 'NOT_CONFIGURED' using detail = 'No pricing settings for this driver';
  end if;

  select f.price, f.surcharges_apply into v_fix
  from public.fixed_prices f
  where f.driver_id = p_driver and (
    (f.from_zone in (select id from public.zones_at(p_pickup_lat, p_pickup_lng))
      and f.to_zone in (select id from public.zones_at(p_dropoff_lat, p_dropoff_lng)))
    or (f.both_directions
      and f.to_zone in (select id from public.zones_at(p_pickup_lat, p_pickup_lng))
      and f.from_zone in (select id from public.zones_at(p_dropoff_lat, p_dropoff_lng)))
  )
  order by f.price
  limit 1;

  if found then
    is_fixed := true;
    price := round(v_fix.price * (1 + case when v_fix.surcharges_apply then v_pct else 0 end / 100), 2);
  else
    is_fixed := false;
    price := round(
      greatest(s.minimum_fare,
               s.base_fare + (p_distance_m / 1000.0) * s.per_km + (p_duration_s / 60.0) * s.per_minute)
      * (1 + v_pct / 100), 2);
  end if;
end $$;

-- Extra minutes kept free at pickup: airport/station waiting and meet & greet.
create function public.pickup_allowance_min(
  p_driver uuid, p_lat double precision, p_lng double precision,
  p_travel_ref text, p_meet_greet boolean)
returns int language sql stable set search_path = '' as $$
  select
    case when coalesce(nullif(trim(p_travel_ref), ''), null) is not null
           or exists (select 1 from public.zones_at(p_lat, p_lng) z where z.kind in ('airport', 'station'))
         then s.airport_wait_minutes else 0 end
    + case when p_meet_greet then s.meet_greet_minutes else 0 end
  from public.pricing_settings s where s.driver_id = p_driver;
$$;

-- When the ride itself ends (without the safety gap).
create function public.ride_end_at(r public.rides) returns timestamptz
language sql immutable as $$
  select r.pickup_at + make_interval(secs => r.duration_s) + make_interval(mins => r.pickup_allowance_min);
$$;

-- The slot-holding rides right before and right after a pickup time (within 12 hours).
create function public.ride_neighbours(p_driver uuid, p_pickup_at timestamptz, p_exclude uuid default null)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'prev', (select jsonb_build_object('id', r.id, 'lat', r.dropoff_lat, 'lng', r.dropoff_lng,
                                       'end_at', public.ride_end_at(r))
             from public.rides r
             where r.driver_id = p_driver and r.status in ('accepted', 'price_proposed')
               and r.pickup_at <= p_pickup_at and r.pickup_at > p_pickup_at - interval '12 hours'
               and r.id is distinct from p_exclude
             order by r.pickup_at desc limit 1),
    'next', (select jsonb_build_object('id', r.id, 'lat', r.pickup_lat, 'lng', r.pickup_lng,
                                       'pickup_at', r.pickup_at)
             from public.rides r
             where r.driver_id = p_driver and r.status in ('accepted', 'price_proposed')
               and r.pickup_at > p_pickup_at and r.pickup_at < p_pickup_at + interval '12 hours'
               and r.id is distinct from p_exclude
             order by r.pickup_at asc limit 1)
  );
$$;

create function public.default_driver_id() returns uuid
language sql stable set search_path = '' as $$
  select id from public.drivers where active order by created_at limit 1;
$$;

create function public._notify(p_recipient uuid, p_ride uuid, p_kind text, p_payload jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.notifications (recipient_id, ride_id, kind, payload)
  select p_recipient, p_ride, p_kind, p_payload where p_recipient is not null;
$$;

create function public._driver_profile(p_ride uuid) returns uuid
language sql stable set search_path = '' as $$
  select d.profile_id from public.rides r join public.drivers d on d.id = r.driver_id where r.id = p_ride;
$$;

create function public._customer_profile(p_ride uuid) returns uuid
language sql stable set search_path = '' as $$
  select c.profile_id from public.rides r join public.contacts c on c.id = r.contact_id where r.id = p_ride;
$$;

create function public._log_event(p_ride uuid, p_from public.ride_status, p_to public.ride_status,
                                  p_actor uuid, p_note text default null)
returns void language sql set search_path = '' as $$
  insert into public.ride_events (ride_id, from_status, to_status, actor, note)
  values (p_ride, p_from, p_to, p_actor, p_note);
$$;

create function public._is_staff_for(p_actor uuid, p_driver uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin')
      or exists (select 1 from public.drivers where id = p_driver and profile_id = p_actor
                 and exists (select 1 from public.user_roles where user_id = p_actor and role = 'driver'));
$$;

-- ---------------------------------------------------------------------------
-- create_ride: customer requests and driver quick-adds.
-- Called only by the ride-create Edge Function (service role), which first asks
-- ride_neighbours and computes road travel times to them with OSRM.
--
-- p_ride:   { mode: 'request'|'quick_add', driver_id?, contact_id?, source?, pickup_at,
--             pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
--             distance_m, duration_s, passengers, luggage, vehicle, meet_greet, travel_ref,
--             customer_notes, agreed_price? }
-- p_travel: { prev_id, prev_s, next_id, next_s }  (seconds of road travel to/from neighbours)
-- Returns { ok, ride_id?, estimate, currency, is_fixed, errors[], warnings[] }.
-- ---------------------------------------------------------------------------
create function public.create_ride(
  p_actor uuid, p_ride jsonb, p_travel jsonb default '{}',
  p_dry_run boolean default false, p_override boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_mode      text := coalesce(p_ride ->> 'mode', 'request');
  v_driver    public.drivers;
  v_settings  public.pricing_settings;
  v_contact   uuid;
  v_pickup    timestamptz := (p_ride ->> 'pickup_at')::timestamptz;
  v_dist      int := (p_ride ->> 'distance_m')::int;
  v_dur       int := (p_ride ->> 'duration_s')::int;
  v_pax       int := coalesce((p_ride ->> 'passengers')::int, 1);
  v_bags      int := coalesce((p_ride ->> 'luggage')::int, 0);
  v_vehicle   public.vehicle_size := coalesce(p_ride ->> 'vehicle', 'sedan')::public.vehicle_size;
  v_meet      boolean := coalesce((p_ride ->> 'meet_greet')::boolean, false);
  v_ref       text := nullif(trim(p_ride ->> 'travel_ref'), '');
  v_allow     int;
  v_end       timestamptz;
  v_gap       interval;
  v_local     timestamp;
  v_neigh     jsonb;
  v_errors    text[] := '{}';
  v_warnings  text[] := '{}';
  v_price     record;
  v_ride_id   uuid;
  v_clash     record;
  v_is_quick  boolean := v_mode = 'quick_add';
begin
  if v_mode not in ('request', 'quick_add') then
    raise exception 'BAD_MODE';
  end if;
  if v_pickup is null or v_dist is null or v_dur is null
     or p_ride ->> 'pickup_address' is null or p_ride ->> 'dropoff_address' is null then
    raise exception 'MISSING_FIELDS';
  end if;

  -- Lock the driver row: concurrent bookings for one driver are checked one at a time.
  select * into v_driver from public.drivers
  where id = coalesce((p_ride ->> 'driver_id')::uuid, public.default_driver_id()) and active
  for update;
  if not found then
    raise exception 'NO_DRIVER';
  end if;

  select * into v_settings from public.pricing_settings where driver_id = v_driver.id;
  if not found then
    raise exception 'NOT_CONFIGURED';
  end if;

  if v_is_quick then
    if not public._is_staff_for(p_actor, v_driver.id) then
      raise exception 'FORBIDDEN';
    end if;
    v_contact := (p_ride ->> 'contact_id')::uuid;
    if v_contact is null or not exists (select 1 from public.contacts where id = v_contact) then
      raise exception 'CONTACT_REQUIRED';
    end if;
  else
    select id into v_contact from public.contacts where profile_id = p_actor;
    if v_contact is null then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  v_allow := public.pickup_allowance_min(v_driver.id, (p_ride ->> 'pickup_lat')::float8,
                                         (p_ride ->> 'pickup_lng')::float8, v_ref, v_meet);
  v_end   := v_pickup + make_interval(secs => v_dur) + make_interval(mins => v_allow);
  v_gap   := make_interval(mins => v_settings.min_gap_minutes);

  -- Hard rules for everyone
  if v_pickup < now() then
    v_errors := v_errors || 'PICKUP_IN_PAST'::text;
  end if;
  if not v_is_quick and v_pickup < now() + make_interval(mins => v_settings.lead_time_minutes) then
    v_errors := v_errors || 'TOO_SHORT_NOTICE'::text;
  end if;

  -- Rules a driver may override on a quick-add, but that block a customer request
  if v_pax > v_driver.seats or v_bags > v_driver.luggage then
    v_warnings := v_warnings || 'OVER_CAPACITY'::text;
  end if;
  if v_vehicle <> v_driver.vehicle then
    v_warnings := v_warnings || 'VEHICLE_UNAVAILABLE'::text;
  end if;

  v_local := v_pickup at time zone v_driver.timezone;
  if exists (select 1 from public.working_hours where driver_id = v_driver.id)
     and not exists (
       select 1 from public.working_hours h
       where h.driver_id = v_driver.id
         and h.weekday = extract(dow from v_local)
         and v_local::time >= h.start_time and v_local::time < h.end_time) then
    v_warnings := v_warnings || 'OUTSIDE_HOURS'::text;
  end if;

  if exists (select 1 from public.time_off t
             where t.driver_id = v_driver.id and t.period && tstzrange(v_pickup, v_end)) then
    v_warnings := v_warnings || 'DRIVER_UNAVAILABLE'::text;
  end if;

  -- Overlap with a slot-holding ride: never allowed (the exclusion constraint agrees).
  select r.id, r.pickup_at into v_clash from public.rides r
  where r.driver_id = v_driver.id and r.status in ('accepted', 'price_proposed')
    and r.blocked_range && tstzrange(v_pickup, v_end + v_gap)
  limit 1;
  if found then
    v_errors := v_errors || 'SLOT_TAKEN'::text;
  else
    -- Road travel from the previous drop-off and to the next pickup
    v_neigh := public.ride_neighbours(v_driver.id, v_pickup);
    if (v_neigh -> 'prev' ->> 'id') is distinct from (p_travel ->> 'prev_id')
       or (v_neigh -> 'next' ->> 'id') is distinct from (p_travel ->> 'next_id') then
      v_errors := v_errors || 'AVAILABILITY_CHANGED'::text;
    else
      if v_neigh -> 'prev' <> 'null'::jsonb
         and v_pickup - ((v_neigh -> 'prev' ->> 'end_at')::timestamptz)
             < greatest(make_interval(secs => coalesce((p_travel ->> 'prev_s')::int, 0)), v_gap) then
        v_warnings := v_warnings || 'TIGHT_SCHEDULE'::text;
      elsif v_neigh -> 'next' <> 'null'::jsonb
         and ((v_neigh -> 'next' ->> 'pickup_at')::timestamptz) - v_end
             < greatest(make_interval(secs => coalesce((p_travel ->> 'next_s')::int, 0)), v_gap) then
        v_warnings := v_warnings || 'TIGHT_SCHEDULE'::text;
      end if;
    end if;
  end if;

  select * into v_price from public.estimate_price(
    v_driver.id, v_dist, v_dur, v_pickup,
    (p_ride ->> 'pickup_lat')::float8, (p_ride ->> 'pickup_lng')::float8,
    (p_ride ->> 'dropoff_lat')::float8, (p_ride ->> 'dropoff_lng')::float8);

  -- Customers cannot override anything
  if not v_is_quick then
    v_errors := v_errors || v_warnings;
    v_warnings := '{}';
  end if;

  if cardinality(v_errors) > 0
     or (cardinality(v_warnings) > 0 and not p_override and not p_dry_run) then
    return jsonb_build_object(
      'ok', false,
      'errors', to_jsonb(v_errors),
      'warnings', to_jsonb(v_warnings),
      'needs_override', cardinality(v_errors) = 0,
      'clash', case when v_clash.id is null then null
                    else jsonb_build_object('id', v_clash.id, 'pickup_at', v_clash.pickup_at) end,
      'estimate', v_price.price, 'currency', v_settings.currency, 'is_fixed', v_price.is_fixed);
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true, 'dry_run', true, 'estimate', v_price.price, 'currency', v_settings.currency,
      'is_fixed', v_price.is_fixed, 'licence', v_settings.licence,
      'pickup_allowance_min', v_allow, 'warnings', to_jsonb(v_warnings));
  end if;

  begin
    insert into public.rides (
      contact_id, driver_id, created_by, source, status, pickup_at,
      pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
      distance_m, duration_s, pickup_allowance_min, blocked_range,
      passengers, luggage, vehicle, meet_greet, travel_ref, customer_notes,
      currency, is_fixed_price, estimated_price, agreed_price, answer_deadline)
    values (
      v_contact, v_driver.id, p_actor,
      case when v_is_quick then coalesce(p_ride ->> 'source', 'phone')::public.ride_source else 'app' end,
      case when v_is_quick then 'accepted'::public.ride_status else 'requested'::public.ride_status end,
      v_pickup,
      p_ride ->> 'pickup_address', (p_ride ->> 'pickup_lat')::float8, (p_ride ->> 'pickup_lng')::float8,
      p_ride ->> 'dropoff_address', (p_ride ->> 'dropoff_lat')::float8, (p_ride ->> 'dropoff_lng')::float8,
      v_dist, v_dur, v_allow, tstzrange(v_pickup, v_end + v_gap),
      v_pax, v_bags, v_vehicle, v_meet, v_ref, nullif(trim(p_ride ->> 'customer_notes'), ''),
      v_settings.currency, v_price.is_fixed, v_price.price,
      case when v_is_quick then coalesce((p_ride ->> 'agreed_price')::numeric,
                                         case when v_settings.licence = 'vtc' or v_price.is_fixed
                                              then v_price.price end) end,
      case when v_is_quick then null
           else least(now() + interval '24 hours', v_pickup - interval '2 hours') end)
    returning id into v_ride_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('SLOT_TAKEN'),
                              'warnings', '[]'::jsonb, 'needs_override', false);
  end;

  perform public._log_event(v_ride_id, null,
    case when v_is_quick then 'accepted'::public.ride_status else 'requested'::public.ride_status end,
    p_actor, case when cardinality(v_warnings) > 0 then 'overridden: ' || array_to_string(v_warnings, ',') end);

  if v_is_quick then
    perform public._notify(public._customer_profile(v_ride_id), v_ride_id, 'ride_booked');
  else
    perform public._notify(v_driver.profile_id, v_ride_id, 'new_request');
  end if;

  return jsonb_build_object('ok', true, 'ride_id', v_ride_id, 'estimate', v_price.price,
                            'currency', v_settings.currency, 'is_fixed', v_price.is_fixed,
                            'warnings', to_jsonb(v_warnings));
end $$;

-- ---------------------------------------------------------------------------
-- State machine transitions (called by signed-in users; each checks who may act)
-- ---------------------------------------------------------------------------
create function public._load_ride(p_ride uuid) returns public.rides
language plpgsql set search_path = '' as $$
declare r public.rides;
begin
  select * into r from public.rides where id = p_ride for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  return r;
end $$;

create function public._require_staff(r public.rides) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public._is_staff_for(auth.uid(), r.driver_id) then
    raise exception 'FORBIDDEN';
  end if;
end $$;

create function public._require_customer(r public.rides) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.contacts where id = r.contact_id and profile_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
end $$;

create function public._require_status(r public.rides, variadic p_allowed public.ride_status[]) returns void
language plpgsql immutable as $$
begin
  if not (r.status = any (p_allowed)) then
    raise exception 'WRONG_STATUS' using detail = r.status::text;
  end if;
end $$;

create function public._require_open_deadline(r public.rides) returns void
language plpgsql set search_path = '' as $$
begin
  if r.answer_deadline is not null and r.answer_deadline <= now() then
    raise exception 'EXPIRED';
  end if;
end $$;

create function public.accept_ride(p_ride uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides := public._load_ride(p_ride);
  v_licence public.licence_kind;
begin
  perform public._require_staff(r);
  perform public._require_status(r, 'requested');
  perform public._require_open_deadline(r);
  select licence into v_licence from public.pricing_settings where driver_id = r.driver_id;

  begin
    update public.rides set
      status = 'accepted',
      agreed_price = case when v_licence = 'vtc' or r.is_fixed_price then r.estimated_price end,
      answer_deadline = null
    where id = r.id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  perform public._log_event(r.id, r.status, 'accepted', auth.uid());
  perform public._notify(public._customer_profile(r.id), r.id, 'ride_accepted');
end $$;

create function public.propose_price(p_ride uuid, p_price numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides := public._load_ride(p_ride);
  v_licence public.licence_kind;
  v_deadline timestamptz;
begin
  perform public._require_staff(r);
  perform public._require_status(r, 'requested');
  perform public._require_open_deadline(r);
  if p_price is null or p_price < 0 then
    raise exception 'BAD_PRICE';
  end if;
  select licence into v_licence from public.pricing_settings where driver_id = r.driver_id;
  if v_licence = 'taxi' then
    raise exception 'NOT_ALLOWED_FOR_TAXI';
  end if;

  -- The customer always gets at least 30 minutes to answer.
  v_deadline := least(now() + interval '12 hours', r.pickup_at - interval '2 hours');
  if v_deadline < now() + interval '30 minutes' then
    raise exception 'TOO_LATE_TO_PROPOSE';
  end if;

  begin
    update public.rides set status = 'price_proposed', proposed_price = p_price,
                            answer_deadline = v_deadline
    where id = r.id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  perform public._log_event(r.id, r.status, 'price_proposed', auth.uid(), p_price::text);
  perform public._notify(public._customer_profile(r.id), r.id, 'price_proposed',
                         jsonb_build_object('price', p_price));
end $$;

-- Driver declines a request, or withdraws a price proposal.
create function public.decline_ride(p_ride uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rides := public._load_ride(p_ride);
begin
  perform public._require_staff(r);
  perform public._require_status(r, 'requested', 'price_proposed');
  update public.rides set status = 'declined', cancel_reason = p_reason, answer_deadline = null
  where id = r.id;
  perform public._log_event(r.id, r.status, 'declined', auth.uid(), p_reason);
  perform public._notify(public._customer_profile(r.id), r.id, 'ride_declined',
                         jsonb_build_object('reason', p_reason));
end $$;

create function public.respond_to_price(p_ride uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides := public._load_ride(p_ride);
  v_to public.ride_status := case when p_accept then 'accepted' else 'declined_by_customer' end;
begin
  perform public._require_customer(r);
  perform public._require_status(r, 'price_proposed');
  perform public._require_open_deadline(r);
  update public.rides set
    status = v_to,
    agreed_price = case when p_accept then r.proposed_price end,
    answer_deadline = null
  where id = r.id;
  perform public._log_event(r.id, r.status, v_to, auth.uid());
  perform public._notify(public._driver_profile(r.id), r.id,
                         case when p_accept then 'price_accepted' else 'price_refused' end);
end $$;

create function public.cancel_ride(p_ride uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides := public._load_ride(p_ride);
  v_is_customer boolean := exists (select 1 from public.contacts
                                   where id = r.contact_id and profile_id = auth.uid());
begin
  if v_is_customer then
    perform public._require_status(r, 'requested', 'price_proposed', 'accepted');
  else
    perform public._require_staff(r);
    perform public._require_status(r, 'accepted');
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED';
    end if;
  end if;

  update public.rides set status = 'cancelled', cancel_reason = p_reason, answer_deadline = null
  where id = r.id;
  perform public._log_event(r.id, r.status, 'cancelled', auth.uid(), p_reason);
  if v_is_customer then
    perform public._notify(public._driver_profile(r.id), r.id, 'ride_cancelled_by_customer');
  else
    perform public._notify(public._customer_profile(r.id), r.id, 'ride_cancelled_by_driver',
                           jsonb_build_object('reason', p_reason));
  end if;
end $$;

create function public.complete_ride(p_ride uuid, p_final_price numeric default null,
                                     p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides := public._load_ride(p_ride);
  v_licence public.licence_kind;
  v_final numeric;
begin
  perform public._require_staff(r);
  perform public._require_status(r, 'accepted');
  if now() < r.pickup_at then
    raise exception 'TOO_EARLY';
  end if;
  select licence into v_licence from public.pricing_settings where driver_id = r.driver_id;

  if v_licence = 'taxi' then
    if p_final_price is null then
      raise exception 'FINAL_PRICE_REQUIRED'; -- meter reading or fixed fare
    end if;
    v_final := p_final_price;
  else
    v_final := coalesce(p_final_price, r.agreed_price, r.estimated_price);
    if r.agreed_price is not null and v_final <> r.agreed_price and coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED';
    end if;
  end if;

  update public.rides set status = 'completed', final_price = v_final,
                          final_price_reason = nullif(trim(p_reason), '')
  where id = r.id;
  perform public._log_event(r.id, r.status, 'completed', auth.uid(), p_reason);
  perform public._notify(public._customer_profile(r.id), r.id, 'ride_completed',
                         jsonb_build_object('final_price', v_final, 'reason', p_reason));
end $$;

create function public.mark_no_show(p_ride uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rides := public._load_ride(p_ride);
begin
  perform public._require_staff(r);
  perform public._require_status(r, 'accepted');
  if now() < r.pickup_at + make_interval(mins => r.pickup_allowance_min) then
    raise exception 'TOO_EARLY';
  end if;
  update public.rides set status = 'no_show' where id = r.id;
  perform public._log_event(r.id, r.status, 'no_show', auth.uid());
  perform public._notify(public._customer_profile(r.id), r.id, 'ride_no_show');
end $$;

-- Requests that overlap a slot-holding ride, so the driver sees the clash before accepting.
create function public.request_conflicts()
returns table (request_id uuid, clashing_ride_id uuid)
language sql stable security definer set search_path = '' as $$
  select q.id, h.id
  from public.rides q
  join public.rides h on h.driver_id = q.driver_id and h.id <> q.id
   and h.status in ('accepted', 'price_proposed') and h.blocked_range && q.blocked_range
  where q.status = 'requested'
    and (public.is_admin() or q.driver_id = public.my_driver_id());
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
create function public.expire_overdue() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides;
  n int := 0;
begin
  for r in
    select * from public.rides
    where status in ('requested', 'price_proposed') and answer_deadline <= now()
    for update skip locked
  loop
    update public.rides set status = 'expired', answer_deadline = null where id = r.id;
    perform public._log_event(r.id, r.status, 'expired', null);
    perform public._notify(public._customer_profile(r.id), r.id, 'ride_expired');
    perform public._notify(public._driver_profile(r.id), r.id, 'ride_expired');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Remind the driver once about accepted rides left open 2 hours after their end.
create function public.remind_open_rides() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    select r.id, d.profile_id
    from public.rides r join public.drivers d on d.id = r.driver_id
    where r.status = 'accepted'
      and public.ride_end_at(r) + interval '2 hours' < now()
      and not exists (select 1 from public.notifications x
                      where x.ride_id = r.id and x.kind = 'close_ride_reminder')
  )
  insert into public.notifications (recipient_id, ride_id, kind)
  select profile_id, id, 'close_ride_reminder' from due where profile_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Data retention (see design doc, Privacy and data).
create function public.apply_retention() returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Rides not needed for accounting
  delete from public.rides
  where status in ('declined', 'declined_by_customer', 'expired', 'cancelled')
    and updated_at < now() - interval '12 months';

  -- Accounting rides: keep 10 years, reduce exact addresses after 3 years
  update public.rides set
    pickup_address = '(address removed)', dropoff_address = '(address removed)',
    pickup_lat = round(pickup_lat::numeric, 2), pickup_lng = round(pickup_lng::numeric, 2),
    dropoff_lat = round(dropoff_lat::numeric, 2), dropoff_lng = round(dropoff_lng::numeric, 2)
  where status in ('completed', 'no_show')
    and pickup_at < now() - interval '3 years'
    and pickup_address <> '(address removed)';

  delete from public.rides
  where status in ('completed', 'no_show') and pickup_at < now() - interval '10 years';

  -- Contacts without an account and without any remaining ride, inactive 24 months
  delete from public.contacts c
  where c.profile_id is null
    and c.updated_at < now() - interval '24 months'
    and not exists (select 1 from public.rides r where r.contact_id = c.id);

  delete from public.notifications where created_at < now() - interval '90 days';
end $$;

-- ---------------------------------------------------------------------------
-- Accounts and contacts
-- ---------------------------------------------------------------------------
-- Called by the delete-account Edge Function before the auth user is removed.
create function public.forget_customer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_contact uuid;
  r public.rides;
begin
  select id into v_contact from public.contacts where profile_id = p_user;
  if v_contact is null then
    return;
  end if;

  -- Cancel everything still open, releasing slots and telling the driver.
  for r in
    select * from public.rides
    where contact_id = v_contact and status in ('requested', 'price_proposed', 'accepted')
    for update
  loop
    update public.rides set status = 'cancelled', cancel_reason = 'account deleted', answer_deadline = null
    where id = r.id;
    perform public._log_event(r.id, r.status, 'cancelled', null, 'account deleted');
    perform public._notify(public._driver_profile(r.id), r.id, 'ride_cancelled_by_customer');
  end loop;

  -- Rides stay for accounting, without personal data.
  update public.rides set
    pickup_address = '(address removed)', dropoff_address = '(address removed)',
    pickup_lat = round(pickup_lat::numeric, 2), pickup_lng = round(pickup_lng::numeric, 2),
    dropoff_lat = round(dropoff_lat::numeric, 2), dropoff_lng = round(dropoff_lng::numeric, 2),
    customer_notes = null, travel_ref = null
  where contact_id = v_contact;

  update public.contacts set full_name = 'Deleted customer', phone = null, email = null,
                             anonymized_at = now(), profile_id = null
  where id = v_contact;
  delete from public.contact_notes where contact_id = v_contact;
end $$;

-- Contacts that probably belong to a newly signed-up customer.
create function public.contact_link_suggestions()
returns table (account_contact_id uuid, existing_contact_id uuid, match text)
language sql stable security definer set search_path = '' as $$
  select a.id, e.id,
         case when a.email is not null and lower(a.email) = lower(e.email)
                   and u.email_confirmed_at is not null then 'verified_email'
              else 'phone_unverified' end
  from public.contacts a
  join auth.users u on u.id = a.profile_id
  join public.contacts e on e.profile_id is null and e.id <> a.id and e.anonymized_at is null
   and ((a.email is not null and lower(a.email) = lower(e.email) and u.email_confirmed_at is not null)
        or (a.phone is not null and a.phone = e.phone))
  where public.is_admin();
$$;

-- Admin confirms a suggestion: the driver-created contact survives with its history.
create function public.link_contacts(p_account_contact uuid, p_existing_contact uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.contacts;
  e public.contacts;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select * into a from public.contacts where id = p_account_contact for update;
  select * into e from public.contacts where id = p_existing_contact for update;
  if a.id is null or e.id is null or a.profile_id is null or e.profile_id is not null then
    raise exception 'BAD_LINK';
  end if;

  update public.rides set contact_id = e.id where contact_id = a.id;
  delete from public.contacts where id = a.id;
  update public.contacts set
    profile_id = a.profile_id,
    full_name  = coalesce(nullif(e.full_name, ''), a.full_name),
    phone      = coalesce(e.phone, a.phone),
    email      = coalesce(e.email, a.email)
  where id = e.id;
end $$;

-- ---------------------------------------------------------------------------
-- Permissions: internal helpers and service-only functions are not callable from the app
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

revoke execute on function public.create_ride(uuid, jsonb, jsonb, boolean, boolean) from authenticated;
revoke execute on function public.ride_neighbours(uuid, timestamptz, uuid) from authenticated;
revoke execute on function public.forget_customer(uuid) from authenticated;
revoke execute on function public.expire_overdue() from authenticated;
revoke execute on function public.remind_open_rides() from authenticated;
revoke execute on function public.apply_retention() from authenticated;
revoke execute on function public._notify(uuid, uuid, text, jsonb) from authenticated;
revoke execute on function public._log_event(uuid, public.ride_status, public.ride_status, uuid, text) from authenticated;
revoke execute on function public._load_ride(uuid) from authenticated;

grant execute on function public.create_ride(uuid, jsonb, jsonb, boolean, boolean) to service_role;
grant execute on function public.ride_neighbours(uuid, timestamptz, uuid) to service_role;
grant execute on function public.forget_customer(uuid) to service_role;

-- Future functions are not executable by anon unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;

-- Policy helpers must stay callable for every role that can reach the tables.
grant execute on function public.has_role(public.app_role) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_driver_id() to anon, authenticated;
grant execute on function public.my_contact_id() to anon, authenticated;
