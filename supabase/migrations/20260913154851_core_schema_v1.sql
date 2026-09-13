-- WhatsUp Ticketing — core schema v1 (multi-tenant)
create extension if not exists pgcrypto;

create type event_status as enum ('draft','live','sold_out','ended','archived');
create type order_status as enum ('pending','paid','reserved','cancelled','refunded','expired');
create type payment_method as enum ('card','omt','whish','cash_door','credit');
create type ticket_state as enum ('valid','scanned','transferred','void','reserved');
create type tenant_role as enum ('buyer','organiser','door','promoter','country_admin','super_admin');
create type payout_status as enum ('scheduled','requested','paid');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  brand jsonb not null default '{}',
  languages text[] not null default '{en,ar}',
  base_currency text not null default 'USD',
  display_currency text not null default 'LBP',
  fx_rate numeric(14,4) not null default 89500,
  buyer_fee_pct numeric(6,4) not null default 0.05,
  buyer_fee_fixed numeric(10,2) not null default 0.50,
  organiser_fee_pct numeric(6,4) not null default 0.03,
  processing_pct numeric(6,4) not null default 0.025,
  payment_methods payment_method[] not null default '{card,omt,whish,cash_door}',
  checkout_hold_minutes int not null default 10,
  cash_hold_hours_before_doors int not null default 3,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text unique,
  email text,
  lang text not null default 'en',
  currency text not null default 'USD',
  prefs jsonb not null default '{"wa_reminders":true,"wa_tickets":true,"email_copies":false}',
  referral_code text unique,
  referred_by text,
  credit numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table organisers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  name_ar text,
  verified boolean not null default false,
  payout_method text,
  payout_details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table memberships (
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role tenant_role not null default 'buyer',
  organiser_id uuid references organisers(id),
  primary key (tenant_id, user_id, role)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, name_ar text,
  city text not null, city_ar text,
  address text, geo point,
  seat_map jsonb,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  organiser_id uuid not null references organisers(id),
  venue_id uuid references venues(id),
  slug text not null,
  title text not null, title_ar text,
  description text, description_ar text,
  category text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  doors_at timestamptz,
  images text[] not null default '{}',
  status event_status not null default 'draft',
  seated boolean not null default false,
  refund_policy jsonb not null default '{"type":"until_hours_before","hours":24}',
  featured_until timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index events_tenant_start on events(tenant_id, starts_at) where status in ('live','sold_out');

create table tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null, name_ar text,
  face_price numeric(10,2) not null check (face_price >= 0),
  capacity int not null check (capacity >= 0),
  sold int not null default 0,
  held int not null default 0,
  sale_starts timestamptz, sale_ends timestamptz,
  per_order_limit int not null default 6,
  seat_rows text[],
  sort int not null default 0
);

create table tables_vip (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null, name_ar text,
  seats int not null,
  min_spend numeric(10,2) not null,
  deposit numeric(10,2) not null,
  reserved_by_order uuid
);

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  organiser_id uuid references organisers(id),
  event_id uuid references events(id),
  code text not null,
  pct_off numeric(5,2), fixed_off numeric(10,2),
  max_uses int, uses int not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  active boolean not null default true,
  unique (tenant_id, code)
);

create table promoters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  organiser_id uuid not null references organisers(id),
  user_id uuid references profiles(id),
  name text not null,
  code text not null,
  commission_pct numeric(5,2) not null default 8,
  clicks int not null default 0,
  unique (tenant_id, code)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  event_id uuid not null references events(id),
  buyer_id uuid references profiles(id),
  status order_status not null default 'pending',
  payment_method payment_method,
  payment_ref text,
  currency text not null default 'USD',
  fx_rate numeric(14,4) not null,
  face_total numeric(10,2) not null default 0,
  buyer_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  table_deposit numeric(10,2) not null default 0,
  credit_used numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  organiser_fee numeric(10,2) not null default 0,
  processing_fee numeric(10,2) not null default 0,
  fee_snapshot jsonb not null,
  promo_code text,
  promoter_code text,
  referral_code text,
  hold_expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_event on orders(event_id, status);
create index orders_buyer on orders(buyer_id, created_at desc);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  tier_id uuid references tiers(id),
  table_id uuid references tables_vip(id),
  qty int not null check (qty > 0),
  unit_face numeric(10,2) not null,
  unit_fee numeric(10,2) not null
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null references orders(id) on delete cascade,
  event_id uuid not null references events(id),
  tier_id uuid references tiers(id),
  holder_id uuid references profiles(id),
  code text unique not null,
  token text unique not null,
  seat text,
  state ticket_state not null default 'valid',
  transferred_from uuid references tickets(id),
  scanned_at timestamptz,
  created_at timestamptz not null default now()
);
create index tickets_event_state on tickets(event_id, state);

