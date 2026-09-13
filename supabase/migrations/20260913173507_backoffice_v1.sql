create policy orders_admin on orders for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy events_admin on events for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy tickets_admin on tickets for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy order_lines_admin on order_lines for select using (exists (select 1 from orders o where o.id = order_id and is_tenant_admin(o.tenant_id)));
create policy profiles_admin on profiles for select using (exists (select 1 from memberships m where m.user_id = profiles.id and is_tenant_admin(m.tenant_id)) or exists (select 1 from memberships m where m.user_id = auth.uid() and m.role in ('country_admin','super_admin')));
create policy memberships_admin on memberships for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy organisers_admin on organisers for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy venues_admin on venues for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy promoters_admin on promoters for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy promotion_orders_admin on promotion_orders for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy promo_codes_admin on promo_codes for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy payouts_admin on payouts for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy scans_admin on scans for select using (exists (select 1 from events e where e.id = event_id and is_tenant_admin(e.tenant_id)));
create policy tenants_admin on tenants for update using (is_tenant_admin(id)) with check (is_tenant_admin(id));
create policy message_log_admin on message_log for select using (is_tenant_admin(tenant_id));

create or replace view v_admin_orders with (security_invoker = true) as
select o.id, o.tenant_id, o.status, o.payment_method, o.payment_ref, o.currency, o.face_total, o.buyer_fee, o.discount, o.table_deposit, o.total, o.organiser_fee, o.processing_fee,
  o.promo_code, o.promoter_code, o.referral_code, o.paid_at, o.created_at, o.hold_expires_at,
  e.id as event_id, e.title as event_title, e.starts_at, e.organiser_id, org.name as organiser_name, v.name as venue_name,
  p.name as buyer_name, p.email as buyer_email, p.phone as buyer_phone,
  (select count(*) from tickets t where t.order_id = o.id) as ticket_count,
  (select count(*) from tickets t where t.order_id = o.id and t.state = 'scanned') as scanned_count,
  exists (select 1 from journals j where j.ref_type = 'order' and j.ref_id = o.id and j.kind = 'sale') as posted,
  exists (select 1 from provider_transactions x where x.order_id = o.id and x.status in ('matched','resolved')) as reconciled
from orders o join events e on e.id = o.event_id left join organisers org on org.id = e.organiser_id left join venues v on v.id = e.venue_id left join profiles p on p.id = o.buyer_id;
grant select on v_admin_orders to authenticated;

create or replace view v_admin_journals with (security_invoker = true) as
select j.id, j.tenant_id, j.posted_at, j.kind, j.stream, j.ref_type, j.ref_id, j.memo, j.reversal_of, j.posted_by, j.meta,
  (select coalesce(sum(l.debit),0) from journal_lines l where l.journal_id = j.id) as amount,
  (select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'kind', a.kind, 'partner_id', l.partner_id, 'partner', pt.name, 'debit', l.debit, 'credit', l.credit, 'memo', l.memo) order by l.id)
     from journal_lines l join accounts a on a.id = l.account_id left join partners pt on pt.id = l.partner_id where l.journal_id = j.id) as lines,
  exists (select 1 from journals r where r.reversal_of = j.id) as reversed
from journals j;
grant select on v_admin_journals to authenticated;

create or replace function post_adjustment(p_tenant uuid, p_memo text, p_lines jsonb) returns uuid language plpgsql security definer as $$
begin
  if not is_tenant_admin(p_tenant) then raise exception 'admin only'; end if;
  if coalesce(p_memo,'') = '' then raise exception 'memo required'; end if;
  return post_journal(p_tenant, 'adjustment', null, 'manual', null, p_memo, p_lines, null, jsonb_build_object('by', auth.uid()));
end $$;
create or replace function admin_reverse_journal(p_journal uuid, p_memo text) returns uuid language plpgsql security definer as $$
declare t uuid;
begin
  select tenant_id into t from journals where id = p_journal;
  if t is null or not is_tenant_admin(t) then raise exception 'admin only'; end if;
  return reverse_journal(p_journal, 'adjustment', coalesce(p_memo, 'Reversal'));
