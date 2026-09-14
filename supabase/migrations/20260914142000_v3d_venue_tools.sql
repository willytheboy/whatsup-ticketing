-- organisers edit their own record (WhatsApp number for group bookings and refunds, names)
drop policy if exists organisers_org_update on organisers;
create policy organisers_org_update on organisers for update using (is_org_member(id, '{organiser,country_admin,super_admin}')) with check (is_org_member(id, '{organiser,country_admin,super_admin}'));
-- organisers create and edit venues in their tenant (address, Arabic address, pin)
drop policy if exists venues_org_write on venues;
create policy venues_org_write on venues for all using (exists (select 1 from memberships m where m.user_id = auth.uid() and m.tenant_id = venues.tenant_id and m.role in ('organiser','country_admin','super_admin')))
  with check (exists (select 1 from memberships m where m.user_id = auth.uid() and m.tenant_id = venues.tenant_id and m.role in ('organiser','country_admin','super_admin')));
-- organisers see the waitlist size on their tiers
drop policy if exists waitlist_org_read on waitlist;
create policy waitlist_org_read on waitlist for select using (exists (select 1 from tiers t join events e on e.id = t.event_id where t.id = waitlist.tier_id and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')));
-- views carry the new columns
drop view if exists v_my_organisers;
create view v_my_organisers with (security_invoker = true) as
  select o.id, o.tenant_id, o.name, o.name_ar, o.plan, o.plan_until, o.verified, m.role, o.whatsapp, o.credit_month
  from organisers o join memberships m on m.organiser_id = o.id and m.user_id = auth.uid();
drop view if exists promoter_stats;
create view promoter_stats with (security_invoker = true) as
  select p.id, p.tenant_id, p.organiser_id, p.name, p.code, p.commission_pct, p.clicks,
    (select count(*) from orders o where o.promoter_code = p.code and o.status = 'paid') as sales,
    (select coalesce(sum(o.face_total * p.commission_pct / 100), 0) from orders o where o.promoter_code = p.code and o.status = 'paid') as commission,
    p.tier, p.user_id
  from promoters p;
grant select on v_my_organisers, promoter_stats to authenticated;
-- organisers reopen a tier: capacity up, waitlist told
create or replace function notify_waitlist(p_tier uuid, p_reason text) returns int language plpgsql security definer as $$
declare n int := 0;
begin
  if auth.uid() is not null and not exists (select 1 from tiers t join events e on e.id = t.event_id where t.id = p_tier and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')) then raise exception 'forbidden'; end if;
  insert into message_log (tenant_id, user_id, channel, template, payload)
  select e.tenant_id, w.user_id, 'whatsapp', 'waitlist', jsonb_build_object('event', e.title, 'slug', e.slug, 'tier', t.name, 'reason', p_reason)
  from waitlist w join tiers t on t.id = w.tier_id join events e on e.id = t.event_id where w.tier_id = p_tier and w.notified_at is null;
  get diagnostics n = row_count;
  update waitlist set notified_at = now() where tier_id = p_tier and notified_at is null;
  return n;
end $$;
grant execute on function notify_waitlist(uuid, text) to authenticated;
-- refund queue for organisers
create or replace view v_org_refunds with (security_invoker = true) as
  select o.id, o.event_id, e.organiser_id, e.title as event_title, o.total, o.payment_method, o.addons, o.refund_status, o.refund_requested_at, o.paid_at, p.name as buyer, p.phone as buyer_phone
  from orders o join events e on e.id = o.event_id left join profiles p on p.id = o.buyer_id where o.refund_status is not null;
grant select on v_org_refunds to authenticated;
-- profiles: organisers may read the buyer name/phone of their own orders (needed by the refund queue and the door lookup)
drop policy if exists profiles_org_read on profiles;
create policy profiles_org_read on profiles for select using (exists (select 1 from orders o join events e on e.id = o.event_id where o.buyer_id = profiles.id and is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}')));
