-- Local development data. Replace the prices with your real rate card.
-- Owner login for local testing: owner@taxi.test / password123
-- Customer login for local testing: client@taxi.test / password123

insert into public.drivers (id, display_name, phone, timezone, seats, luggage, vehicle)
values ('00000000-0000-0000-0000-00000000d001', 'My Taxi', '+33600000000', 'Europe/Paris', 4, 3, 'sedan');

insert into public.pricing_settings (driver_id, licence, currency, base_fare, per_km, per_minute, minimum_fare)
values ('00000000-0000-0000-0000-00000000d001', 'vtc', 'EUR', 5.00, 1.60, 0.40, 20.00);

-- Monday to Saturday 06:00-22:00
insert into public.working_hours (driver_id, weekday, start_time, end_time)
select '00000000-0000-0000-0000-00000000d001', d, '06:00', '22:00' from generate_series(1, 6) d;

insert into public.zones (id, name, kind, center_lat, center_lng, radius_m) values
  ('00000000-0000-0000-0000-0000000a0001', 'Paris intra-muros', 'other',   48.8566, 2.3522, 6000),
  ('00000000-0000-0000-0000-0000000a0002', 'CDG Airport',       'airport', 49.0097, 2.5479, 3000),
  ('00000000-0000-0000-0000-0000000a0003', 'Orly Airport',      'airport', 48.7262, 2.3652, 2500),
  ('00000000-0000-0000-0000-0000000a0004', 'Gare de Lyon',      'station', 48.8443, 2.3744, 400),
  ('00000000-0000-0000-0000-0000000a0005', 'Gare du Nord',      'station', 48.8809, 2.3553, 400);

insert into public.fixed_prices (driver_id, from_zone, to_zone, price) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0002', 65.00),
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0003', 45.00);

insert into public.surcharges (driver_id, name, days, start_time, end_time, percent) values
  ('00000000-0000-0000-0000-00000000d001', 'Night', '{0,1,2,3,4,5,6}', '20:00', '07:00', 15),
  ('00000000-0000-0000-0000-00000000d001', 'Sunday', '{0}', '00:00', '23:59', 10);

-- Test accounts (local only)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated',
   'authenticated', 'owner@taxi.test', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Driver","language":"fr"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated',
   'authenticated', 'client@taxi.test', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Test Client","phone":"+33611111111","language":"en"}',
   now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.email in ('owner@taxi.test', 'client@taxi.test');

select public.make_owner('owner@taxi.test', '00000000-0000-0000-0000-00000000d001');
