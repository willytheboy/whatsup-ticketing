-- 003: partners, double-entry ledger, revenue-share rules, settlements, invoices, provider reconciliation,
--      audit trail, venue streams + chat rooms.
create type partner_kind as enum ('platform','organiser','venue','promoter','media','service_provider');
create type account_kind as enum ('asset','liability','revenue','expense','equity');
create type revenue_stream as enum ('tickets','promotions','services');
create type invoice_status as enum ('draft','issued','paid','void');
create type settlement_status as enum ('scheduled','requested','processing','paid','failed');
create type recon_status as enum ('pending','matched','discrepancy','resolved');
create type stream_status as enum ('offline','live','ended');

create or replace function is_tenant_admin(p_tenant uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.role in ('country_admin','super_admin'))
$$;

create table partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  kind partner_kind not null,
  name text not null, name_ar text,
  legal_name text, tax_id text, email text, phone text, address text,
  organiser_id uuid unique references organisers(id),
  venue_id uuid unique references venues(id),
  promoter_id uuid unique references promoters(id),
  currency text not null default 'USD',
  payout_method text, payout_details jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on partners(tenant_id, kind);
create table partner_members (
  partner_id uuid references partners(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','finance','viewer')),
  primary key (partner_id, user_id)
);
create or replace function is_partner_member(p_partner uuid) returns boolean language sql stable security definer as $$
  select exists (
    select 1 from partners p
    where p.id = p_partner and (
      exists (select 1 from partner_members pm where pm.partner_id = p.id and pm.user_id = auth.uid())
      or (p.organiser_id is not null and is_org_member(p.organiser_id, array['organiser']::tenant_role[]))
      or is_tenant_admin(p.tenant_id))
  )
$$;
create or replace function ensure_partner(p_tenant uuid, p_kind partner_kind, p_name text, p_org uuid default null, p_venue uuid default null, p_promoter uuid default null)
returns uuid language plpgsql security definer as $$
declare pid uuid;
begin
  select id into pid from partners where tenant_id = p_tenant and (
    (p_org is not null and organiser_id = p_org) or (p_venue is not null and venue_id = p_venue) or (p_promoter is not null and promoter_id = p_promoter)
    or (p_kind = 'platform' and kind = 'platform'));
  if pid is null then
    insert into partners (tenant_id, kind, name, organiser_id, venue_id, promoter_id) values (p_tenant, p_kind, p_name, p_org, p_venue, p_promoter) returning id into pid;
  end if;
  return pid;
end $$;
create or replace function partner_autocreate() returns trigger language plpgsql security definer as $$
begin
  if tg_table_name = 'organisers' then perform ensure_partner(new.tenant_id, 'organiser', new.name, p_org => new.id);
  elsif tg_table_name = 'venues' then perform ensure_partner(new.tenant_id, 'venue', new.name, p_venue => new.id);
  elsif tg_table_name = 'promoters' then perform ensure_partner(new.tenant_id, 'promoter', new.name, p_promoter => new.id);
  end if;
  return new;
end $$;
create trigger organisers_partner after insert on organisers for each row execute function partner_autocreate();
create trigger venues_partner after insert on venues for each row execute function partner_autocreate();
create trigger promoters_partner after insert on promoters for each row execute function partner_autocreate();
insert into partners (tenant_id, kind, name) select id, 'platform', name || ' · platform' from tenants;
insert into partners (tenant_id, kind, name, name_ar, organiser_id, payout_method, payout_details) select tenant_id, 'organiser', name, name_ar, id, payout_method, payout_details from organisers;
insert into partners (tenant_id, kind, name, name_ar, venue_id) select tenant_id, 'venue', name, name_ar, id from venues;
insert into partners (tenant_id, kind, name, promoter_id) select tenant_id, 'promoter', name, id from promoters;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  partner_id uuid references partners(id),
  code text not null, name text not null, kind account_kind not null,
  unique (tenant_id, code)
);
create or replace function ensure_account(p_tenant uuid, p_code text, p_partner uuid default null) returns uuid language plpgsql security definer as $$
declare aid uuid; k account_kind; nm text;
begin
  select id into aid from accounts where tenant_id = p_tenant and code = p_code;
  if aid is not null then return aid; end if;
  k := case
    when p_code like 'clearing:%' or p_code = 'bank' or p_code like 'receivable:%' then 'asset'
    when p_code like 'payable:%' or p_code = 'buyer_credit' then 'liability'
    when p_code like 'rev:%' or p_code = 'processing_recovery' then 'revenue'
    else 'expense' end;
  nm := case when p_partner is not null then (select kind || ' · ' || name from partners where id = p_partner) || ' ' || split_part(p_code, ':', 1) else p_code end;
  insert into accounts (tenant_id, partner_id, code, name, kind) values (p_tenant, p_partner, p_code, nm, k) returning id into aid;
  return aid;
end $$;

create table journals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  kind text not null,
  stream revenue_stream,
  ref_type text, ref_id uuid,
  memo text,
  reversal_of uuid references journals(id),
  posted_by uuid,
  posted_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index on journals(tenant_id, posted_at desc);
