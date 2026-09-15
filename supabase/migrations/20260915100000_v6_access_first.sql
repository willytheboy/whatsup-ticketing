-- v6 · Access first (15 Sep 2026, claude/access-first-rule.md)
-- In any venue, access (entrance) is bought first; services inside the venue presuppose it.
-- Additive: every existing row keeps working — tickets, day passes, stays, passes and tables are access offers,
-- items are services that need an entrance in the same order or one the buyer already holds.

-- ---- offers: role, headcount, entry requirement, per-person cap
alter table tiers add column if not exists role text not null default 'access' check (role in ('access','service'));
alter table tiers add column if not exists admits int not null default 1 check (admits >= 1);          -- people one unit lets in (a cabana admits 6)
alter table tiers add column if not exists requires_access boolean not null default true;            -- services: needs an entrance ("no entry needed" switch)
alter table tiers add column if not exists per text not null default 'order' check (per in ('order','person'));  -- services: per-person quantity ≤ admitted headcount
update tiers set role = 'service' where kind = 'item' and role = 'access';

-- items are services unless an insert says otherwise (poster-to-listing, API, older clients)
create or replace function tiers_role_default() returns trigger language plpgsql as $$
begin
  if new.kind = 'item' and new.role = 'access' and new.admits = 1 then new.role := 'service'; end if;
  return new;
end $$;
drop trigger if exists tiers_role_default on tiers;
create trigger tiers_role_default before insert on tiers for each row execute function tiers_role_default();

-- ---- tables: at an event a table includes entry for the party unless the organiser says otherwise; at a dining venue it is the access
alter table tables_vip add column if not exists includes_entry boolean not null default true;

-- ---- passes: the venues a membership covers (null = legacy, unrestricted; set by the editor from now on)
alter table events add column if not exists pass_venue_ids uuid[];
update events set pass_venue_ids = array[venue_id] where kind = 'pass' and venue_id is not null and pass_venue_ids is null;

-- ---- demo data: the cabana is one access offer that admits six; rentals are per person; the shuttle and the hike need no entrance
update tiers set role = 'access', admits = 6, per_order_limit = 2 where id = 'b2f3d5c7-0102-4b22-9d02-000000000102';
update tiers set per = 'person' where id in ('b2f3d5c7-0103-4b22-9d02-000000000103','b2f3d5c7-0104-4b22-9d02-000000000104');
update tiers set requires_access = false where id in ('b2f3d5c7-0001-4b22-9d02-000000000001','b2f3d5c7-0303-4b22-9d02-000000000303');
update tiers set capacity = 20 where id = 'b2f3d5c7-0103-4b22-9d02-000000000103';   -- demo stock after the v6 live tests
update tiers set capacity = 12 where id = 'b2f3d5c7-0102-4b22-9d02-000000000102';

-- ---- access held for a listing: people the buyer can already bring in today
-- tickets for this event (valid or scanned), day passes (unused, used today, or multi-day still valid), stays, entry-inclusive tables,
-- and memberships that cover this listing's venue and are still valid. Counts admits per unit; a table counts its party.
create or replace function held_access(p_event uuid, p_user uuid) returns int language plpgsql stable security definer set search_path = public as $$
declare e record; n int := 0; m int := 0; today date := (now() at time zone 'Asia/Beirut')::date;
begin
  if p_user is null then return 0; end if;
  select id, venue_id, tenant_id into e from events where id = p_event;
  if not found then return 0; end if;
  select coalesce(sum(
    case when k.tier_id is null then coalesce((o.meta->>'party')::int, tv.seats, 1) else coalesce(t.admits, 1) end), 0)::int into n
  from tickets k
  left join tiers t on t.id = k.tier_id
  left join orders o on o.id = k.order_id
  left join order_lines ol on ol.order_id = k.order_id and ol.table_id is not null
  left join tables_vip tv on tv.id = ol.table_id
  where k.holder_id = p_user and k.event_id = p_event and k.state in ('valid','scanned')
    and coalesce(t.role, 'access') = 'access'
    and coalesce(t.kind, 'ticket') <> 'pass'
    and (k.tier_id is not null or coalesce(tv.includes_entry, true))
    and (coalesce(t.kind, 'ticket') <> 'daypass' or k.state = 'valid'
         or (k.scanned_at at time zone 'Asia/Beirut')::date = today
         or (k.valid_until is not null and k.valid_until > now()));
  -- memberships: a pass listing covers the venues in pass_venue_ids (null = unrestricted legacy passes)
  if e.venue_id is not null then
    select count(*)::int into m
    from tickets k join tiers t on t.id = k.tier_id join events pe on pe.id = k.event_id
    where k.holder_id = p_user and t.kind = 'pass' and k.state in ('valid','scanned')
      and (k.valid_until is null or k.valid_until > now())
      and pe.tenant_id = e.tenant_id
      and (pe.pass_venue_ids is null or e.venue_id = any(pe.pass_venue_ids));
  end if;
  return n + m;
