-- Listings v2 (design brief v1.0, 14 Sep 2026): one Listing sells Offers of seven types; organiser plans;
-- Promote packages; event rooms; deals; fan moments. Additive — nothing already published changes shape.

-- ---- offers: tiers carry a kind (ticket | daypass | item | stay | pass); tables stay in tables_vip; deals live on the event
alter table tiers add column if not exists kind text not null default 'ticket' check (kind in ('ticket','daypass','item','stay','pass'));
alter table tiers add column if not exists member_free boolean not null default false;   -- covered by a valid pass
alter table tiers add column if not exists plan_months int;                              -- pass plans: 1 monthly, 4 season, 12 annual
alter table tiers add column if not exists note text;                                     -- "Pick up at the kiosk", "Fri–Sun"
alter table events add column if not exists kind text not null default 'event' check (kind in ('event','venue','stay','pass'));
alter table events add column if not exists cover_url text;
alter table events add column if not exists deals jsonb not null default '[]';           -- [{id,name,name_ar,member_only}]
alter table events add column if not exists pinned text;                                  -- live info line for the room
alter table events add column if not exists pinned_ar text;
alter table tickets add column if not exists valid_until timestamptz;                     -- passes: repeat scans until this
alter table orders add column if not exists meta jsonb not null default '{}';             -- table party/time, gift, nights
alter table venues add column if not exists lat double precision, add column if not exists lng double precision;
create index if not exists events_featured on events(tenant_id, featured_until) where featured_until is not null;
create index if not exists events_kind on events(tenant_id, kind, status);

-- ---- organiser plans (Free / Pro / Venue): the upgrade ladder
alter table organisers add column if not exists plan text not null default 'free' check (plan in ('free','pro','venue'));
alter table organisers add column if not exists plan_until timestamptz;
alter table service_charges drop constraint if exists service_charges_kind_check;
alter table service_charges add constraint service_charges_kind_check check (kind in ('stream_pass','stream_subscription','chat_premium','venue_stream_plan','organiser_plan','other'));

create or replace function upgrade_plan(p_organiser uuid, p_plan text, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare o organisers%rowtype; sc uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into o from organisers where id = p_organiser;
  if not found then raise exception 'organiser'; end if;
  if not is_org_member(o.id, '{organiser,country_admin,super_admin}') then raise exception 'forbidden'; end if;
  if p_plan = 'free' then update organisers set plan = 'free', plan_until = null where id = o.id; return null; end if;
  if p_plan <> 'pro' then raise exception 'plan'; end if;  -- Venue is negotiated and set by the back office
  insert into service_charges (tenant_id, buyer_id, kind, ref_type, ref_id, description, amount, provider_pct, payment_method, status, paid_at)
  values (o.tenant_id, auth.uid(), 'organiser_plan', 'organiser', o.id, 'Pro plan · ' || o.name, 49, 0, p_method, 'paid', now()) returning id into sc;
  update organisers set plan = 'pro', plan_until = greatest(coalesce(plan_until, now()), now()) + interval '30 days' where id = o.id;
  return sc;
end $$;
grant execute on function upgrade_plan(uuid, text, payment_method) to authenticated;

-- ---- Promote packages → promotion_orders (ledger: rev:promotions) + featured placement on Home
create or replace function buy_promotion(p_event uuid, p_package text, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare e events%rowtype; pid uuid; price numeric; days int;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into e from events where id = p_event;
  if not found then raise exception 'event'; end if;
  if not is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}') then raise exception 'forbidden'; end if;
  price := case p_package when 'boost' then 40 when 'story' then 120 when 'takeover' then 300 end;
  days := case p_package when 'takeover' then 14 else 7 end;
  if price is null then raise exception 'package'; end if;
  insert into promotion_orders (tenant_id, event_id, organiser_id, package, price, status, payment_method)
  values (e.tenant_id, e.id, e.organiser_id, p_package, price, 'paid', p_method) returning id into pid;
  update events set featured_until = greatest(coalesce(featured_until, now()), now()) + make_interval(days => days) where id = e.id;
  return pid;
end $$;
grant execute on function buy_promotion(uuid, text, payment_method) to authenticated;

-- ---- event rooms: any listing gets a room on first open (public read; sign in to write)
create or replace function event_room(p_event uuid) returns uuid language plpgsql security definer as $$
declare e events%rowtype; rid uuid;
begin
  select * into e from events where id = p_event and status in ('live','sold_out','ended');
  if not found then raise exception 'event'; end if;
  select id into rid from chat_rooms where scope = 'event' and ref_id = p_event;
  if rid is null then
    insert into chat_rooms (tenant_id, scope, ref_id, name, access) values (e.tenant_id, 'event', p_event, e.title, 'public')
    on conflict (scope, ref_id) do update set name = excluded.name returning id into rid;
  end if;
  return rid;
end $$;
grant execute on function event_room(uuid) to anon, authenticated;
create or replace view v_room_counts with (security_invoker = true) as
  select room_id, count(distinct user_id) as members, count(*) as messages from chat_messages group by room_id;
grant select on v_room_counts to anon, authenticated;
grant select on v_chat_messages to anon;

-- ---- deals saved to the wallet (dashed coupon, redeem once)
create table if not exists saved_deals (
  user_id uuid references profiles(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  deal_id text not null,
  code text not null default upper(substr(md5(random()::text), 1, 6)),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id, deal_id)
);
alter table saved_deals enable row level security;
create policy saved_deals_own on saved_deals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- fan moments ("Where every image is a story"): private bucket, editors pick on Mondays
create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid references profiles(id) on delete set null,
  path text, caption text, credit text,
  status text not null default 'new' check (status in ('new','picked','rejected')),
  created_at timestamptz not null default now()
);
alter table moments enable row level security;
create policy moments_insert on moments for insert with check (auth.uid() = user_id);
create policy moments_read on moments for select using (auth.uid() = user_id or is_tenant_admin(tenant_id));
create policy moments_admin on moments for update using (is_tenant_admin(tenant_id));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 15728640, '{image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime}') on conflict (id) do nothing;
create policy moments_upload on storage.objects for insert to authenticated with check (bucket_id = 'moments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy moments_read_own on storage.objects for select to authenticated using (bucket_id = 'moments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from memberships m where m.user_id = auth.uid() and m.role in ('country_admin','super_admin'))));

-- ---- organiser tools: promoters view already exists; expose the organiser's plan to its members
create or replace view v_my_organisers with (security_invoker = true) as
  select o.id, o.tenant_id, o.name, o.name_ar, o.plan, o.plan_until, o.verified, m.role
  from organisers o join memberships m on m.organiser_id = o.id and m.user_id = auth.uid();
grant select on v_my_organisers to authenticated;

-- promoter links are opened by anonymous visitors
grant execute on function promoter_click(text,text) to anon;
