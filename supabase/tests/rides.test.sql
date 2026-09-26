-- Business rule tests. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures (seed.sql provides driver d001, owner a1, client c1)
-- ---------------------------------------------------------------------------
-- Next week's Tuesday 00:00 in Paris, plus h hours.
create function pg_temp.slot(h numeric) returns timestamptz language sql as $$
  select (date_trunc('week', now() at time zone 'Europe/Paris') + interval '8 days'
          + make_interval(secs => h * 3600)) at time zone 'Europe/Paris';
$$;

-- Louvre -> Arc de Triomphe, 4 km, 15 min.
create function pg_temp.ride(p_pickup timestamptz, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'pickup_at', p_pickup,
    'pickup_address', 'Louvre', 'pickup_lat', 48.8606, 'pickup_lng', 2.3376,
    'dropoff_address', 'Arc de Triomphe', 'dropoff_lat', 48.8738, 'dropoff_lng', 2.2950,
    'distance_m', 4000, 'duration_s', 900, 'passengers', 1, 'luggage', 0) || extra;
$$;

create function pg_temp.raw_ride(p_status public.ride_status, p_pickup timestamptz, p_contact uuid)
returns uuid language sql as $$
  insert into public.rides (contact_id, driver_id, source, status, pickup_at,
    pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
    distance_m, duration_s, blocked_range, estimated_price, agreed_price)
  values (p_contact, '00000000-0000-0000-0000-00000000d001', 'app', p_status, p_pickup,
    'A', 48.86, 2.33, 'B', 48.87, 2.29, 4000, 900,
    tstzrange(p_pickup, p_pickup + interval '30 minutes'), 29, 29)
  returning id;
$$;

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_admin_db() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

\set driver '''00000000-0000-0000-0000-00000000d001'''
\set owner '''00000000-0000-0000-0000-0000000000a1'''
\set client '''00000000-0000-0000-0000-0000000000c1'''

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'client_contact', id from public.contacts where profile_id = :client;

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
select is((select price from public.estimate_price(:driver, 10000, 1200, pg_temp.slot(10), 48.8606, 2.3376, 48.8738, 2.2950)),
  29.00::numeric, 'formula: 5 + 10 km x 1.60 + 20 min x 0.40 = 29');
select is((select price from public.estimate_price(:driver, 1000, 60, pg_temp.slot(10), 48.8606, 2.3376, 48.8738, 2.2950)),
  20.00::numeric, 'minimum fare applies to short rides');
select is((select row(price, is_fixed)::text from public.estimate_price(:driver, 30000, 2700, pg_temp.slot(10), 48.8606, 2.3376, 49.0097, 2.5479)),
  row(65.00::numeric, true)::text, 'Paris -> CDG uses the fixed price');
select is((select price from public.estimate_price(:driver, 30000, 2700, pg_temp.slot(10), 49.0097, 2.5479, 48.8606, 2.3376)),
  65.00::numeric, 'fixed price works in both directions');
select is((select price from public.estimate_price(:driver, 10000, 1200, pg_temp.slot(23), 48.8606, 2.3376, 48.8738, 2.2950)),
  33.35::numeric, 'night surcharge 15% at 23:00');
select is((select price from public.estimate_price(:driver, 10000, 1200, pg_temp.slot(30), 48.8606, 2.3376, 48.8738, 2.2950)),
  33.35::numeric, 'night window crossing midnight still applies at 06:00 next day');
select is((select price from public.estimate_price(:driver, 10000, 1200, pg_temp.slot(132), 48.8606, 2.3376, 48.8738, 2.2950)),
  31.90::numeric, 'Sunday surcharge 10% at noon');
select is((select price from public.estimate_price(:driver, 10000, 1200, pg_temp.slot(141), 48.8606, 2.3376, 48.8738, 2.2950)),
  33.35::numeric, 'Sunday night: only the largest surcharge applies, no stacking');
select is((select price from public.estimate_price(:driver, 30000, 2700, pg_temp.slot(23), 48.8606, 2.3376, 49.0097, 2.5479)),
  65.00::numeric, 'surcharges do not apply to fixed prices by default');