create index on journals(ref_type, ref_id);
create table journal_lines (
  id bigserial primary key,
  journal_id uuid not null references journals(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  account_id uuid not null references accounts(id),
  partner_id uuid references partners(id),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  memo text,
  check (debit = 0 or credit = 0)
);
create index on journal_lines(partner_id, journal_id);
create index on journal_lines(account_id);
create or replace function check_journal_balance() returns trigger language plpgsql as $$
declare d numeric; c numeric; jid uuid;
begin
  jid := coalesce(new.journal_id, old.journal_id);
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c from journal_lines where journal_id = jid;
  if d <> c then raise exception 'journal % unbalanced: debits % credits %', jid, d, c; end if;
  return null;
end $$;
create constraint trigger journal_lines_balance after insert or update or delete on journal_lines deferrable initially deferred for each row execute function check_journal_balance();
create or replace function ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'ledger is append-only (% on %) — post a reversal instead', tg_op, tg_table_name; end $$;
create trigger journals_immutable before update or delete on journals for each row execute function ledger_immutable();
create trigger journal_lines_immutable before update or delete on journal_lines for each row execute function ledger_immutable();

create or replace function post_journal(p_tenant uuid, p_kind text, p_stream revenue_stream, p_ref_type text, p_ref_id uuid, p_memo text, p_lines jsonb, p_reversal_of uuid default null, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer as $$
declare jid uuid; l jsonb; pid uuid; code text; amt_d numeric; amt_c numeric;
begin
  insert into journals (tenant_id, kind, stream, ref_type, ref_id, memo, reversal_of, posted_by, meta)
  values (p_tenant, p_kind, p_stream, p_ref_type, p_ref_id, p_memo, p_reversal_of, auth.uid(), p_meta) returning id into jid;
  for l in select * from jsonb_array_elements(p_lines) loop
    amt_d := round(coalesce((l->>'debit')::numeric, 0), 2); amt_c := round(coalesce((l->>'credit')::numeric, 0), 2);
    if amt_d = 0 and amt_c = 0 then continue; end if;
    pid := nullif(l->>'partner', '')::uuid; code := l->>'code';
    insert into journal_lines (journal_id, tenant_id, account_id, partner_id, debit, credit, memo)
    values (jid, p_tenant, ensure_account(p_tenant, code, pid), pid, amt_d, amt_c, l->>'memo');
  end loop;
  return jid;
end $$;
create or replace function reverse_journal(p_journal uuid, p_kind text, p_memo text) returns uuid language plpgsql security definer as $$
declare j journals%rowtype; jid uuid;
begin
  select * into j from journals where id = p_journal;
  if not found then return null; end if;
  if exists (select 1 from journals where reversal_of = p_journal) then return (select id from journals where reversal_of = p_journal limit 1); end if;
  insert into journals (tenant_id, kind, stream, ref_type, ref_id, memo, reversal_of, posted_by, meta)
  values (j.tenant_id, p_kind, j.stream, j.ref_type, j.ref_id, p_memo, p_journal, auth.uid(), j.meta) returning id into jid;
  insert into journal_lines (journal_id, tenant_id, account_id, partner_id, debit, credit, memo)
  select jid, tenant_id, account_id, partner_id, credit, debit, memo from journal_lines where journal_id = p_journal;
  return jid;
end $$;

create table revenue_share_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  stream revenue_stream not null,
  scope text not null check (scope in ('tenant','organiser','venue','event')),
  organiser_id uuid references organisers(id), venue_id uuid references venues(id), event_id uuid references events(id),
  partner_id uuid not null references partners(id),
  basis text not null default 'platform_revenue' check (basis in ('platform_revenue','face','gross')),
  pct numeric not null default 0 check (pct >= 0 and pct <= 100),
  fixed numeric not null default 0,
  priority int not null default 100,
  active boolean not null default true,
  starts_at timestamptz, ends_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index on revenue_share_rules(tenant_id, stream) where active;
create or replace function rules_for_event(p_event uuid, p_stream revenue_stream) returns setof revenue_share_rules language sql stable security definer as $$
  select r.* from revenue_share_rules r join events e on e.id = p_event
  where r.tenant_id = e.tenant_id and r.stream = p_stream and r.active
    and (r.starts_at is null or r.starts_at <= now()) and (r.ends_at is null or r.ends_at >= now())
    and ((r.scope = 'tenant') or (r.scope = 'organiser' and r.organiser_id = e.organiser_id) or (r.scope = 'venue' and r.venue_id = e.venue_id) or (r.scope = 'event' and r.event_id = e.id))
  order by r.priority
$$;
create or replace function apply_share_rules(p_tenant uuid, p_ref_type text, p_ref_id uuid, p_stream revenue_stream, p_rules jsonb, p_platform_rev numeric, p_face numeric, p_gross numeric, p_memo text)
returns numeric language plpgsql security definer as $$
declare r jsonb; amt numeric; total numeric := 0; basis numeric;
begin
  for r in select * from jsonb_array_elements(p_rules) loop
    basis := case r->>'basis' when 'face' then p_face when 'gross' then p_gross else p_platform_rev end;
    amt := round(basis * (r->>'pct')::numeric / 100 + (r->>'fixed')::numeric, 2);
    if amt <= 0 then continue; end if;
    perform post_journal(p_tenant, 'revenue_share', p_stream, p_ref_type, p_ref_id, p_memo || ' · ' || (r->>'pct') || '% of ' || (r->>'basis'),
      jsonb_build_array(
        jsonb_build_object('code','revenue_share','debit',amt,'memo','partner share'),
        jsonb_build_object('code','payable:'||(r->>'partner_id'),'partner',r->>'partner_id','credit',amt,'memo','share of ' || p_stream)),
      null, jsonb_build_object('rule_id', r->>'id'));
    total := total + amt;
  end loop;
  return total;
end $$;

create or replace function post_order(p_order uuid) returns uuid language plpgsql security definer as $$
declare o orders%rowtype; e events%rowtype; org_partner uuid; jid uuid; collect_code text; collected numeric; org_net numeric; plat numeric;
        pr promoters%rowtype; prom_partner uuid; comm numeric; rules jsonb; face_net numeric;
begin
  select * into o from orders where id = p_order;
  if not found or o.status <> 'paid' then return null; end if;
  select id into jid from journals where ref_type = 'order' and ref_id = p_order and kind = 'sale';
  if jid is not null then return jid; end if;
  select * into e from events where id = o.event_id;
  org_partner := ensure_partner(o.tenant_id, 'organiser', (select name from organisers where id = e.organiser_id), p_org => e.organiser_id);
  face_net := o.face_total - o.discount;
  org_net := round(face_net + o.table_deposit - o.organiser_fee - o.processing_fee, 2);
  plat := round(o.buyer_fee + o.organiser_fee, 2);
  collected := round(face_net + o.buyer_fee + o.table_deposit - coalesce(o.credit_used,0), 2);
  collect_code := case when o.payment_method = 'cash_door' then 'receivable:' || org_partner else 'clearing:' || coalesce(o.payment_method::text, 'card') end;
  jid := post_journal(o.tenant_id, 'sale', 'tickets', 'order', o.id, 'Order ' || left(o.id::text, 8) || ' · ' || e.title,
    jsonb_build_array(
      jsonb_build_object('code', collect_code, 'partner', case when o.payment_method = 'cash_door' then org_partner end, 'debit', collected, 'memo', 'collected via ' || o.payment_method),
      jsonb_build_object('code', 'buyer_credit', 'debit', coalesce(o.credit_used,0), 'memo', 'credit redeemed'),
      jsonb_build_object('code', 'payable:' || org_partner, 'partner', org_partner, 'credit', org_net, 'memo', 'net ticket revenue'),
      jsonb_build_object('code', 'rev:tickets', 'credit', plat, 'memo', 'buyer fee + organiser fee'),
      jsonb_build_object('code', 'processing_recovery', 'credit', o.processing_fee, 'memo', 'processing fee charged')),
    null, jsonb_build_object('face', o.face_total, 'discount', o.discount, 'buyer_fee', o.buyer_fee, 'organiser_fee', o.organiser_fee, 'processing_fee', o.processing_fee, 'deposit', o.table_deposit, 'method', o.payment_method));
  if o.promoter_code is not null then
    select * into pr from promoters where tenant_id = o.tenant_id and code = o.promoter_code;
    if found then
      prom_partner := ensure_partner(o.tenant_id, 'promoter', pr.name, p_promoter => pr.id);
      comm := round(face_net * pr.commission_pct / 100, 2);
      if comm > 0 then perform post_journal(o.tenant_id, 'promoter_commission', 'tickets', 'order', o.id, 'Promoter ' || pr.code || ' commission',
        jsonb_build_array(jsonb_build_object('code','payable:'||org_partner,'partner',org_partner,'debit',comm),
                          jsonb_build_object('code','payable:'||prom_partner,'partner',prom_partner,'credit',comm))); end if;
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into rules from rules_for_event(e.id, 'tickets') r;
  perform apply_share_rules(o.tenant_id, 'order', o.id, 'tickets', rules, plat, face_net, o.total, 'Order ' || left(o.id::text, 8));
  return jid;
end $$;
create or replace function refund_order_ledger(p_order uuid) returns int language plpgsql security definer as $$
declare n int := 0; j record;
begin
  for j in select id from journals where ref_type = 'order' and ref_id = p_order and reversal_of is null and kind in ('sale','promoter_commission','revenue_share') loop
    perform reverse_journal(j.id, 'refund', 'Refund of order ' || left(p_order::text, 8)); n := n + 1;
  end loop;
  return n;
end $$;
create or replace function orders_ledger_trigger() returns trigger language plpgsql security definer as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then perform post_order(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status = 'paid' then perform refund_order_ledger(new.id);
  end if;
  return new;
end $$;
create trigger orders_ledger after insert or update of status on orders for each row execute function orders_ledger_trigger();

create or replace function award_referral_credit() returns trigger language plpgsql security definer as $$
declare ref text; referrer uuid; tid uuid;
begin
  if new.state = 'scanned' and old.state <> 'scanned' then
    select o.referral_code, o.tenant_id into ref, tid from orders o where o.id = new.order_id;
    if ref is not null then
      select id into referrer from profiles where referral_code = ref and id <> new.holder_id;
      if referrer is not null and not exists (select 1 from tickets k where k.holder_id = new.holder_id and k.state = 'scanned' and k.id <> new.id) then
        update profiles set credit = credit + 5 where id = referrer;
        perform post_journal(tid, 'referral', 'tickets', 'ticket', new.id, 'Referral credit $5 → ' || ref,
          jsonb_build_array(jsonb_build_object('code','referral_marketing','debit',5), jsonb_build_object('code','buyer_credit','credit',5)));
      end if;
    end if;
  end if;
  return new;
end $$;

alter table promotion_orders add column if not exists payment_method payment_method, add column if not exists payment_ref text,
  add column if not exists paid_at timestamptz, add column if not exists journal_id uuid references journals(id);
create or replace function post_promotion(p_id uuid) returns uuid language plpgsql security definer as $$
declare p promotion_orders%rowtype; jid uuid; rules jsonb; org_partner uuid;
begin
  select * into p from promotion_orders where id = p_id;
  if not found or p.status <> 'paid' or p.journal_id is not null then return p.journal_id; end if;
  org_partner := ensure_partner(p.tenant_id, 'organiser', (select name from organisers where id = p.organiser_id), p_org => p.organiser_id);
  jid := post_journal(p.tenant_id, 'promotion', 'promotions', 'promotion_order', p.id, 'Promotion ' || p.package,
    jsonb_build_array(
      jsonb_build_object('code', case when p.payment_method = 'credit' then 'payable:' || org_partner else 'clearing:' || coalesce(p.payment_method::text,'card') end, 'partner', case when p.payment_method = 'credit' then org_partner end, 'debit', p.price, 'memo', 'promotion package'),
      jsonb_build_object('code', 'rev:promotions', 'credit', p.price, 'memo', p.package)));
  update promotion_orders set journal_id = jid where id = p.id;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into rules from rules_for_event(p.event_id, 'promotions') r;
  perform apply_share_rules(p.tenant_id, 'promotion_order', p.id, 'promotions', rules, p.price, p.price, p.price, 'Promotion ' || p.package);
  return jid;
end $$;
create or replace function promotion_ledger_trigger() returns trigger language plpgsql security definer as $$
begin if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then perform post_promotion(new.id); end if; return new; end $$;
create trigger promotion_orders_ledger after insert or update of status on promotion_orders for each row execute function promotion_ledger_trigger();

create table service_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  provider_partner_id uuid references partners(id),
  buyer_id uuid references profiles(id),
  kind text not null check (kind in ('stream_pass','stream_subscription','chat_premium','venue_stream_plan','other')),
  ref_type text, ref_id uuid,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  provider_pct numeric not null default 70,
  payment_method payment_method, payment_ref text,
  status text not null default 'pending' check (status in ('pending','paid','refunded','void')),
  paid_at timestamptz, journal_id uuid references journals(id),
  created_at timestamptz not null default now()
);
create index on service_charges(tenant_id, status);
create or replace function post_service_charge(p_id uuid) returns uuid language plpgsql security definer as $$
declare s service_charges%rowtype; jid uuid; share numeric;
begin
  select * into s from service_charges where id = p_id;
  if not found or s.status <> 'paid' or s.journal_id is not null then return s.journal_id; end if;
  jid := post_journal(s.tenant_id, 'service', 'services', 'service_charge', s.id, coalesce(s.description, s.kind),
    jsonb_build_array(
      jsonb_build_object('code', 'clearing:' || coalesce(s.payment_method::text,'card'), 'debit', s.amount, 'memo', s.kind),
      jsonb_build_object('code', 'rev:services', 'credit', s.amount, 'memo', s.kind)));
  update service_charges set journal_id = jid where id = s.id;
  if s.provider_partner_id is not null and s.provider_pct > 0 then
    share := round(s.amount * s.provider_pct / 100, 2);
    perform post_journal(s.tenant_id, 'revenue_share', 'services', 'service_charge', s.id, 'Provider share ' || s.provider_pct || '%',
      jsonb_build_array(jsonb_build_object('code','revenue_share','debit',share),
                        jsonb_build_object('code','payable:'||s.provider_partner_id,'partner',s.provider_partner_id,'credit',share)));
  end if;
  return jid;
end $$;
create or replace function service_ledger_trigger() returns trigger language plpgsql security definer as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then perform post_service_charge(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status = 'paid' then
    perform reverse_journal(j.id, 'refund', 'Refund ' || new.kind) from journals j where j.ref_type = 'service_charge' and j.ref_id = new.id and j.reversal_of is null;
  end if; return new;
end $$;
create trigger service_charges_ledger after insert or update of status on service_charges for each row execute function service_ledger_trigger();

create or replace view v_account_balances with (security_invoker = true) as
select a.tenant_id, a.id as account_id, a.code, a.name, a.kind, a.partner_id,
  coalesce(sum(l.debit),0) as debits, coalesce(sum(l.credit),0) as credits,
  case when a.kind in ('asset','expense') then coalesce(sum(l.debit),0) - coalesce(sum(l.credit),0) else coalesce(sum(l.credit),0) - coalesce(sum(l.debit),0) end as balance
from accounts a left join journal_lines l on l.account_id = a.id group by a.id;

create or replace view v_partner_balances with (security_invoker = true) as
select p.tenant_id, p.id as partner_id, p.kind, p.name,
  coalesce((select sum(l.credit - l.debit) from journal_lines l join accounts a on a.id = l.account_id where a.code = 'payable:' || p.id),0) as payable,
  coalesce((select sum(l.debit - l.credit) from journal_lines l join accounts a on a.id = l.account_id where a.code = 'receivable:' || p.id),0) as receivable,
  coalesce((select sum(l.credit - l.debit) from journal_lines l join accounts a on a.id = l.account_id where a.code = 'payable:' || p.id),0)
  - coalesce((select sum(l.debit - l.credit) from journal_lines l join accounts a on a.id = l.account_id where a.code = 'receivable:' || p.id),0) as net_balance,
  (select max(j.posted_at) from journal_lines l join journals j on j.id = l.journal_id where l.partner_id = p.id) as last_activity
from partners p;

create or replace view v_partner_ledger with (security_invoker = true) as
select l.id as line_id, l.tenant_id, l.partner_id, j.id as journal_id, j.posted_at, j.kind, j.stream, j.ref_type, j.ref_id, j.memo as journal_memo, l.memo,
  a.code, l.credit - l.debit as amount,
  j.reversal_of, j.meta
from journal_lines l join journals j on j.id = l.journal_id join accounts a on a.id = l.account_id
where l.partner_id is not null;

create or replace function partner_statement(p_partner uuid, p_start date, p_end date) returns jsonb language sql stable security definer as $$
  with lines as (
    select * from v_partner_ledger where partner_id = p_partner and posted_at::date between p_start and p_end order by posted_at),
  opening as (select coalesce(sum(amount),0) o from v_partner_ledger where partner_id = p_partner and posted_at::date < p_start)
  select jsonb_build_object(
    'partner_id', p_partner, 'period_start', p_start, 'period_end', p_end,
    'opening', (select o from opening),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from lines l), '[]'::jsonb),
    'by_stream', coalesce((select jsonb_object_agg(coalesce(stream::text,'other'), s) from (select stream, sum(amount) s from lines group by stream) x), '{}'::jsonb),
    'movement', (select coalesce(sum(amount),0) from lines),
    'closing', (select o from opening) + (select coalesce(sum(amount),0) from lines))
  where is_partner_member(p_partner)
$$;

create table doc_sequences (tenant_id uuid references tenants(id), kind text, last int not null default 0, primary key (tenant_id, kind));
create or replace function next_doc_number(p_tenant uuid, p_kind text) returns text language plpgsql security definer as $$
declare n int;
begin
  insert into doc_sequences (tenant_id, kind, last) values (p_tenant, p_kind, 1) on conflict (tenant_id, kind) do update set last = doc_sequences.last + 1 returning last into n;
  return upper((select slug from tenants where id = p_tenant)) || '-' || p_kind || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
end $$;
create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  partner_id uuid not null references partners(id),
  direction text not null check (direction in ('platform_to_partner','partner_to_platform')),
  number text not null unique,
  period_start date, period_end date,
  lines jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0, tax_pct numeric not null default 0, tax numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status invoice_status not null default 'draft',
  issued_at timestamptz, due_at timestamptz, paid_at timestamptz, payment_ref text,
  journal_id uuid references journals(id),
  notes text, created_by uuid, created_at timestamptz not null default now()
);
create index on invoices(partner_id, status);
create table settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  partner_id uuid not null references partners(id),
  period_start date not null, period_end date not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  method text, reference text,
  status settlement_status not null default 'scheduled',
  statement jsonb,
  invoice_id uuid references invoices(id),
  journal_id uuid references journals(id),
  requested_at timestamptz, paid_at timestamptz, created_at timestamptz not null default now(), created_by uuid,
  unique (partner_id, period_start, period_end)
);
create or replace function generate_settlements(p_start date, p_end date) returns int language plpgsql security definer as $$
declare n int := 0; r record; bal numeric; st jsonb; inv uuid;
begin
  for r in select p.* from partners p where p.active and p.kind <> 'platform' loop
    select net_balance into bal from v_partner_balances where partner_id = r.id;
    if coalesce(bal,0) = 0 then continue; end if;
    if exists (select 1 from settlements s where s.partner_id = r.id and s.period_start = p_start and s.period_end = p_end) then continue; end if;
    st := (select jsonb_build_object('opening', coalesce(sum(amount) filter (where posted_at::date < p_start),0), 'movement', coalesce(sum(amount) filter (where posted_at::date between p_start and p_end),0), 'closing', coalesce(sum(amount),0)) from v_partner_ledger where partner_id = r.id and posted_at::date <= p_end);
    inv := null;
    if bal < 0 then
      insert into invoices (tenant_id, partner_id, direction, number, period_start, period_end, lines, subtotal, total, status, issued_at, due_at)
      values (r.tenant_id, r.id, 'partner_to_platform', next_doc_number(r.tenant_id, 'INV'), p_start, p_end,
        jsonb_build_array(jsonb_build_object('description', 'Platform fees & cash collected on behalf of WhatsUp, ' || p_start || ' → ' || p_end, 'qty', 1, 'unit', -bal, 'amount', -bal)),
        -bal, -bal, 'issued', now(), now() + interval '14 days') returning id into inv;
    end if;
    insert into settlements (tenant_id, partner_id, period_start, period_end, amount, currency, method, statement, invoice_id)
    values (r.tenant_id, r.id, p_start, p_end, bal, r.currency, r.payout_method, st, inv);
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function request_settlement(p_id uuid) returns boolean language sql security definer as $$
  update settlements s set status = 'requested', requested_at = now() where s.id = p_id and s.status = 'scheduled' and is_partner_member(s.partner_id) returning true
