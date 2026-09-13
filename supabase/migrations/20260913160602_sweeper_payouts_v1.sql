-- 002: hold-expiry sweeper, payout engine, organiser views, promoter attribution
create extension if not exists pg_cron;

-- ---- expire holds: pending checkouts past their hold, and door/OMT reservations not paid before the cut-off ----
create or replace function expire_holds() returns int language plpgsql security definer as $$
declare n int := 0; r record;
begin
  for r in select o.id from orders o where o.status in ('pending','reserved') and o.hold_expires_at < now() loop
    update tiers t set held = greatest(t.held - l.qty, 0) from order_lines l where l.order_id = r.id and l.tier_id = t.id;
    update tables_vip set reserved_by_order = null where reserved_by_order = r.id;
    update tickets set state = 'void' where order_id = r.id and state = 'reserved';
    update orders set status = 'expired' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
select cron.schedule('expire-holds', '* * * * *', $$select expire_holds()$$);

-- ---- pay a reservation at the door (cash) or by OMT reference ----
create or replace function settle_reservation(p_order uuid, p_ref text default null) returns boolean language plpgsql security definer as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and status = 'reserved' for update;
  if not found then return false; end if;
  update tiers t set held = greatest(t.held - l.qty,0), sold = t.sold + l.qty from order_lines l where l.order_id = o.id and l.tier_id = t.id;
  update tickets set state = 'valid' where order_id = o.id and state = 'reserved';
  update orders set status = 'paid', paid_at = now(), payment_ref = coalesce(p_ref, payment_ref) where id = o.id;
  return true;
end $$;

-- ---- organiser dashboard views ----
create or replace view organiser_event_stats as
select e.id as event_id, e.tenant_id, e.organiser_id, e.title, e.starts_at, e.status,
  sum(t.capacity) as capacity, sum(t.sold) as sold, sum(t.held) as held,
  coalesce((select sum(o.face_total) from orders o where o.event_id = e.id and o.status = 'paid'),0) as gross,
  coalesce((select sum(o.buyer_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as buyer_fees,
  coalesce((select sum(o.organiser_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as organiser_fees,
  coalesce((select sum(o.processing_fee) from orders o where o.event_id = e.id and o.status = 'paid'),0) as processing_fees,
  coalesce((select sum(o.table_deposit) from orders o where o.event_id = e.id and o.status = 'paid'),0) as deposits,
  (select count(*) from tickets k where k.event_id = e.id and k.state = 'scanned') as checked_in
from events e left join tiers t on t.event_id = e.id
group by e.id;

create or replace view organiser_daily_sales as
select e.organiser_id, e.tenant_id, date_trunc('day', o.paid_at)::date as day, sum(l.qty) as tickets, sum(o.face_total) as gross
from orders o join events e on e.id = o.event_id join order_lines l on l.order_id = o.id and l.tier_id is not null
where o.status = 'paid' group by 1,2,3;

-- ---- payout engine: weekly statement per organiser (Mon–Sun), amount = face − organiser fee − processing + deposits ----
create or replace function generate_payouts(p_start date, p_end date) returns int language plpgsql security definer as $$
declare n int := 0; r record;
begin
  for r in
    select e.tenant_id, e.organiser_id,
      sum(o.face_total) face, sum(o.organiser_fee) ofee, sum(o.processing_fee) proc, sum(o.table_deposit) dep
    from orders o join events e on e.id = o.event_id
    where o.status = 'paid' and o.paid_at::date between p_start and p_end
    group by 1,2
  loop
    insert into payouts (tenant_id, organiser_id, period_start, period_end, face_total, organiser_fee, processing_fee, deposits, amount)
    values (r.tenant_id, r.organiser_id, p_start, p_end, r.face, r.ofee, r.proc, r.dep, round(r.face - r.ofee - r.proc + r.dep, 2))
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
alter table payouts add constraint payouts_period_unique unique (organiser_id, period_start, period_end);
-- every Monday 06:00 UTC, statement for the previous Mon–Sun
select cron.schedule('weekly-payouts', '0 6 * * 1', $$select generate_payouts((current_date - 7)::date, (current_date - 1)::date)$$);

create or replace function request_payout(p_payout uuid) returns boolean language sql security definer as $$
  update payouts set status = 'requested', requested_at = now() where id = p_payout and status = 'scheduled' returning true
$$;

-- ---- promoter attribution ----
create or replace function promoter_click(p_tenant text, p_code text) returns void language sql security definer as $$
  update promoters p set clicks = clicks + 1 from tenants t where t.id = p.tenant_id and t.slug = p_tenant and p.code = upper(p_code)
$$;
create or replace view promoter_stats as
select p.id, p.tenant_id, p.organiser_id, p.name, p.code, p.commission_pct, p.clicks,
  (select count(*) from orders o where o.promoter_code = p.code and o.status = 'paid') as sales,
  (select coalesce(sum(o.face_total * p.commission_pct / 100),0) from orders o where o.promoter_code = p.code and o.status = 'paid') as commission
from promoters p;

-- ---- referral credit: $5 to the referrer when the referred buyer's first ticket is scanned ----
create or replace function award_referral_credit() returns trigger language plpgsql security definer as $$
declare ref text; referrer uuid;
begin
  if new.state = 'scanned' and old.state <> 'scanned' then
    select o.referral_code into ref from orders o where o.id = new.order_id;
    if ref is not null then
      select id into referrer from profiles where referral_code = ref and id <> new.holder_id;
      if referrer is not null and not exists (select 1 from tickets k join orders o2 on o2.id = k.order_id where k.holder_id = new.holder_id and k.state = 'scanned' and k.id <> new.id) then
        update profiles set credit = credit + 5 where id = referrer;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger tickets_referral_credit after update of state on tickets for each row execute function award_referral_credit();

-- expose views to organiser staff through RLS on base tables (views run with invoker rights)
grant select on organiser_event_stats, organiser_daily_sales, promoter_stats to authenticated;
grant execute on function request_payout(uuid), promoter_click(text,text) to authenticated;
