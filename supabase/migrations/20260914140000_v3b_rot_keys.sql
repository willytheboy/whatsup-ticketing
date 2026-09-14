-- rotating QR tokens (WU2): a per-ticket key the holder's device uses to mint a fresh token every 2 minutes
alter table tickets add column if not exists rot_key text;
-- door "collect at door" for reserved orders and refunds by the organiser
create or replace function door_collect(p_order uuid) returns boolean language plpgsql security definer as $$
declare o orders%rowtype; l record;
begin
  select * into o from orders where id = p_order; if not found then raise exception 'order'; end if;
  if not exists (select 1 from events e where e.id = o.event_id and is_org_member(e.organiser_id, '{organiser,door,country_admin,super_admin}')) then raise exception 'forbidden'; end if;
  if o.status <> 'reserved' then return false; end if;
  update orders set status = 'paid', paid_at = now() where id = p_order;
  update tickets set state = 'valid' where order_id = p_order and state = 'reserved';
  for l in select tier_id, qty from order_lines where order_id = p_order and tier_id is not null loop perform confirm_sale(l.tier_id, l.qty); end loop;
  return true;
end $$;
grant execute on function door_collect(uuid) to authenticated;
create or replace function org_refund_order(p_order uuid, p_decision text) returns boolean language plpgsql security definer as $$
declare o orders%rowtype; l record;
begin
  select * into o from orders where id = p_order; if not found then raise exception 'order'; end if;
  if not exists (select 1 from events e where e.id = o.event_id and is_org_member(e.organiser_id, '{organiser,country_admin,super_admin}')) then raise exception 'forbidden'; end if;
  if p_decision = 'declined' then update orders set refund_status = 'declined' where id = p_order; return true; end if;
  if o.status <> 'paid' then return false; end if;
  update orders set status = 'refunded', refund_status = 'refunded' where id = p_order;
  update tickets set state = 'void' where order_id = p_order and state in ('valid','resale');
  for l in select tier_id, qty from order_lines where order_id = p_order and tier_id is not null loop update tiers set sold = greatest(sold - l.qty, 0) where id = l.tier_id; end loop;
  update tables_vip set reserved_by_order = null where reserved_by_order = p_order;
  update profiles set credit = coalesce(credit, 0) + o.total where id = o.buyer_id and o.payment_method = 'credit';
  insert into message_log (tenant_id, user_id, channel, template, payload) values (o.tenant_id, o.buyer_id, 'whatsapp', 'refund', jsonb_build_object('order_id', o.id, 'total', o.total, 'method', o.payment_method));
  return true;
end $$;
grant execute on function org_refund_order(uuid, text) to authenticated;
