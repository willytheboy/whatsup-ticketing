-- v3 (14 Sep 2026): the rest of the design brief and functional spec after v0.5.0.
-- Applied as two migrations: v3a (enum values, pg_net) then this file.

-- ---------------------------------------------------------------- columns
alter table tickets add column if not exists recipient jsonb;               -- {name, phone} on gifts and transfers
alter table tickets add column if not exists claim_code text unique;         -- the recipient claims the new ticket with this
alter table tickets add column if not exists resale_listed_at timestamptz;
alter table tickets add column if not exists sold_back_at timestamptz;
alter table events add column if not exists credit text;                     -- fan photo credit: "Photo by @marc.k"
alter table organisers add column if not exists whatsapp text;               -- group bookings and the room assistant
alter table organisers add column if not exists credit_month text;           -- 'YYYY-MM' when the Pro placement credit was used
alter table tables_vip add column if not exists packages jsonb not null default '[]';  -- [{id,name,name_ar,price,desc}]
alter table venues add column if not exists address_ar text;
alter table orders add column if not exists addons jsonb not null default '[]';        -- [{kind:'refund_protection',amount}]
alter table orders add column if not exists refund_status text check (refund_status in ('requested','refunded','declined'));
alter table orders add column if not exists refund_requested_at timestamptz;
alter table promotion_orders add column if not exists delivered_at timestamptz;
alter table promotion_orders add column if not exists notes text;
alter table streams add column if not exists sub_price numeric(12,2) not null default 5;
alter table promoters add column if not exists tier text not null default 'bronze' check (tier in ('bronze','silver','gold'));
alter table tenants add column if not exists live boolean not null default true;      -- false = coming soon on the city sheet
alter table tenants add column if not exists country text;                            -- "Lebanon"
alter table tenants add column if not exists country_ar text;
update tenants set country = coalesce(country, name), live = true where slug = 'lb';

