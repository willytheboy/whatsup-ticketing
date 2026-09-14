-- fan credit ledger helper (service role only: called from edge functions)
create or replace function add_credit(p_user uuid, p_amount numeric) returns numeric language plpgsql security definer as $$
declare c numeric;
begin
  update profiles set credit = greatest(coalesce(credit, 0) + p_amount, 0) where id = p_user returning credit into c;
  return c;
end $$;
revoke execute on function add_credit(uuid, numeric) from public, anon, authenticated;

-- expired checkouts put parked resale-pool tickets back on sale, on top of releasing tier holds and tables
create or replace function expire_holds() returns integer language plpgsql security definer as $$
declare n int := 0; r record;
begin
  for r in select o.id, o.meta from orders o where o.status in ('pending','reserved') and o.hold_expires_at < now() loop
    update tiers t set held = greatest(t.held - l.qty, 0) from order_lines l where l.order_id = r.id and l.tier_id = t.id;
    update tables_vip set reserved_by_order = null where reserved_by_order = r.id;
    update tickets set state = 'void' where order_id = r.id and state = 'reserved';
    if r.meta ? 'resale' then
      update tickets set state = 'resale' where state = 'reserved' and id in (select (jsonb_array_elements_text(v))::uuid from jsonb_each(r.meta->'resale') as x(k, v));
    end if;
    update orders set status = 'expired' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
