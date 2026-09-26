-- Scheduled jobs (pg_cron runs inside Postgres, no extra service needed).
create extension if not exists pg_cron with schema pg_catalog;

-- Expire unanswered requests / proposals and remind about rides left open.
select cron.schedule('expire-and-remind', '*/5 * * * *',
  $$ select public.expire_overdue(); select public.remind_open_rides(); $$);

-- Data retention, every night at 03:15 UTC.
select cron.schedule('retention', '15 3 * * *', $$ select public.apply_retention(); $$);

-- App screens update live when rides or notifications change.
alter publication supabase_realtime add table public.rides, public.notifications;