-- ---------------------------------------------------------------- saved listings (heart)
create table if not exists saved_listings (
  user_id uuid references profiles(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table saved_listings enable row level security;
drop policy if exists saved_listings_own on saved_listings;
create policy saved_listings_own on saved_listings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- squads (brief §5.5): everyone pays their own share
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  members jsonb not null default '[]',   -- [{user_id, name, paid, order_id}]
  items jsonb not null default '[]',     -- [{event_id, slug, title, label, share}]
  created_at timestamptz not null default now()
);
alter table squads enable row level security;
drop policy if exists squads_read on squads;
create policy squads_read on squads for select using (true);
drop policy if exists squads_owner on squads;
create policy squads_owner on squads for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create or replace function join_squad(p_id uuid, p_name text) returns jsonb language plpgsql security definer as $$
declare s squads%rowtype; m jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into s from squads where id = p_id; if not found then raise exception 'squad'; end if;
  if exists (select 1 from jsonb_array_elements(s.members) x where x->>'user_id' = auth.uid()::text) then return s.members; end if;
  m := s.members || jsonb_build_array(jsonb_build_object('user_id', auth.uid(), 'name', coalesce(nullif(p_name,''), 'Friend'), 'paid', false));
  update squads set members = m where id = p_id;
  return m;
end $$;
create or replace function squad_pay_share(p_id uuid, p_order uuid default null) returns jsonb language plpgsql security definer as $$
declare s squads%rowtype; m jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into s from squads where id = p_id; if not found then raise exception 'squad'; end if;
  select coalesce(jsonb_agg(case when x->>'user_id' = auth.uid()::text then x || jsonb_build_object('paid', true, 'order_id', p_order) else x end), '[]'::jsonb) into m from jsonb_array_elements(s.members) x;
  update squads set members = m where id = p_id;
  return m;
end $$;
grant execute on function join_squad(uuid, text), squad_pay_share(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- moderation: organisers can delete messages in their listing rooms
drop policy if exists chat_moderate_org on chat_messages;
create policy chat_moderate_org on chat_messages for delete using (
  exists (select 1 from chat_rooms r join events e on e.id = r.ref_id where r.id = room_id and r.scope = 'event' and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')));

-- ---------------------------------------------------------------- cover photos (public bucket, organisers upload under <event_id>/)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 8388608, '{image/jpeg,image/png,image/webp}') on conflict (id) do nothing;
drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects for select using (bucket_id = 'covers');
drop policy if exists covers_upload on storage.objects;
create policy covers_upload on storage.objects for insert to authenticated with check (bucket_id = 'covers');
drop policy if exists covers_update on storage.objects;
create policy covers_update on storage.objects for update to authenticated using (bucket_id = 'covers');

-- ---------------------------------------------------------------- streams: organisers go live from their dashboard; subscriptions and tips
create or replace function org_can_manage_stream(p_stream uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from streams s where s.id = p_stream and (
    is_partner_member(s.partner_id) or is_tenant_admin(s.tenant_id)
    or exists (select 1 from events e where e.venue_id = s.venue_id and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}'))))
$$;
create or replace function org_set_stream_status(p_stream uuid, p_status stream_status) returns boolean language plpgsql security definer as $$
begin
  if not org_can_manage_stream(p_stream) then raise exception 'forbidden'; end if;
  update streams set status = p_status, started_at = case when p_status = 'live' then now() else started_at end, ended_at = case when p_status = 'ended' then now() else null end where id = p_stream;
  return true;
end $$;
create or replace function org_set_stream_url(p_stream uuid, p_source text, p_url text) returns boolean language plpgsql security definer as $$
begin
  if not org_can_manage_stream(p_stream) then raise exception 'forbidden'; end if;
  update streams set source = p_source, playback_url = p_url where id = p_stream;
  return true;
end $$;
create or replace function buy_stream_subscription(p_stream uuid, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare s streams%rowtype; sc uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into s from streams where id = p_stream; if not found then raise exception 'stream'; end if;
  insert into service_charges (tenant_id, provider_partner_id, buyer_id, kind, ref_type, ref_id, description, amount, provider_pct, payment_method, status, paid_at)
  values (s.tenant_id, s.partner_id, auth.uid(), 'stream_subscription', 'stream', s.id, 'Monthly listener · ' || s.title, s.sub_price, 70, p_method, 'paid', now()) returning id into sc;
  insert into stream_passes (stream_id, user_id, service_charge_id, expires_at) values (s.id, auth.uid(), sc, now() + interval '30 days')
  on conflict (stream_id, user_id) do update set service_charge_id = excluded.service_charge_id, expires_at = greatest(coalesce(stream_passes.expires_at, now()), now()) + interval '30 days';
  return sc;
end $$;
create or replace function tip_stream(p_stream uuid, p_amount numeric, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare s streams%rowtype; sc uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_amount < 1 or p_amount > 500 then raise exception 'amount'; end if;
  select * into s from streams where id = p_stream; if not found then raise exception 'stream'; end if;
  insert into service_charges (tenant_id, provider_partner_id, buyer_id, kind, ref_type, ref_id, description, amount, provider_pct, payment_method, status, paid_at)
  values (s.tenant_id, s.partner_id, auth.uid(), 'other', 'stream', s.id, 'Tip · ' || s.title, p_amount, 90, p_method, 'paid', now()) returning id into sc;
  return sc;
end $$;
grant execute on function org_can_manage_stream(uuid), org_set_stream_status(uuid, stream_status), org_set_stream_url(uuid, text, text), buy_stream_subscription(uuid, payment_method), tip_stream(uuid, numeric, payment_method) to authenticated;

-- ---------------------------------------------------------------- Pro placement credit ($20 a month) inside buy_promotion
create or replace function buy_promotion(p_event uuid, p_package text, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare e events%rowtype; o organisers%rowtype; pid uuid; price numeric; days int; credit numeric := 0; ym text := to_char(now(), 'YYYY-MM');
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into e from events where id = p_event; if not found then raise exception 'event'; end if;
  if not is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}') then raise exception 'forbidden'; end if;
  select * into o from organisers where id = e.organiser_id;
  price := case p_package when 'boost' then 40 when 'story' then 120 when 'takeover' then 300 end;
  days := case p_package when 'takeover' then 14 else 7 end;
  if price is null then raise exception 'package'; end if;
  if o.plan in ('pro','venue') and (o.plan_until is null or o.plan_until > now()) and coalesce(o.credit_month, '') <> ym then
    credit := least(20, price); update organisers set credit_month = ym where id = o.id;
  end if;
  insert into promotion_orders (tenant_id, event_id, organiser_id, package, price, status, payment_method, notes)
  values (e.tenant_id, e.id, e.organiser_id, p_package, price - credit, 'paid', p_method, case when credit > 0 then 'Pro placement credit −$' || credit else null end) returning id into pid;
  update events set featured_until = greatest(coalesce(featured_until, now()), now()) + make_interval(days => days) where id = e.id;
  return pid;
end $$;

-- ---------------------------------------------------------------- promoter tiers from sales (bronze < 10, silver < 50, gold)
create or replace function promoter_tier_refresh() returns void language sql security definer as $$
  update promoters p set tier = case when s.sales >= 50 then 'gold' when s.sales >= 10 then 'silver' else 'bronze' end
  from (select promoter_code as code, count(*) as sales from orders where promoter_code is not null and status = 'paid' group by promoter_code) s where s.code = p.code
$$;

-- ---------------------------------------------------------------- insights for organisers (Pro / Venue)
create or replace function org_insights(p_org uuid) returns jsonb language plpgsql security definer as $$
declare out jsonb;
begin
  if not is_org_member(p_org, '{organiser,country_admin,super_admin}') then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'buyers', (select count(distinct o.buyer_id) from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid'),
    'repeat_rate', (select coalesce(round(100.0 * count(*) filter (where n > 1) / nullif(count(*),0)), 0) from (select o.buyer_id, count(*) n from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid' group by o.buyer_id) b),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'n', n) order by n desc), '[]') from (select coalesce(v.city,'—') city, count(*) n from orders o join events e on e.id = o.event_id left join venues v on v.id = e.venue_id where e.organiser_id = p_org and o.status = 'paid' group by 1 limit 8) c),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'n', n)), '[]') from (select o.payment_method, count(*) n from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid' group by 1) m),
    'price_bands', (select coalesce(jsonb_agg(jsonb_build_object('band', band, 'n', n) order by band), '[]') from (select case when l.unit_face = 0 then 'free' when l.unit_face < 20 then '<$20' when l.unit_face < 50 then '$20–50' else '$50+' end band, sum(l.qty) n from order_lines l join orders o on o.id = l.order_id join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid' and l.tier_id is not null group by 1) p),
    'best_days', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'n', n) order by n desc), '[]') from (select to_char(o.paid_at at time zone 'Asia/Beirut', 'Dy') dow, count(*) n from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid' group by 1) d),
    'lead_days', (select coalesce(round(avg(extract(epoch from (e.starts_at - o.paid_at)) / 86400)), 0) from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.status = 'paid'),
    'no_show', (select coalesce(round(100.0 * count(*) filter (where status = 'expired') / nullif(count(*),0)), 0) from orders o join events e on e.id = o.event_id where e.organiser_id = p_org and o.payment_method in ('cash_door','omt')),
    'waitlist', (select count(*) from waitlist w join tiers t on t.id = w.tier_id join events e on e.id = t.event_id where e.organiser_id = p_org),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', s.event_id, 'title', s.title, 'starts_at', s.starts_at, 'sold', s.sold, 'capacity', s.capacity, 'gross', s.gross, 'checked_in', s.checked_in) order by s.starts_at desc), '[]') from organiser_event_stats s where s.organiser_id = p_org)
  ) into out;
  return out;
end $$;
create or replace function org_buyers(p_org uuid) returns table (name text, phone text, email text, orders int, spend numeric, last_order timestamptz, city text) language sql security definer as $$
  select p.name, p.phone, p.email, count(*)::int, sum(o.total), max(o.paid_at),
    (select v.city from orders o2 join events e2 on e2.id = o2.event_id join venues v on v.id = e2.venue_id where o2.buyer_id = p.id and e2.organiser_id = p_org and o2.status = 'paid' order by o2.paid_at desc nulls last limit 1)
  from orders o join events e on e.id = o.event_id join profiles p on p.id = o.buyer_id
  where e.organiser_id = p_org and o.status = 'paid' and is_org_member(p_org, '{organiser,country_admin,super_admin}')
    and exists (select 1 from organisers og where og.id = p_org and og.plan in ('pro','venue'))
  group by p.id, p.name, p.phone, p.email order by max(o.paid_at) desc
$$;
grant execute on function org_insights(uuid), org_buyers(uuid), promoter_tier_refresh() to authenticated;

-- ---------------------------------------------------------------- public API keys (per organiser) and webhooks
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organiser_id uuid not null references organisers(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table api_keys enable row level security;
drop policy if exists api_keys_org on api_keys;
create policy api_keys_org on api_keys for all using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}')) with check (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create or replace function create_api_key(p_org uuid, p_name text) returns text language plpgsql security definer as $$
declare raw text; o organisers%rowtype;
begin
  if not is_org_member(p_org, '{organiser,country_admin,super_admin}') then raise exception 'forbidden'; end if;
  select * into o from organisers where id = p_org;
  raw := 'wu_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into api_keys (tenant_id, organiser_id, name, prefix, key_hash) values (o.tenant_id, p_org, p_name, left(raw, 10), encode(extensions.digest(raw, 'sha256'), 'hex'));
  return raw;  -- shown once
end $$;
create or replace function api_key_org(p_key text) returns uuid language plpgsql security definer as $$
declare oid uuid;
begin
  select organiser_id into oid from api_keys where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  if oid is not null then update api_keys set last_used_at = now() where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex'); end if;
  return oid;
end $$;
create or replace function api_orders(p_key text, p_since timestamptz default now() - interval '30 days') returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'event_id', o.event_id, 'event', e.title, 'status', o.status, 'method', o.payment_method, 'face_total', o.face_total, 'buyer_fee', o.buyer_fee, 'total', o.total, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'lines', (select jsonb_agg(jsonb_build_object('tier_id', l.tier_id, 'qty', l.qty, 'unit_face', l.unit_face)) from order_lines l where l.order_id = o.id),
    'tickets', (select jsonb_agg(jsonb_build_object('code', t.code, 'state', t.state, 'scanned_at', t.scanned_at)) from tickets t where t.order_id = o.id)) order by o.created_at desc), '[]')
  from orders o join events e on e.id = o.event_id where e.organiser_id = api_key_org(p_key) and o.created_at >= p_since
$$;
create or replace function api_events(p_key text) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'kind', e.kind, 'status', e.status, 'starts_at', e.starts_at, 'venue', v.name, 'city', v.city,
    'tiers', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'face_price', t.face_price, 'capacity', t.capacity, 'sold', t.sold, 'held', t.held)) from tiers t where t.event_id = e.id)) order by e.starts_at), '[]')
  from events e left join venues v on v.id = e.venue_id where e.organiser_id = api_key_org(p_key) and e.status <> 'archived'