$$;
create or replace function mark_settlement_paid(p_id uuid, p_ref text, p_method text default null) returns uuid language plpgsql security definer as $$
declare s settlements%rowtype; jid uuid;
begin
  select * into s from settlements where id = p_id for update;
  if not found or s.status = 'paid' then return s.journal_id; end if;
  if not is_tenant_admin(s.tenant_id) then raise exception 'admin only'; end if;
  if s.amount > 0 then
    jid := post_journal(s.tenant_id, 'settlement', null, 'settlement', s.id, 'Settlement ' || s.period_start || ' → ' || s.period_end || ' · ' || coalesce(p_ref,''),
      jsonb_build_array(jsonb_build_object('code','payable:'||s.partner_id,'partner',s.partner_id,'debit',s.amount,'memo','paid out'),
                        jsonb_build_object('code','bank','credit',s.amount,'memo',coalesce(p_method, s.method, 'transfer'))));
  else
    jid := post_journal(s.tenant_id, 'settlement', null, 'settlement', s.id, 'Partner remittance ' || s.period_start || ' → ' || s.period_end || ' · ' || coalesce(p_ref,''),
      jsonb_build_array(jsonb_build_object('code','bank','debit',-s.amount,'memo',coalesce(p_method, 'transfer')),
                        jsonb_build_object('code','receivable:'||s.partner_id,'partner',s.partner_id,'credit',-s.amount,'memo','remitted')));
    if s.invoice_id is not null then update invoices set status = 'paid', paid_at = now(), payment_ref = p_ref, journal_id = jid where id = s.invoice_id; end if;
  end if;
  update settlements set status = 'paid', paid_at = now(), reference = p_ref, method = coalesce(p_method, method), journal_id = jid where id = s.id;
  return jid;