-- ---------------------------------------------------------------------------
-- create_ride: customer requests
-- ---------------------------------------------------------------------------
select is((public.create_ride(:client, pg_temp.ride(pg_temp.slot(10)), '{}', true) ->> 'ok')::boolean,
  true, 'dry run returns an estimate');
select is((public.create_ride(:client, pg_temp.ride(pg_temp.slot(10)), '{}', true) ->> 'estimate')::numeric,
  20.00::numeric, 'dry run estimate: 5 + 4 x 1.60 + 15 x 0.40 = 17.40, minimum fare 20 wins');

insert into ids select 'request_10', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(10))) ->> 'ride_id')::uuid;
select is((select status::text from public.rides where id = (select id from ids where name = 'request_10')),
  'requested', 'customer request is created as requested');
select ok((select answer_deadline is not null from public.rides where id = (select id from ids where name = 'request_10')),
  'request has an answer deadline');
select ok(exists (select 1 from public.notifications where recipient_id = :owner and kind = 'new_request'),
  'driver is notified of a new request');

select ok(public.create_ride(:client, pg_temp.ride(now() + interval '1 hour')) -> 'errors' ? 'TOO_SHORT_NOTICE',
  'requests need 3 hours notice');
select ok(public.create_ride(:client, pg_temp.ride(now() - interval '1 hour')) -> 'errors' ? 'PICKUP_IN_PAST',
  'pickup in the past is refused');
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(11), '{"passengers": 6}')) -> 'errors' ? 'OVER_CAPACITY',
  'customer cannot exceed vehicle capacity');
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(11), '{"vehicle": "van"}')) -> 'errors' ? 'VEHICLE_UNAVAILABLE',
  'customer cannot ask for a vehicle the driver does not have');
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(23))) -> 'errors' ? 'OUTSIDE_HOURS',
  'request after working hours is refused');
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(132))) -> 'errors' ? 'OUTSIDE_HOURS',
  'request on a day off (Sunday) is refused');

insert into public.time_off (driver_id, period) values (:driver, tstzrange(pg_temp.slot(34), pg_temp.slot(36)));
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(34.5))) -> 'errors' ? 'DRIVER_UNAVAILABLE',
  'request during time off is refused');

-- ---------------------------------------------------------------------------
-- create_ride: driver quick-add
-- ---------------------------------------------------------------------------
insert into public.contacts (full_name, phone, notice_given) values ('Phone Customer', '+33622222222', true);
insert into ids select 'phone_contact', id from public.contacts where phone = '+33622222222';

select is(public.create_ride(:owner, pg_temp.ride(pg_temp.slot(14), jsonb_build_object(
    'mode', 'quick_add', 'contact_id', (select id from ids where name = 'phone_contact'), 'passengers', 6))) -> 'needs_override',
  'true'::jsonb, 'quick-add over capacity asks the driver to confirm');

insert into ids select 'quick_14', (public.create_ride(:owner, pg_temp.ride(pg_temp.slot(14), jsonb_build_object(
    'mode', 'quick_add', 'contact_id', (select id from ids where name = 'phone_contact'), 'passengers', 6)),
  '{}', false, true) ->> 'ride_id')::uuid;
select is((select status::text from public.rides where id = (select id from ids where name = 'quick_14')),
  'accepted', 'confirmed quick-add is accepted immediately');
select is((select agreed_price from public.rides where id = (select id from ids where name = 'quick_14')),
  20.00::numeric, 'quick-add agreed price defaults to the estimate (VTC)');

select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(14.1))) -> 'errors' ? 'SLOT_TAKEN',
  'customer cannot book over an accepted ride');
select ok(public.create_ride(:owner, pg_temp.ride(pg_temp.slot(14.1), jsonb_build_object(
    'mode', 'quick_add', 'contact_id', (select id from ids where name = 'phone_contact'))), '{}', false, true) -> 'errors' ? 'SLOT_TAKEN',
  'even a confirmed quick-add cannot overlap an accepted ride');