$$;
grant execute on function create_api_key(uuid, text) to authenticated;
grant execute on function api_key_org(text), api_orders(text, timestamptz), api_events(text) to anon, authenticated;

create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references organisers(id) on delete cascade,
  url text not null,
  secret text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  events text[] not null default '{order.paid,ticket.scanned}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table webhook_endpoints enable row level security;
drop policy if exists webhooks_org on webhook_endpoints;
create policy webhooks_org on webhook_endpoints for all using (is_org_member(organiser_id, '{organiser,country_admin,super_admin}')) with check (is_org_member(organiser_id, '{organiser,country_admin,super_admin}'));
create table if not exists webhook_deliveries (
  id bigserial primary key, endpoint_id uuid references webhook_endpoints(id) on delete cascade, event text, payload jsonb, request_id bigint, created_at timestamptz not null default now()
);
alter table webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_org on webhook_deliveries;
create policy webhook_deliveries_org on webhook_deliveries for select using (exists (select 1 from webhook_endpoints w where w.id = endpoint_id and is_org_member(w.organiser_id, '{organiser,country_admin,super_admin}')));
create or replace function dispatch_webhook(p_org uuid, p_event text, p_payload jsonb) returns void language plpgsql security definer as $$
declare w record; body text; sig text; rid bigint;
begin
  for w in select * from webhook_endpoints where organiser_id = p_org and active and p_event = any(events) loop
    body := jsonb_build_object('event', p_event, 'data', p_payload, 'sent_at', now())::text;
    sig := encode(extensions.hmac(body, w.secret, 'sha256'), 'hex');
    select net.http_post(url := w.url, body := body::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'X-WhatsUp-Signature', sig, 'X-WhatsUp-Event', p_event)) into rid;
    insert into webhook_deliveries (endpoint_id, event, payload, request_id) values (w.id, p_event, body::jsonb, rid);
  end loop;