end $$;
select cron.unschedule('weekly-payouts');
select cron.schedule('weekly-settlements', '0 6 * * 1', $$select generate_settlements((current_date - 7)::date, (current_date - 1)::date)$$);

create table provider_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  provider text not null,
  external_ref text,
  period_start date, period_end date,
  gross numeric(12,2) not null default 0, fees numeric(12,2) not null default 0, net numeric(12,2) not null default 0,
  currency text not null default 'USD',
  received_at timestamptz,
  status recon_status not null default 'pending',
  summary jsonb not null default '{}'::jsonb, raw jsonb,
  journal_id uuid references journals(id),
  notes text, created_by uuid, created_at timestamptz not null default now()
);
create table provider_transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references provider_batches(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  external_ref text not null,
  order_id uuid references orders(id),
  gross numeric(12,2) not null, fee numeric(12,2) not null default 0, net numeric(12,2) not null default 0,
  occurred_at timestamptz,
  status recon_status not null default 'pending',
  note text
);
create index on provider_transactions(batch_id);
create index on orders(payment_ref) where payment_ref is not null;
create or replace function reconcile_batch(p_batch uuid) returns jsonb language plpgsql security definer as $$
declare b provider_batches%rowtype; t record; o orders%rowtype; matched int := 0; disc int := 0; unmatched int := 0; jid uuid; missing int;
begin
  select * into b from provider_batches where id = p_batch for update;
  if not found then return null; end if;
  for t in select * from provider_transactions where batch_id = p_batch loop
    if t.order_id is not null then select * into o from orders where id = t.order_id;
    else select * into o from orders where tenant_id = b.tenant_id and payment_ref = t.external_ref and payment_method::text = b.provider limit 1; end if;
    if not found then update provider_transactions set status = 'pending', note = 'no order with this reference' where id = t.id; unmatched := unmatched + 1;
    elsif o.status not in ('paid','refunded') or abs(o.total - t.gross) > 0.01 then
      update provider_transactions set order_id = o.id, status = 'discrepancy', note = format('order %s total %s vs provider %s', o.status, o.total, t.gross) where id = t.id; disc := disc + 1;
    else update provider_transactions set order_id = o.id, status = 'matched', note = null where id = t.id; matched := matched + 1;
    end if;
  end loop;
  select count(*) into missing from orders o where o.tenant_id = b.tenant_id and o.payment_method::text = b.provider and o.status = 'paid'
    and o.paid_at::date between coalesce(b.period_start, '1900-01-01') and coalesce(b.period_end, '2999-12-31')
    and not exists (select 1 from provider_transactions x where x.batch_id = b.id and x.order_id = o.id);
  update provider_batches set status = case when disc = 0 and unmatched = 0 and missing = 0 then 'matched' else 'discrepancy' end,
    summary = jsonb_build_object('matched', matched, 'discrepancy', disc, 'unmatched', unmatched, 'missing_orders', missing) where id = p_batch;
  if b.journal_id is null and b.net > 0 then
    jid := post_journal(b.tenant_id, 'provider_batch', null, 'provider_batch', b.id, 'Provider payout ' || b.provider || ' ' || coalesce(b.external_ref,''),
      jsonb_build_array(jsonb_build_object('code','bank','debit',b.net,'memo','received from ' || b.provider),
                        jsonb_build_object('code','processing_expense','debit',b.fees,'memo','provider fees'),
                        jsonb_build_object('code','clearing:'||b.provider,'credit',b.gross,'memo','cleared')));
    update provider_batches set journal_id = jid where id = b.id;
  end if;
  return (select summary from provider_batches where id = p_batch);
