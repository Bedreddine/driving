-- A driver can see the contacts they created themselves (quick-add of a new phone customer),
-- even before any ride links them.
drop policy "contacts read" on public.contacts;
create policy "contacts read" on public.contacts for select using (
  profile_id = auth.uid()
  or created_by = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.contact_id = contacts.id and r.driver_id = public.my_driver_id()
  )
);

-- Staff inserts record who created the contact.
alter table public.contacts alter column created_by set default auth.uid();