end $$;
create or replace function orders_webhook_trigger() returns trigger language plpgsql security definer as $$
declare org uuid;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select organiser_id into org from events where id = new.event_id;
    perform dispatch_webhook(org, 'order.paid', jsonb_build_object('order_id', new.id, 'event_id', new.event_id, 'total', new.total, 'face_total', new.face_total, 'method', new.payment_method, 'paid_at', new.paid_at));
  end if;
  return new;
end $$;
drop trigger if exists orders_webhook on orders;
create trigger orders_webhook after insert or update of status on orders for each row execute function orders_webhook_trigger();
create or replace function tickets_webhook_trigger() returns trigger language plpgsql security definer as $$
declare org uuid;
begin
  if new.state = 'scanned' and old.state is distinct from 'scanned' then
    select organiser_id into org from events where id = new.event_id;
    perform dispatch_webhook(org, 'ticket.scanned', jsonb_build_object('ticket_id', new.id, 'code', new.code, 'event_id', new.event_id, 'scanned_at', new.scanned_at));
  end if;
  return new;
end $$;
drop trigger if exists tickets_webhook on tickets;
create trigger tickets_webhook after update of state on tickets for each row execute function tickets_webhook_trigger();

-- ---------------------------------------------------------------- client error reporting
create table if not exists client_errors (
  id bigserial primary key, tenant_id uuid, user_id uuid, path text, message text, stack text, ua text, created_at timestamptz not null default now()
);
alter table client_errors enable row level security;
drop policy if exists client_errors_insert on client_errors;
create policy client_errors_insert on client_errors for insert to anon, authenticated with check (true);
drop policy if exists client_errors_admin on client_errors;
create policy client_errors_admin on client_errors for select using (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role in ('country_admin','super_admin')));

