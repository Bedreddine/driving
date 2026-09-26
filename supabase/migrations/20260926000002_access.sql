-- Roles, sign-up handling and row level security.

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create function public.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin');
$$;

create function public.my_driver_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.drivers where profile_id = auth.uid() and active;
$$;

create function public.my_contact_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.contacts where profile_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: every new account gets a profile, the customer role and a contact.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_phone text := nullif(new.raw_user_meta_data ->> 'phone', '');
  v_lang  text := coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'fr');
begin
  if v_lang not in ('fr', 'en') then
    v_lang := 'fr';
  end if;

  insert into public.profiles (id, full_name, phone, language)
  values (new.id, v_name, v_phone, v_lang);

  insert into public.user_roles (user_id, role) values (new.id, 'customer');

  insert into public.contacts (profile_id, full_name, phone, email, notice_given, created_by)
  values (new.id, coalesce(nullif(v_name, ''), new.email, 'Customer'), v_phone, new.email, true, new.id);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Make an existing account the business owner (admin + driver).
-- Only callable from the SQL editor / service role, never from the app.
create function public.make_owner(p_email text, p_driver_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid;
  v_driver uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'No account with email %', p_email;
  end if;

  insert into public.user_roles (user_id, role) values (v_user, 'admin'), (v_user, 'driver')
  on conflict do nothing;

  v_driver := coalesce(p_driver_id, (select id from public.drivers order by created_at limit 1));
  if v_driver is null then
    insert into public.drivers (display_name, profile_id)
    values (coalesce((select nullif(full_name, '') from public.profiles where id = v_user), p_email), v_user)
    returning id into v_driver;
    insert into public.pricing_settings (driver_id) values (v_driver);
  else
    update public.drivers set profile_id = v_user where id = v_driver;
  end if;

  return v_driver;
end $$;
revoke execute on function public.make_owner(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- Writes to rides only ever happen through the functions in the next migration.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.contacts         enable row level security;
alter table public.contact_notes    enable row level security;
alter table public.drivers          enable row level security;
alter table public.working_hours    enable row level security;
alter table public.time_off         enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.zones            enable row level security;
alter table public.fixed_prices     enable row level security;
alter table public.surcharges       enable row level security;
alter table public.rides            enable row level security;
alter table public.ride_events      enable row level security;
alter table public.notifications    enable row level security;
alter table public.push_tokens      enable row level security;

-- profiles
create policy "own profile read" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- roles: readable by the owner so the app can route; managed by admins only
create policy "own roles read" on public.user_roles for select
  using (user_id = auth.uid() or public.is_admin());
create policy "admin manages roles" on public.user_roles for all
  using (public.is_admin()) with check (public.is_admin());

-- contacts: customers see their own; a driver sees contacts of their rides; admin sees all
create policy "contacts read" on public.contacts for select using (
  profile_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.contact_id = contacts.id and r.driver_id = public.my_driver_id()
  )
);
create policy "staff insert contacts" on public.contacts for insert
  with check (public.is_admin() or public.my_driver_id() is not null);
create policy "staff update contacts" on public.contacts for update
  using (public.is_admin() or public.my_driver_id() is not null)
  with check (public.is_admin() or public.my_driver_id() is not null);

create policy "staff notes" on public.contact_notes for all
  using (public.is_admin() or public.my_driver_id() is not null)
  with check (public.is_admin() or public.my_driver_id() is not null);

-- drivers: public info for signed-in users (customers need name and capacity)
create policy "drivers read" on public.drivers for select to authenticated using (true);
create policy "drivers write" on public.drivers for all
  using (public.is_admin()) with check (public.is_admin());

-- hours and time off: staff only
create policy "hours read" on public.working_hours for select to authenticated using (true);
create policy "hours write" on public.working_hours for all
  using (public.is_admin() or driver_id = public.my_driver_id())
  with check (public.is_admin() or driver_id = public.my_driver_id());
create policy "time off" on public.time_off for all
  using (public.is_admin() or driver_id = public.my_driver_id())
  with check (public.is_admin() or driver_id = public.my_driver_id());

-- pricing: readable by signed-in users, editable by admin
create policy "pricing read" on public.pricing_settings for select to authenticated using (true);
create policy "pricing write" on public.pricing_settings for all
  using (public.is_admin()) with check (public.is_admin());
create policy "zones read" on public.zones for select to authenticated using (true);
create policy "zones write" on public.zones for all
  using (public.is_admin()) with check (public.is_admin());
create policy "fixed read" on public.fixed_prices for select to authenticated using (true);
create policy "fixed write" on public.fixed_prices for all
  using (public.is_admin()) with check (public.is_admin());
create policy "surcharges read" on public.surcharges for select to authenticated using (true);
create policy "surcharges write" on public.surcharges for all
  using (public.is_admin()) with check (public.is_admin());

-- rides: read-only through policies; no insert/update/delete policies on purpose
create policy "rides read" on public.rides for select using (
  public.is_admin()
  or driver_id = public.my_driver_id()
  or contact_id = public.my_contact_id()
);
create policy "ride events read" on public.ride_events for select using (
  exists (select 1 from public.rides r where r.id = ride_events.ride_id)
);

-- notifications
create policy "own notifications" on public.notifications for select
  using (recipient_id = auth.uid());
create policy "mark own read" on public.notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- push tokens
create policy "own push tokens" on public.push_tokens for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Customers may only edit harmless profile fields; role changes go through admins.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, language) on public.profiles to authenticated;