end $$;
create or replace function import_provider_batch(p_tenant uuid, p_provider text, p_external_ref text, p_start date, p_end date, p_txns jsonb, p_notes text default null) returns uuid language plpgsql security definer as $$
declare bid uuid; t jsonb;
begin
  if not is_tenant_admin(p_tenant) then raise exception 'admin only'; end if;
  insert into provider_batches (tenant_id, provider, external_ref, period_start, period_end, received_at, raw, notes, created_by)
  values (p_tenant, p_provider, p_external_ref, p_start, p_end, now(), p_txns, p_notes, auth.uid()) returning id into bid;
  for t in select * from jsonb_array_elements(p_txns) loop
    insert into provider_transactions (batch_id, tenant_id, external_ref, order_id, gross, fee, net, occurred_at)
    values (bid, p_tenant, t->>'ref', nullif(t->>'order_id','')::uuid, (t->>'gross')::numeric, coalesce((t->>'fee')::numeric,0), coalesce((t->>'net')::numeric, (t->>'gross')::numeric - coalesce((t->>'fee')::numeric,0)), nullif(t->>'at','')::timestamptz);
  end loop;
  update provider_batches b set gross = s.g, fees = s.f, net = s.n from (select coalesce(sum(gross),0) g, coalesce(sum(fee),0) f, coalesce(sum(net),0) n from provider_transactions where batch_id = bid) s where b.id = bid;
  perform reconcile_batch(bid);
  return bid;