-- ---------------------------------------------------------------- GDPR: export is a function, delete removes the auth user
create or replace function my_export() returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'referred_by' from profiles p where p.id = auth.uid()),
    'orders', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from orders o where o.buyer_id = auth.uid()),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'state', t.state, 'event_id', t.event_id, 'created_at', t.created_at)), '[]') from tickets t where t.holder_id = auth.uid()),
    'saved', (select coalesce(jsonb_agg(event_id), '[]') from saved_listings where user_id = auth.uid()),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('room', room_id, 'body', body, 'at', created_at)), '[]') from chat_messages where user_id = auth.uid()),
    'exported_at', now())
$$;
create or replace function delete_my_account() returns boolean language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  delete from chat_messages where user_id = auth.uid();
  delete from saved_listings where user_id = auth.uid();
  delete from saved_deals where user_id = auth.uid();
  delete from waitlist where user_id = auth.uid();
  update profiles set name = 'Deleted user', phone = null, email = null, referral_code = null where id = auth.uid();
  update tickets set holder_id = null, recipient = null where holder_id = auth.uid() and state in ('scanned','void','sold_back','transferred');
  delete from auth.users where id = auth.uid();
  return true;
end $$;
grant execute on function my_export(), delete_my_account() to authenticated;

-- ---------------------------------------------------------------- second tenant from the super-admin
create or replace function create_tenant(p_slug text, p_name text, p_country text, p_country_ar text, p_currency text, p_display_currency text, p_fx numeric, p_admin_email text, p_live boolean default false) returns uuid language plpgsql security definer as $$
declare tid uuid; uid uuid;
begin
  if not exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'super_admin') then raise exception 'forbidden'; end if;
  insert into tenants (slug, name, country, country_ar, base_currency, display_currency, fx_rate, live, brand) values (lower(p_slug), p_name, p_country, p_country_ar, p_currency, p_display_currency, p_fx, p_live, jsonb_build_object('word', p_country)) returning id into tid;
  select id into uid from profiles where email = p_admin_email;
  if uid is not null then insert into memberships (tenant_id, user_id, role) values (tid, uid, 'country_admin') on conflict do nothing; end if;
  perform ensure_partner(tid, 'platform', 'WhatsUp ' || p_country);
  return tid;