create table scans (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id),
  event_id uuid not null references events(id),
  device_id text,
  scanned_by uuid references profiles(id),
  result text not null,
  scanned_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references tiers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  qty int not null default 1,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tier_id, user_id)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organiser_id uuid not null references organisers(id),
  period_start date not null, period_end date not null,
  face_total numeric(12,2) not null default 0,
  organiser_fee numeric(12,2) not null default 0,
  processing_fee numeric(12,2) not null default 0,
  deposits numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status payout_status not null default 'scheduled',
  requested_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table promotion_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  event_id uuid not null references events(id),
  organiser_id uuid not null references organisers(id),
  package text not null,
  price numeric(10,2) not null,
  status text not null default 'review',
  created_at timestamptz not null default now()
);

create table message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid references profiles(id),
  channel text not null,
  template text not null,
  payload jsonb,
  status text not null default 'queued',
  provider_ref text,
  created_at timestamptz not null default now()
);

create or replace function fee_quote(p_tenant uuid, p_face numeric, p_qty int)
returns table (unit_fee numeric, line_fee numeric, all_in_unit numeric) language sql stable as $$
  select
    case when p_face = 0 then 0 else round(p_face * t.buyer_fee_pct + t.buyer_fee_fixed, 2) end,
    case when p_face = 0 then 0 else round((p_face * t.buyer_fee_pct + t.buyer_fee_fixed) * p_qty, 2) end,
    case when p_face = 0 then 0 else round(p_face + p_face * t.buyer_fee_pct + t.buyer_fee_fixed, 2) end
  from tenants t where t.id = p_tenant
$$;

create or replace function hold_tickets(p_tier uuid, p_qty int)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update tiers set held = held + p_qty
   where id = p_tier and sold + held + p_qty <= capacity and p_qty <= per_order_limit
   returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function release_hold(p_tier uuid, p_qty int) returns void language sql as $$
  update tiers set held = greatest(held - p_qty, 0) where id = p_tier
$$;

create or replace function confirm_sale(p_tier uuid, p_qty int) returns void language sql as $$
  update tiers set held = greatest(held - p_qty, 0), sold = sold + p_qty where id = p_tier
$$;

create or replace function gen_ticket_code() returns text language sql as $$
  select 'WU-' || upper(substr(encode(gen_random_bytes(3),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(2),'hex'),1,3))
$$;

create or replace function gen_referral_code(p_name text) returns text language sql as $$
  select upper(regexp_replace(coalesce(split_part(p_name,' ',1),'WU'),'[^A-Za-z]','','g')) || '-' || upper(substr(encode(gen_random_bytes(2),'hex'),1,3))
$$;

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table organisers enable row level security;
alter table venues enable row level security;
alter table events enable row level security;
alter table tiers enable row level security;
alter table tables_vip enable row level security;
alter table promo_codes enable row level security;
alter table promoters enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table tickets enable row level security;
alter table scans enable row level security;
alter table waitlist enable row level security;
alter table payouts enable row level security;
alter table promotion_orders enable row level security;
alter table message_log enable row level security;

create policy tenants_read on tenants for select using (true);
create policy venues_read on venues for select using (true);
create policy events_public on events for select using (status in ('live','sold_out','ended'));
create policy tiers_public on tiers for select using (exists (select 1 from events e where e.id = event_id and e.status in ('live','sold_out','ended')));
create policy tables_public on tables_vip for select using (exists (select 1 from events e where e.id = event_id and e.status in ('live','sold_out')));
create policy organisers_public on organisers for select using (true);

create policy profiles_self on profiles for select using (auth.uid() = id);
create policy profiles_self_upd on profiles for update using (auth.uid() = id);
create policy memberships_self on memberships for select using (auth.uid() = user_id);

create policy orders_own on orders for select using (auth.uid() = buyer_id);
create policy order_lines_own on order_lines for select using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy tickets_own on tickets for select using (auth.uid() = holder_id);
create policy waitlist_own on waitlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function is_org_member(p_org uuid, p_roles tenant_role[]) returns boolean language sql stable security definer as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.organiser_id = p_org and m.role = any(p_roles))
$$;
create policy events_org_all on events for all using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}')) with check (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create policy tiers_org_all on tiers for all using (exists (select 1 from events e where e.id = event_id and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')));
create policy tables_org_all on tables_vip for all using (exists (select 1 from events e where e.id = event_id and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')));
create policy orders_org_read on orders for select using (exists (select 1 from events e where e.id = event_id and is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}')));
create policy tickets_org_read on tickets for select using (exists (select 1 from events e where e.id = event_id and is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}')));
create policy scans_door on scans for all using (exists (select 1 from events e where e.id = event_id and is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}'))) with check (true);
create policy promo_org on promo_codes for all using (organiser_id is null or is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create policy promoters_org on promoters for all using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create policy payouts_org on payouts for select using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create policy promo_orders_org on promotion_orders for all using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