end $$;
create or replace function resolve_transaction(p_id uuid, p_order uuid, p_note text) returns boolean language plpgsql security definer as $$
declare t provider_transactions%rowtype;
begin
  select * into t from provider_transactions where id = p_id; if not found or not is_tenant_admin(t.tenant_id) then return false; end if;
  update provider_transactions set order_id = coalesce(p_order, order_id), status = 'resolved', note = p_note where id = p_id;
  return true;
end $$;
create or replace view v_unreconciled_orders with (security_invoker = true) as
select o.id, o.tenant_id, o.payment_method, o.payment_ref, o.total, o.paid_at, e.title
from orders o join events e on e.id = o.event_id
where o.status = 'paid' and o.payment_method in ('card','whish','omt') and not exists (select 1 from provider_transactions t where t.order_id = o.id and t.status in ('matched','resolved'));

create or replace view v_platform_pnl with (security_invoker = true) as
select a.tenant_id, date_trunc('month', j.posted_at)::date as month, j.stream, a.code, a.kind,
  sum(case when a.kind = 'revenue' then l.credit - l.debit else l.debit - l.credit end) as amount
from journal_lines l join journals j on j.id = l.journal_id join accounts a on a.id = l.account_id
where a.kind in ('revenue','expense') group by 1,2,3,4,5;

