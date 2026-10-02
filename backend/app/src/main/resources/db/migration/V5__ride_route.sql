-- The road of each ride for the map on the ride pages: [[lng, lat], ...] (at most 400 points), as given with the
-- price. Null when the map server did not answer at booking time (distance and time were estimates).
-- Personal data (it shows the exact addresses): erased with them (customer forgotten, retention).
alter table rides add column route jsonb check (route is null or jsonb_typeof(route) = 'array');