end $$;
revoke all on function held_access(uuid, uuid) from public;
grant execute on function held_access(uuid, uuid) to service_role;

create or replace function my_access(p_event uuid) returns int language sql stable security definer set search_path = public as $$
  select held_access(p_event, auth.uid())
$$;
grant execute on function my_access(uuid) to authenticated;

-- ---- membership coverage for a venue (used by create-order for member_free offers)
create or replace function pass_covers(p_user uuid, p_venue uuid, p_tenant uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tickets k join tiers t on t.id = k.tier_id join events pe on pe.id = k.event_id
    where k.holder_id = p_user and t.kind = 'pass' and k.state in ('valid','scanned')
      and (k.valid_until is null or k.valid_until > now()) and pe.tenant_id = p_tenant
      and (pe.pass_venue_ids is null or (p_venue is not null and p_venue = any(pe.pass_venue_ids))))
$$;
revoke all on function pass_covers(uuid, uuid, uuid) from public;
grant execute on function pass_covers(uuid, uuid, uuid) to service_role;

create or replace function my_pass_covers(p_event uuid) returns boolean language sql stable security definer set search_path = public as $$
  select pass_covers(auth.uid(), e.venue_id, e.tenant_id) from events e where e.id = p_event
$$;
grant execute on function my_pass_covers(uuid) to authenticated;

-- ---- organiser stats: checked-in counts people through the door (admits per entry scan), never service QRs
create or replace view organiser_event_stats as
select e.id as event_id, e.tenant_id, e.organiser_id, e.title, e.starts_at, e.status,
  sum(t.capacity) as capacity, sum(t.sold) as sold, sum(t.held) as held,
  coalesce((select sum(o.face_total) from orders o where o.event_id = e.id and o.status = 'paid'),0) as gross,
  coalesce((select sum(o.buyer_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as buyer_fees,
  coalesce((select sum(o.organiser_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as organiser_fees,
  coalesce((select sum(o.processing_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as processing_fees,
  coalesce((select sum(o.table_deposit) from orders o where o.event_id = e.id and o.status = 'paid'),0) as deposits,
  coalesce((select sum(case when k.tier_id is null then coalesce((o.meta->>'party')::int, 1) else coalesce(kt.admits, 1) end)
            from tickets k left join tiers kt on kt.id = k.tier_id left join orders o on o.id = k.order_id
            where k.event_id = e.id and k.state = 'scanned' and coalesce(kt.role, 'access') = 'access'), 0) as checked_in
from events e left join tiers t on t.event_id = e.id
group by e.id;
alter view organiser_event_stats set (security_invoker = true);

-- ---- publish rule: a listing that sells services must sell at least one access offer (or an entry-inclusive table)
create or replace function check_access_offers() returns trigger language plpgsql as $$
declare svc int; acc int;
begin
  if new.status in ('live','sold_out') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select count(*) into svc from tiers where event_id = new.id and role = 'service' and requires_access;
    if svc > 0 then
      select count(*) into acc from tiers where event_id = new.id and role = 'access';
      if acc = 0 and not exists (select 1 from tables_vip where event_id = new.id and includes_entry) then
        raise exception 'access_offer_required' using hint = 'Add an entry offer (ticket, day pass, stay, membership or an entry-inclusive table) or mark the services "no entry needed"';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists events_access_offers on events;
create trigger events_access_offers before insert or update of status on events for each row execute function check_access_offers();

-- ---- public API: offers carry their role, headcount and entry requirement; `access_required` is documented in docs/API.md
create or replace function api_events(p_key text) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'kind', e.kind, 'status', e.status, 'starts_at', e.starts_at, 'venue', v.name, 'city', v.city,
    'tiers', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'role', t.role, 'admits', t.admits, 'requires_access', t.requires_access, 'per', t.per, 'face_price', t.face_price, 'capacity', t.capacity, 'sold', t.sold, 'held', t.held)) from tiers t where t.event_id = e.id),
    'tables', (select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'seats', x.seats, 'includes_entry', x.includes_entry, 'deposit', x.deposit)) from tables_vip x where x.event_id = e.id),
    'addons', e.addon_options) order by e.starts_at), '[]')
  from events e left join venues v on v.id = e.venue_id where e.organiser_id = api_key_org(p_key) and e.status <> 'archived'
$$;