select ok(public.create_ride(:owner, pg_temp.ride(pg_temp.slot(34.5), jsonb_build_object(
    'mode', 'quick_add', 'contact_id', (select id from ids where name = 'phone_contact')))) -> 'warnings' ? 'DRIVER_UNAVAILABLE',
  'quick-add during time off is a warning the driver can override');
select throws_ok(
  format('select public.create_ride(%L, %L::jsonb)', :client, pg_temp.ride(pg_temp.slot(15), jsonb_build_object(
    'mode', 'quick_add', 'contact_id', (select id from ids where name = 'phone_contact')))),
  'P0001', 'FORBIDDEN', 'customers cannot quick-add');

-- Travel time between rides (quick_14 ends 14:15, blocked until 14:30)
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(14 + 40/60.0))) -> 'errors' ? 'AVAILABILITY_CHANGED',
  'travel times computed for other neighbours are rejected');
select ok(public.create_ride(:client, pg_temp.ride(pg_temp.slot(14 + 40/60.0)),
    jsonb_build_object('prev_id', (select id from ids where name = 'quick_14'), 'prev_s', 1800)) -> 'errors' ? 'TIGHT_SCHEDULE',
  'not enough road time from the previous drop-off');
select is((public.create_ride(:client, pg_temp.ride(pg_temp.slot(14 + 40/60.0)),
    jsonb_build_object('prev_id', (select id from ids where name = 'quick_14'), 'prev_s', 600), true) ->> 'ok')::boolean,
  true, 'enough road time from the previous drop-off');

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
insert into public.contact_notes (contact_id, notes) values ((select id from ids where name = 'client_contact'), 'private');

select pg_temp.as_user(:client);
select throws_ok(format('select public.create_ride(%L, %L::jsonb)', :client, pg_temp.ride(pg_temp.slot(10))),
  '42501', null, 'the app cannot call create_ride directly');
select throws_ok($$ insert into public.rides (contact_id, driver_id, source, status, pickup_at, pickup_address, pickup_lat,
    pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, blocked_range)
  values ((select id from ids where name = 'client_contact'), '00000000-0000-0000-0000-00000000d001', 'app', 'accepted',
    now() + interval '5 days', 'A', 0, 0, 'B', 0, 0, 1, 1, tstzrange(now(), now() + interval '1 hour')) $$,
  '42501', null, 'customers cannot insert rides directly');
select is((select count(*) from public.rides where contact_id <> (select id from ids where name = 'client_contact')),
  0::bigint, 'customers only see their own rides');
select is((select count(*) from public.contact_notes), 0::bigint, 'customers cannot read driver notes');
select throws_ok(format('select public.accept_ride(%L)', (select id from ids where name = 'request_10')),
  'P0001', 'FORBIDDEN', 'customers cannot accept rides');

select pg_temp.as_user(:owner);
select ok((select count(*) from public.rides) >= 2, 'the driver sees rides from all channels');

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------
select lives_ok(format('select public.accept_ride(%L)', (select id from ids where name = 'request_10')), 'driver accepts');
select pg_temp.as_admin_db();
select is((select row(status, agreed_price)::text from public.rides where id = (select id from ids where name = 'request_10')),
  row('accepted'::public.ride_status, 20.00::numeric)::text, 'accepted ride keeps the estimate as agreed price');
select ok(exists (select 1 from public.notifications where recipient_id = :client and kind = 'ride_accepted'),
  'customer is notified on acceptance');

-- Price proposal round trip
insert into ids select 'request_16', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(58))) ->> 'ride_id')::uuid;
select pg_temp.as_user(:owner);
select lives_ok(format('select public.propose_price(%L, 30)', (select id from ids where name = 'request_16')), 'driver proposes 30');
select pg_temp.as_user(:client);
select lives_ok(format('select public.respond_to_price(%L, true)', (select id from ids where name = 'request_16')), 'customer accepts');
select pg_temp.as_admin_db();
select is((select row(status, agreed_price)::text from public.rides where id = (select id from ids where name = 'request_16')),
  row('accepted'::public.ride_status, 30.00::numeric)::text, 'accepted proposal becomes the agreed price');