end $$;
create or replace function admin_order_action(p_order uuid, p_action text, p_ref text default null) returns text language plpgsql security definer as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or not is_tenant_admin(o.tenant_id) then raise exception 'admin only'; end if;
  if p_action = 'settle' then
    if not settle_reservation(o.id, p_ref) then raise exception 'order is not reserved'; end if; return 'paid';
  elsif p_action = 'refund' then
    if o.status <> 'paid' then raise exception 'only paid orders can be refunded'; end if;
    update tickets set state = 'void' where order_id = o.id and state in ('valid','reserved');
    update tiers t set sold = greatest(t.sold - l.qty, 0) from order_lines l where l.order_id = o.id and l.tier_id = t.id;
    update tables_vip set reserved_by_order = null where reserved_by_order = o.id;
    update orders set status = 'refunded', payment_ref = coalesce(p_ref, payment_ref) where id = o.id; return 'refunded';
  elsif p_action = 'cancel' then
    if o.status not in ('pending','reserved') then raise exception 'only pending/reserved orders can be cancelled'; end if;
    update tiers t set held = greatest(t.held - l.qty, 0) from order_lines l where l.order_id = o.id and l.tier_id = t.id;
    update tables_vip set reserved_by_order = null where reserved_by_order = o.id;
    update tickets set state = 'void' where order_id = o.id and state = 'reserved';
    update orders set status = 'cancelled' where id = o.id; return 'cancelled';
  elsif p_action = 'set_ref' then
    update orders set payment_ref = p_ref where id = o.id; return 'ok';
  end if;
  raise exception 'unknown action %', p_action;
end $$;
create or replace function admin_add_partner_member(p_partner uuid, p_email text, p_role text default 'viewer') returns boolean language plpgsql security definer as $$
declare uid uuid; t uuid;
begin
  select tenant_id into t from partners where id = p_partner;
  if t is null or not is_tenant_admin(t) then raise exception 'admin only'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then return false; end if;
  insert into partner_members (partner_id, user_id, role) values (p_partner, uid, p_role) on conflict (partner_id, user_id) do update set role = excluded.role;
  return true;
end $$;
create or replace function admin_set_membership(p_tenant uuid, p_email text, p_role tenant_role, p_organiser uuid default null, p_remove boolean default false) returns boolean language plpgsql security definer as $$
declare uid uuid;
begin
  if not is_tenant_admin(p_tenant) then raise exception 'admin only'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then return false; end if;
  if p_remove then delete from memberships where tenant_id = p_tenant and user_id = uid and role = p_role; return true; end if;
  insert into memberships (tenant_id, user_id, role, organiser_id) values (p_tenant, uid, p_role, p_organiser) on conflict (tenant_id, user_id, role) do update set organiser_id = excluded.organiser_id;
  return true;
end $$;
create or replace view v_admin_members with (security_invoker = true) as
select m.tenant_id, m.user_id, m.role, m.organiser_id, o.name as organiser_name, p.name, p.email, p.phone
from memberships m left join profiles p on p.id = m.user_id left join organisers o on o.id = m.organiser_id;
grant select on v_admin_members to authenticated;

create or replace view v_admin_daily with (security_invoker = true) as
select o.tenant_id, o.paid_at::date as day, count(*) as orders, sum(o.face_total - o.discount) as face_net, sum(o.buyer_fee + o.organiser_fee) as platform_rev, sum(o.total) as collected,
  sum(case when o.payment_method = 'cash_door' then o.total else 0 end) as cash_at_door
from orders o where o.status = 'paid' group by 1,2;
grant select on v_admin_daily to authenticated;

grant execute on function post_adjustment(uuid,text,jsonb), admin_reverse_journal(uuid,text), admin_order_action(uuid,text,text), admin_add_partner_member(uuid,text,text), admin_set_membership(uuid,text,tenant_role,uuid,boolean) to authenticated;
