-- v0.7.0 — tenant configuration, add-ons, fraud signals, flash codes
-- Additive. Everything the client app shows or hides now comes from tenants.config (edited at /admin/settings);
-- a fresh install with an empty config behaves exactly like v0.6.

-- ---- tenant config: theme, tabs, features, brand -------------------------------------------------
alter table tenants add column if not exists config jsonb not null default '{}'::jsonb;
comment on column tenants.config is 'Client configuration: {theme, tabs:{home,search,ask,radio,vibe,wallet}, features:{...}} — see app/src/lib/features.ts for the keys and defaults';
comment on column tenants.brand is 'White-label brand: {name, name_ar, wordmark, wordmark_ar, ig, support_wa, short_host}';

-- the app reads the config anonymously, before sign-in (tenants_read is already public)

-- ---- add-ons on listings (fast lane, parking, locker …) -------------------------------------------
alter table events add column if not exists addon_options jsonb not null default '[]'::jsonb;
comment on column events.addon_options is '[{id, name, name_ar, price, per:"order"|"ticket", max?}] sold on top of the offer at checkout';
-- orders.addons (v3) already holds [{kind, amount}]; listing add-ons land there as {kind:'addon', id, name, qty, amount}

-- ---- flash promo codes: short-lived codes the pricing assistant creates with one tap --------------
alter table promo_codes add column if not exists source text not null default 'manual';
comment on column promo_codes.source is 'manual | flash (created from the pace assistant) | api';