-- Customer refuses a proposal
insert into ids select 'request_18', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(82))) ->> 'ride_id')::uuid;
select pg_temp.as_user(:owner);
select lives_ok(format('select public.propose_price(%L, 40)', (select id from ids where name = 'request_18')), 'driver proposes 40');
select pg_temp.as_user(:client);
select lives_ok(format('select public.respond_to_price(%L, false)', (select id from ids where name = 'request_18')), 'customer refuses');
select pg_temp.as_admin_db();
select is((select status::text from public.rides where id = (select id from ids where name = 'request_18')),
  'declined_by_customer', 'refused proposal releases the slot');

-- Driver withdraws a proposal
insert into ids select 'request_19', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(106))) ->> 'ride_id')::uuid;
select pg_temp.as_user(:owner);
select lives_ok(format('select public.propose_price(%L, 40)', (select id from ids where name = 'request_19')), 'driver proposes');
select lives_ok(format('select public.decline_ride(%L, %L)', (select id from ids where name = 'request_19'), 'changed my mind'),
  'driver withdraws the proposal');

-- Proposal too close to pickup: the customer must get at least 30 minutes
select pg_temp.as_admin_db();
insert into ids select 'late', pg_temp.raw_ride('requested', now() + interval '2 hours 20 minutes',
                                               (select id from ids where name = 'client_contact'));
select pg_temp.as_user(:owner);
select throws_ok(format('select public.propose_price(%L, 50)', (select id from ids where name = 'late')),
  'P0001', 'TOO_LATE_TO_PROPOSE', 'no proposal that leaves the customer under 30 minutes');

-- Taxi licence: no price proposals
select pg_temp.as_admin_db();
update public.pricing_settings set licence = 'taxi' where driver_id = :driver;
insert into ids select 'request_20', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(154))) ->> 'ride_id')::uuid;
select pg_temp.as_user(:owner);
select throws_ok(format('select public.propose_price(%L, 50)', (select id from ids where name = 'request_20')),
  'P0001', 'NOT_ALLOWED_FOR_TAXI', 'taxi licence cannot propose prices');
select pg_temp.as_admin_db();
update public.pricing_settings set licence = 'vtc' where driver_id = :driver;

-- Two overlapping requests: only one can hold the slot
insert into ids select 'overlap_a', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(178))) ->> 'ride_id')::uuid;
insert into ids select 'overlap_b', (public.create_ride(:client, pg_temp.ride(pg_temp.slot(178.1))) ->> 'ride_id')::uuid;
select pg_temp.as_user(:owner);
select is((select count(*) from public.request_conflicts()), 0::bigint, 'no conflict before any acceptance');
select lives_ok(format('select public.accept_ride(%L)', (select id from ids where name = 'overlap_a')), 'accept the first');
select is((select clashing_ride_id from public.request_conflicts() where request_id = (select id from ids where name = 'overlap_b')),
  (select id from ids where name = 'overlap_a'), 'the second request is flagged as conflicting');
select throws_ok(format('select public.accept_ride(%L)', (select id from ids where name = 'overlap_b')),
  'P0001', 'SLOT_TAKEN', 'the database refuses the overlapping acceptance');
select throws_ok(format('select public.propose_price(%L, 20)', (select id from ids where name = 'overlap_b')),
  'P0001', 'SLOT_TAKEN', 'a proposal cannot hold an overlapping slot either');

-- Cancel, complete, no-show
select throws_ok(format('select public.cancel_ride(%L)', (select id from ids where name = 'overlap_a')),
  'P0001', 'REASON_REQUIRED', 'driver must give a reason to cancel');
select throws_ok(format('select public.complete_ride(%L)', (select id from ids where name = 'overlap_a')),
  'P0001', 'TOO_EARLY', 'cannot complete before pickup');
select throws_ok(format('select public.mark_no_show(%L)', (select id from ids where name = 'overlap_a')),
  'P0001', 'TOO_EARLY', 'cannot mark no-show before pickup');
select pg_temp.as_user(:client);
select lives_ok(format('select public.cancel_ride(%L)', (select id from ids where name = 'overlap_a')), 'customer cancels');