end $$;
grant execute on function create_tenant(text, text, text, text, text, text, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------- messaging queue: reminders and the weekly digest (the notify function drains message_log)
create table if not exists app_settings (key text primary key, value text not null);
alter table app_settings enable row level security;
drop policy if exists app_settings_admin on app_settings;
create policy app_settings_admin on app_settings for all using (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'super_admin')) with check (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'super_admin'));
create or replace function queue_reminders() returns int language plpgsql security definer as $$
declare n int := 0;
begin
  -- 24h and 2h before doors, once per ticket per template
  insert into message_log (tenant_id, user_id, channel, template, payload)
  select t.tenant_id, t.holder_id, 'whatsapp', tpl.name, jsonb_build_object('ticket', t.code, 'event', e.title, 'starts_at', e.starts_at, 'venue', v.name)
  from tickets t join events e on e.id = t.event_id left join venues v on v.id = e.venue_id
  cross join (values ('reminder_24h', interval '24 hours'), ('reminder_2h', interval '2 hours')) as tpl(name, before)
  where t.state = 'valid' and t.holder_id is not null and e.kind = 'event'
    and coalesce(e.doors_at, e.starts_at) between now() + tpl.before and now() + tpl.before + interval '15 minutes'
    and not exists (select 1 from message_log m where m.user_id = t.holder_id and m.template = tpl.name and m.payload->>'ticket' = t.code);
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function queue_weekly_digest() returns int language plpgsql security definer as $$
declare n int := 0;
begin
  insert into message_log (tenant_id, user_id, channel, template, payload)
  select distinct on (p.id) m.tenant_id, p.id, 'whatsapp', 'weekly_digest', jsonb_build_object('week', to_char(now(), 'IYYY-IW'),
    'picks', (select jsonb_agg(jsonb_build_object('title', e.title, 'slug', e.slug, 'starts_at', e.starts_at)) from (select e.* from events e where e.tenant_id = m.tenant_id and e.status = 'live' and e.starts_at between now() and now() + interval '7 days' order by e.featured_until desc nulls last, e.starts_at limit 5) e))
  from profiles p join memberships m on m.user_id = p.id
  where coalesce((p.prefs->>'wa_reminders')::boolean, true) and p.phone is not null
    and not exists (select 1 from message_log x where x.user_id = p.id and x.template = 'weekly_digest' and x.payload->>'week' = to_char(now(), 'IYYY-IW'));
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function drain_messages() returns void language plpgsql security definer as $$
declare url text; secret text;
begin
  select value into url from app_settings where key = 'notify_url';
  select value into secret from app_settings where key = 'notify_secret';
  if url is null then return; end if;
  perform net.http_post(url := url, body := '{"drain":true}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Notify-Secret', coalesce(secret, '')));
end $$;
select cron.unschedule(jobid) from cron.job where jobname in ('queue-reminders','weekly-digest','drain-messages','promoter-tiers');
select cron.schedule('queue-reminders', '*/15 * * * *', $$select queue_reminders()$$);
select cron.schedule('weekly-digest', '0 8 * * 4', $$select queue_weekly_digest()$$);
select cron.schedule('drain-messages', '*/5 * * * *', $$select drain_messages()$$);
select cron.schedule('promoter-tiers', '0 5 * * *', $$select promoter_tier_refresh()$$);

-- ---------------------------------------------------------------- waitlist notifications when a resale is listed or a tier is reopened
create or replace function notify_waitlist(p_tier uuid, p_reason text) returns int language plpgsql security definer as $$
declare n int := 0;
begin
  insert into message_log (tenant_id, user_id, channel, template, payload)
  select e.tenant_id, w.user_id, 'whatsapp', 'waitlist', jsonb_build_object('event', e.title, 'slug', e.slug, 'tier', t.name, 'reason', p_reason)
  from waitlist w join tiers t on t.id = w.tier_id join events e on e.id = t.event_id where w.tier_id = p_tier and w.notified_at is null;
  get diagnostics n = row_count;
  update waitlist set notified_at = now() where tier_id = p_tier and notified_at is null;
  return n;
end $$;

-- ---------------------------------------------------------------- back-office views for the new queues
create or replace view v_admin_promotions with (security_invoker = true) as
  select p.id, p.tenant_id, p.package, p.price, p.status, p.payment_method, p.created_at, p.delivered_at, p.notes, e.title as event_title, e.slug as event_slug, e.featured_until, o.name as organiser
  from promotion_orders p join events e on e.id = p.event_id join organisers o on o.id = p.organiser_id;
grant select on v_admin_promotions to authenticated;
create or replace view v_admin_moments with (security_invoker = true) as
  select m.id, m.tenant_id, m.path, m.caption, m.credit, m.status, m.created_at, p.name as user_name
  from moments m left join profiles p on p.id = m.user_id;
grant select on v_admin_moments to authenticated;
create or replace view v_scan_alerts with (security_invoker = true) as
  select s.event_id, e.title, count(*) filter (where s.result = 'duplicate') as duplicates, count(*) filter (where s.result = 'invalid') as invalid, count(*) as scans, max(s.scanned_at) as last_scan
  from scans s join events e on e.id = s.event_id where s.scanned_at > now() - interval '48 hours' group by s.event_id, e.title;
grant select on v_scan_alerts to authenticated;