-- ---- door lockouts: three duplicate scans of one ticket in ten minutes freeze it for the door -----
create table if not exists ticket_locks (
  ticket_id uuid primary key references tickets(id) on delete cascade,
  reason text not null,
  locked_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid
);
alter table ticket_locks enable row level security;
drop policy if exists ticket_locks_admin on ticket_locks;
create policy ticket_locks_admin on ticket_locks for all using (
  exists (select 1 from tickets t join events e on e.id = t.event_id where t.id = ticket_locks.ticket_id and (is_tenant_admin(e.tenant_id) or is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}')))
);

-- the scan function calls this after recording a duplicate; the lock is lifted from /org/door or /admin/fraud
create or replace function lock_ticket_if_abused(p_ticket uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from scans where ticket_id = p_ticket and result = 'duplicate' and scanned_at > now() - interval '10 minutes';
  if n >= 3 then
    insert into ticket_locks (ticket_id, reason) values (p_ticket, 'duplicate_x3') on conflict (ticket_id) do update set locked_at = now(), released_at = null, reason = 'duplicate_x3';
    return true;
  end if;
  return false;
end $$;
revoke all on function lock_ticket_if_abused(uuid) from public;

-- ---- fraud signals for the back office --------------------------------------------------------
drop view if exists v_fraud_signals;
create view v_fraud_signals with (security_invoker = true) as
with dup as (
  select t.event_id, s.ticket_id, count(*) as dupes, max(s.scanned_at) as last_at
  from scans s join tickets t on t.id = s.ticket_id
  where s.result = 'duplicate' and s.scanned_at > now() - interval '30 days'
  group by t.event_id, s.ticket_id having count(*) >= 2
), bursts as (
  select o.buyer_id, o.event_id, count(*) as orders, sum(o.total) as total, max(o.created_at) as last_at
  from orders o where o.created_at > now() - interval '24 hours' and o.status in ('paid','reserved','pending')
  group by o.buyer_id, o.event_id having count(*) >= 4
), refunds as (
  select o.tenant_id, o.buyer_id, count(*) as refunds, max(o.created_at) as last_at
  from orders o where o.status = 'refunded' and o.created_at > now() - interval '90 days'
  group by o.tenant_id, o.buyer_id having count(*) >= 3
), transfers as (
  -- a ticket that changed hands three or more times (each transfer voids the old ticket and issues a new one linked by transferred_from)
  with recursive chain as (
    select id, transferred_from, event_id, created_at, 1 as hops from tickets where transferred_from is not null and created_at > now() - interval '30 days'
    union all
    select c.id, t.transferred_from, c.event_id, c.created_at, c.hops + 1 from chain c join tickets t on t.id = c.transferred_from where t.transferred_from is not null and c.hops < 10
  )
  select id as ticket_id, event_id, max(hops) as hops, max(created_at) as last_at from chain group by id, event_id having max(hops) >= 3
)
select e.tenant_id, 'duplicate_scans' as kind, e.id as event_id, e.title as event, d.ticket_id, null::uuid as buyer_id, d.dupes as n, null::numeric as amount, d.last_at,
       (select l.locked_at is not null and l.released_at is null from ticket_locks l where l.ticket_id = d.ticket_id) as locked
from dup d join events e on e.id = d.event_id
union all
select e.tenant_id, 'order_burst', e.id, e.title, null, b.buyer_id, b.orders, b.total, b.last_at, false
from bursts b join events e on e.id = b.event_id
union all
select r.tenant_id, 'serial_refunds', null, null, null, r.buyer_id, r.refunds, null, r.last_at, false
from refunds r
union all
select e.tenant_id, 'transfer_chain', e.id, e.title, x.ticket_id, null, x.hops, null, x.last_at,
       (select l.locked_at is not null and l.released_at is null from ticket_locks l where l.ticket_id = x.ticket_id)
from transfers x join events e on e.id = x.event_id;
-- the view runs as the caller: tenant admins see it through the policies on scans/orders/tickets

-- ---- pace per tier for the pricing assistant (organisers see their own listings only) ----------
create or replace function tier_pace(p_event uuid)
returns table (tier_id uuid, name text, face_price numeric, capacity int, sold int, held int, sold_7d bigint, sold_1d bigint, starts_at timestamptz, listed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.face_price, t.capacity, t.sold, t.held,
         (select coalesce(sum(ol.qty),0) from order_lines ol join orders o on o.id = ol.order_id where ol.tier_id = t.id and o.status in ('paid','reserved') and o.created_at > now() - interval '7 days'),
         (select coalesce(sum(ol.qty),0) from order_lines ol join orders o on o.id = ol.order_id where ol.tier_id = t.id and o.status in ('paid','reserved') and o.created_at > now() - interval '1 day'),
         e.starts_at, e.created_at
  from tiers t join events e on e.id = t.event_id
  where e.id = p_event and (is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}') or is_tenant_admin(e.tenant_id))
  order by t.sort, t.face_price;
$$;
grant execute on function tier_pace(uuid) to authenticated;

-- ---- flash code in one tap: pct off for N hours on one listing, created by the organiser --------
create or replace function create_flash_code(p_event uuid, p_pct int, p_hours int default 24, p_max_uses int default 50)
returns text language plpgsql security definer set search_path = public as $$
declare e record; c text;
begin
  select id, tenant_id, organiser_id into e from events where id = p_event;
  if e.id is null or not (is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}') or is_tenant_admin(e.tenant_id)) then raise exception 'not allowed'; end if;
  if p_pct < 5 or p_pct > 50 then raise exception 'pct must be 5..50'; end if;
  c := 'FLASH' || p_pct || upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 3));
  insert into promo_codes (tenant_id, organiser_id, event_id, code, pct_off, fixed_off, max_uses, uses, starts_at, ends_at, active, source)
  values (e.tenant_id, e.organiser_id, e.id, c, p_pct, 0, p_max_uses, 0, now(), now() + make_interval(hours => greatest(1, least(p_hours, 168))), true, 'flash');
  return c;
end $$;
grant execute on function create_flash_code(uuid, int, int, int) to authenticated;

-- ---- release a door lock ---------------------------------------------------------------------
create or replace function release_ticket_lock(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tickets t join events e on e.id = t.event_id where t.id = p_ticket and (is_tenant_admin(e.tenant_id) or is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}'))) then raise exception 'not allowed'; end if;
  update ticket_locks set released_at = now(), released_by = auth.uid() where ticket_id = p_ticket;
end $$;
grant execute on function release_ticket_lock(uuid) to authenticated;