select pg_temp.as_admin_db();
insert into ids select 'past', pg_temp.raw_ride('accepted', now() - interval '3 hours',
                                               (select id from ids where name = 'client_contact'));
select pg_temp.as_user(:owner);
select throws_ok(format('select public.complete_ride(%L, 35)', (select id from ids where name = 'past')),
  'P0001', 'REASON_REQUIRED', 'changing the agreed price needs a reason');
select lives_ok(format('select public.complete_ride(%L, 35, %L)', (select id from ids where name = 'past'), '20 min waiting'),
  'complete with a reason');
select pg_temp.as_admin_db();
select is((select row(status, final_price)::text from public.rides where id = (select id from ids where name = 'past')),
  row('completed'::public.ride_status, 35.00::numeric)::text, 'final price recorded');

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
update public.rides set answer_deadline = now() - interval '1 minute' where id = (select id from ids where name = 'overlap_b');
select ok(public.expire_overdue() >= 1, 'overdue requests expire');
select is((select status::text from public.rides where id = (select id from ids where name = 'overlap_b')),
  'expired', 'expired status');
select ok(exists (select 1 from public.notifications where ride_id = (select id from ids where name = 'overlap_b')
                  and kind = 'ride_expired' and recipient_id = :client), 'customer is told about expiry');

insert into ids select 'open', pg_temp.raw_ride('accepted', now() - interval '5 hours',
                                               (select id from ids where name = 'client_contact'));
select ok(public.remind_open_rides() >= 1, 'driver is reminded about rides left open');
select is(public.remind_open_rides(), 0, 'the reminder is sent only once');

insert into public.rides (contact_id, driver_id, source, status, pickup_at, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, blocked_range, updated_at)
values ((select id from ids where name = 'phone_contact'), :driver, 'phone', 'cancelled', now() - interval '2 years',
  'A', 0, 0, 'B', 0, 0, 1, 1, tstzrange(now() - interval '2 years', now() - interval '2 years' + interval '1 hour'),
  now() - interval '13 months');
insert into public.contacts (full_name, phone, updated_at) values ('Old Contact', '+33699999999', now() - interval '3 years');
select public.apply_retention();
select is((select count(*) from public.rides where status = 'cancelled' and updated_at < now() - interval '12 months'),
  0::bigint, 'old cancelled rides are deleted');
select is((select count(*) from public.contacts where phone = '+33699999999'), 0::bigint,
  'inactive contacts without rides are deleted');
select is((select count(*) from public.contacts where id = (select id from ids where name = 'client_contact')), 1::bigint,
  'contacts with an account are kept');

-- ---------------------------------------------------------------------------
-- Contact linking and account deletion
-- ---------------------------------------------------------------------------
insert into public.contacts (full_name, phone) values ('Client by phone', '+33611111111');
insert into ids select 'dup', id from public.contacts where full_name = 'Client by phone';
select pg_temp.as_user(:owner);
select is((select match from public.contact_link_suggestions() where existing_contact_id = (select id from ids where name = 'dup')),
  'phone_unverified', 'a phone match is only suggested, never merged');
select lives_ok(format('select public.link_contacts(%L, %L)', (select id from ids where name = 'client_contact'),
  (select id from ids where name = 'dup')), 'admin confirms the link');
select pg_temp.as_admin_db();
select is((select profile_id from public.contacts where id = (select id from ids where name = 'dup')), :client::uuid,
  'the existing contact now belongs to the account');
select is((select count(*) from public.rides where contact_id = (select id from ids where name = 'client_contact')),
  0::bigint, 'rides moved to the surviving contact');

select public.forget_customer(:client);
select is((select count(*) from public.rides where contact_id = (select id from ids where name = 'dup')
           and status in ('requested', 'price_proposed', 'accepted')),
  0::bigint, 'account deletion cancels every open ride');
select is((select full_name from public.contacts where id = (select id from ids where name = 'dup')),
  'Deleted customer', 'contact is anonymized');
select is((select count(*) from public.rides where contact_id = (select id from ids where name = 'dup')
           and pickup_address <> '(address removed)'),
  0::bigint, 'addresses are removed from the kept rides');

select * from finish();
rollback;