create table audit_log (
  id bigserial primary key,
  tenant_id uuid, actor uuid, table_name text not null, row_id uuid, action text not null,
  old jsonb, new jsonb, at timestamptz not null default now()
);
create index on audit_log(table_name, row_id);
create index on audit_log(tenant_id, at desc);
create or replace function audit_row() returns trigger language plpgsql security definer as $$
declare rid uuid; tid uuid;
begin
  rid := coalesce((to_jsonb(coalesce(new, old))->>'id')::uuid, null);
  tid := coalesce((to_jsonb(coalesce(new, old))->>'tenant_id')::uuid, null);
  insert into audit_log (tenant_id, actor, table_name, row_id, action, old, new)
  values (tid, auth.uid(), tg_table_name, rid, tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_partners after insert or update or delete on partners for each row execute function audit_row();
create trigger audit_rules after insert or update or delete on revenue_share_rules for each row execute function audit_row();
create trigger audit_invoices after insert or update or delete on invoices for each row execute function audit_row();
create trigger audit_settlements after insert or update or delete on settlements for each row execute function audit_row();
create trigger audit_batches after insert or update or delete on provider_batches for each row execute function audit_row();
create trigger audit_service_charges after insert or update or delete on service_charges for each row execute function audit_row();
create trigger audit_orders_status after update of status, payment_ref on orders for each row execute function audit_row();
create trigger audit_promotions after insert or update or delete on promotion_orders for each row execute function audit_row();

create table streams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  venue_id uuid references venues(id),
  partner_id uuid references partners(id),
  event_id uuid references events(id),
  slug text not null, title text not null, title_ar text,
  kind text not null default 'audio' check (kind in ('audio','video')),
  source text not null default 'hls' check (source in ('hls','icecast','mp3','youtube','webrtc')),
  playback_url text,
  ingest_url text, stream_key text,
  access text not null default 'public' check (access in ('public','ticket_holders','pass')),
  pass_price numeric(12,2) not null default 0,
  status stream_status not null default 'offline',
  cover_url text, description text,
  listeners int not null default 0,
  started_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create table stream_passes (
  stream_id uuid references streams(id) on delete cascade, user_id uuid references profiles(id) on delete cascade,
  service_charge_id uuid references service_charges(id), expires_at timestamptz, created_at timestamptz not null default now(),
  primary key (stream_id, user_id)
);
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  scope text not null check (scope in ('event','venue','stream')),
  ref_id uuid not null,
  name text not null,
  access text not null default 'public' check (access in ('public','ticket_holders','pass')),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  unique (scope, ref_id)
);
create table chat_messages (
  id bigserial primary key,
  room_id uuid not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on chat_messages(room_id, id desc);
create or replace function stream_room() returns trigger language plpgsql security definer as $$
begin insert into chat_rooms (tenant_id, scope, ref_id, name, access) values (new.tenant_id, 'stream', new.id, new.title, new.access) on conflict do nothing; return new; end $$;
create trigger streams_room after insert on streams for each row execute function stream_room();
create or replace function can_access_stream(p_stream uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from streams s where s.id = p_stream and (
    s.access = 'public'
    or is_partner_member(s.partner_id)
    or (s.access = 'ticket_holders' and s.event_id is not null and exists (select 1 from tickets t where t.event_id = s.event_id and t.holder_id = auth.uid() and t.state in ('valid','scanned','reserved')))
    or (s.access = 'pass' and exists (select 1 from stream_passes p where p.stream_id = s.id and p.user_id = auth.uid() and (p.expires_at is null or p.expires_at > now())))))
$$;
create or replace function buy_stream_pass(p_stream uuid, p_method payment_method default 'card') returns uuid language plpgsql security definer as $$
declare s streams%rowtype; sc uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into s from streams where id = p_stream; if not found then raise exception 'stream'; end if;
  if s.access <> 'pass' or s.pass_price <= 0 then raise exception 'not_for_sale'; end if;
  insert into service_charges (tenant_id, provider_partner_id, buyer_id, kind, ref_type, ref_id, description, amount, payment_method, status, paid_at)
  values (s.tenant_id, s.partner_id, auth.uid(), 'stream_pass', 'stream', s.id, 'Stream pass · ' || s.title, s.pass_price, p_method, 'paid', now()) returning id into sc;
  insert into stream_passes (stream_id, user_id, service_charge_id, expires_at) values (s.id, auth.uid(), sc, now() + interval '24 hours')
  on conflict (stream_id, user_id) do update set service_charge_id = excluded.service_charge_id, expires_at = excluded.expires_at;
  return sc;
end $$;
create or replace function set_stream_status(p_stream uuid, p_status stream_status) returns boolean language sql security definer as $$
  update streams s set status = p_status, started_at = case when p_status = 'live' then now() else started_at end, ended_at = case when p_status = 'ended' then now() else null end
  where s.id = p_stream and is_partner_member(s.partner_id) returning true
$$;
create or replace function stream_credentials(p_stream uuid) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('ingest_url', ingest_url, 'stream_key', stream_key) from streams s where s.id = p_stream and is_partner_member(s.partner_id)
$$;
alter publication supabase_realtime add table chat_messages;
create view v_streams as
select id, tenant_id, venue_id, partner_id, event_id, slug, title, title_ar, kind, source, playback_url, access, pass_price, status, cover_url, description, listeners, started_at, ended_at, created_at from streams;

alter table partners enable row level security;
alter table partner_members enable row level security;
alter table accounts enable row level security;
alter table journals enable row level security;
alter table journal_lines enable row level security;
alter table revenue_share_rules enable row level security;
alter table service_charges enable row level security;
alter table invoices enable row level security;
alter table settlements enable row level security;
alter table provider_batches enable row level security;
alter table provider_transactions enable row level security;
alter table audit_log enable row level security;
alter table streams enable row level security;
alter table stream_passes enable row level security;
alter table chat_rooms enable row level security;
alter table chat_messages enable row level security;
alter table doc_sequences enable row level security;

create policy partners_read on partners for select using (is_partner_member(id) or is_tenant_admin(tenant_id));
create policy partners_admin on partners for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy partner_members_read on partner_members for select using (user_id = auth.uid() or is_partner_member(partner_id));
create policy partner_members_admin on partner_members for all using (exists (select 1 from partners p where p.id = partner_id and is_tenant_admin(p.tenant_id))) with check (exists (select 1 from partners p where p.id = partner_id and is_tenant_admin(p.tenant_id)));
create policy accounts_read on accounts for select using (is_tenant_admin(tenant_id) or (partner_id is not null and is_partner_member(partner_id)));
create policy journal_lines_read on journal_lines for select using (is_tenant_admin(tenant_id) or (partner_id is not null and is_partner_member(partner_id)));
create policy journals_read on journals for select using (is_tenant_admin(tenant_id) or exists (select 1 from journal_lines l where l.journal_id = journals.id and l.partner_id is not null and is_partner_member(l.partner_id)));
create policy rules_read on revenue_share_rules for select using (is_tenant_admin(tenant_id) or is_partner_member(partner_id) or (organiser_id is not null and is_org_member(organiser_id, array['organiser']::tenant_role[])));
create policy rules_admin on revenue_share_rules for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy service_read on service_charges for select using (buyer_id = auth.uid() or is_tenant_admin(tenant_id) or (provider_partner_id is not null and is_partner_member(provider_partner_id)));
create policy service_admin on service_charges for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy invoices_read on invoices for select using (is_tenant_admin(tenant_id) or is_partner_member(partner_id));
create policy invoices_admin on invoices for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy settlements_read on settlements for select using (is_tenant_admin(tenant_id) or is_partner_member(partner_id));
create policy settlements_admin on settlements for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy batches_admin on provider_batches for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy ptx_admin on provider_transactions for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy audit_read on audit_log for select using (is_tenant_admin(tenant_id) or exists (select 1 from partners p where p.id = row_id and is_partner_member(p.id)));
create policy streams_owner on streams for all using (is_partner_member(partner_id) or is_tenant_admin(tenant_id)) with check (is_partner_member(partner_id) or is_tenant_admin(tenant_id));
grant select on v_streams to anon, authenticated;
create policy passes_read on stream_passes for select using (user_id = auth.uid() or exists (select 1 from streams s where s.id = stream_id and is_partner_member(s.partner_id)));
create policy rooms_read on chat_rooms for select using (true);
create policy rooms_owner on chat_rooms for all using (is_tenant_admin(tenant_id) or (scope = 'stream' and exists (select 1 from streams s where s.id = ref_id and is_partner_member(s.partner_id)))) with check (is_tenant_admin(tenant_id));
create or replace function can_access_room(p_room uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from chat_rooms r where r.id = p_room and (
    r.access = 'public' or is_tenant_admin(r.tenant_id)
    or (r.scope = 'stream' and can_access_stream(r.ref_id))
    or (r.scope = 'event' and exists (select 1 from tickets t where t.event_id = r.ref_id and t.holder_id = auth.uid()))))
$$;
create policy chat_read on chat_messages for select using (can_access_room(room_id));
create policy chat_write on chat_messages for insert with check (user_id = auth.uid() and can_access_room(room_id) and exists (select 1 from chat_rooms r where r.id = room_id and r.status = 'open'));
create policy chat_moderate on chat_messages for delete using (exists (select 1 from chat_rooms r where r.id = room_id and (is_tenant_admin(r.tenant_id) or (r.scope = 'stream' and exists (select 1 from streams s where s.id = r.ref_id and is_partner_member(s.partner_id))))));

create or replace view v_chat_messages with (security_invoker = true) as
select m.id, m.room_id, m.user_id, m.body, m.created_at, coalesce(p.name, 'Guest') as name from chat_messages m left join profiles p on p.id = m.user_id;

grant select on v_account_balances, v_partner_balances, v_partner_ledger, v_unreconciled_orders, v_platform_pnl, v_chat_messages to authenticated;
grant select on v_chat_messages to anon;
grant execute on function partner_statement(uuid,date,date), request_settlement(uuid), mark_settlement_paid(uuid,text,text), import_provider_batch(uuid,text,text,date,date,jsonb,text),
  reconcile_batch(uuid), resolve_transaction(uuid,uuid,text), generate_settlements(date,date), buy_stream_pass(uuid,payment_method), set_stream_status(uuid,stream_status),
  stream_credentials(uuid), can_access_stream(uuid), is_partner_member(uuid), is_tenant_admin(uuid) to authenticated;
grant execute on function can_access_stream(uuid), can_access_room(uuid) to anon, authenticated;
revoke execute on function post_journal(uuid,text,revenue_stream,text,uuid,text,jsonb,uuid,jsonb), reverse_journal(uuid,text,text), post_order(uuid), refund_order_ledger(uuid),
  post_promotion(uuid), post_service_charge(uuid), apply_share_rules(uuid,text,uuid,revenue_stream,jsonb,numeric,numeric,numeric,text), ensure_account(uuid,text,uuid), ensure_partner(uuid,partner_kind,text,uuid,uuid,uuid), next_doc_number(uuid,text) from public, anon, authenticated;

select post_order(id) from orders where status = 'paid' order by paid_at;
