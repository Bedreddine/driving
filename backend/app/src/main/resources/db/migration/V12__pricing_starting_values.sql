-- A new driver starts with typical Paris VTC prices instead of zero, so a fresh install never quotes a free ride
-- before the owner opens the back office (Tarifs). Existing drivers keep their prices.
alter table pricing_settings
  alter column base_fare set default 5.00,
  alter column per_km set default 1.60,
  alter column per_minute set default 0.40,
  alter column minimum_fare set default 20.00;
