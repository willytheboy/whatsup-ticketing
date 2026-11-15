-- Demo only: move the six demo events forward by whole weeks so the catalogue has upcoming events again.
-- Each event keeps its weekday and local (Beirut) time. Safe to re-run: it does nothing while the earliest demo event is still ahead.
-- Venues, stays and the summer pass run on season dates and are not touched. Run in the SQL editor or with psql.
do $$
declare
  demo text[] := array['sunset-sessions-rooftop','batroun-waterfront-fest','cedars-night-hike','souk-el-akel-harvest','comedy-night-bil-lebnene','techno-cement-works'];
  lb uuid := (select id from tenants where slug = 'lb');
  earliest timestamptz;
  n int;
begin
  select min(starts_at) into earliest from events where tenant_id = lb and slug = any(demo) and kind = 'event';
  if earliest is null or earliest > now() then raise notice 'demo events already upcoming'; return; end if;
  n := ceil(extract(epoch from (now() - earliest)) / (7 * 86400))::int;
  update events set
    starts_at = ((starts_at at time zone 'Asia/Beirut') + make_interval(weeks => n)) at time zone 'Asia/Beirut',
    doors_at  = ((doors_at  at time zone 'Asia/Beirut') + make_interval(weeks => n)) at time zone 'Asia/Beirut',
    ends_at   = ((ends_at   at time zone 'Asia/Beirut') + make_interval(weeks => n)) at time zone 'Asia/Beirut'
  where tenant_id = lb and slug = any(demo) and kind = 'event';
  update tiers set sale_starts = sale_starts + make_interval(weeks => n), sale_ends = sale_ends + make_interval(weeks => n)
  where event_id in (select id from events where tenant_id = lb and slug = any(demo));
  raise notice 'demo events moved forward % weeks', n;
end $$;
