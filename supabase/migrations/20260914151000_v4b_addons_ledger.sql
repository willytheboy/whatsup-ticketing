-- v0.7.0b — add-ons in the order journal
-- Listing add-ons (fast lane, parking…) are organiser revenue like table deposits; refund protection is platform revenue.
-- post_journal skips zero-amount lines, so orders without add-ons post exactly as before.

create or replace function post_order(p_order uuid) returns uuid language plpgsql security definer as $$
declare o orders%rowtype; e events%rowtype; org_partner uuid; jid uuid; collect_code text; collected numeric; org_net numeric; plat numeric;
        pr promoters%rowtype; prom_partner uuid; comm numeric; rules jsonb; face_net numeric; addons_org numeric; protection numeric;
begin
  select * into o from orders where id = p_order;
  if not found or o.status <> 'paid' then return null; end if;
  select id into jid from journals where ref_type = 'order' and ref_id = p_order and kind = 'sale';
  if jid is not null then return jid; end if;
  select * into e from events where id = o.event_id;
  org_partner := ensure_partner(o.tenant_id, 'organiser', (select name from organisers where id = e.organiser_id), p_org => e.organiser_id);
  face_net := o.face_total - o.discount;
  -- v0.7: listing add-ons (fast lane, parking…) are organiser revenue; refund protection is platform revenue
  select coalesce(sum((a->>'amount')::numeric) filter (where a->>'kind' = 'addon'), 0), coalesce(sum((a->>'amount')::numeric) filter (where a->>'kind' = 'refund_protection'), 0)
    into addons_org, protection from jsonb_array_elements(coalesce(o.addons, '[]'::jsonb)) a;
  org_net := round(face_net + o.table_deposit + addons_org - o.organiser_fee - o.processing_fee, 2);
  plat := round(o.buyer_fee + o.organiser_fee, 2);
  collected := round(face_net + o.buyer_fee + o.table_deposit + addons_org + protection - coalesce(o.credit_used,0), 2);
  collect_code := case when o.payment_method = 'cash_door' then 'receivable:' || org_partner else 'clearing:' || coalesce(o.payment_method::text, 'card') end;
  jid := post_journal(o.tenant_id, 'sale', 'tickets', 'order', o.id, 'Order ' || left(o.id::text, 8) || ' · ' || e.title,
    jsonb_build_array(
      jsonb_build_object('code', collect_code, 'partner', case when o.payment_method = 'cash_door' then org_partner end, 'debit', collected, 'memo', 'collected via ' || o.payment_method),
      jsonb_build_object('code', 'buyer_credit', 'debit', coalesce(o.credit_used,0), 'memo', 'credit redeemed'),
      jsonb_build_object('code', 'payable:' || org_partner, 'partner', org_partner, 'credit', org_net, 'memo', 'net ticket revenue'),
      jsonb_build_object('code', 'rev:tickets', 'credit', plat, 'memo', 'buyer fee + organiser fee'),
      jsonb_build_object('code', 'rev:protection', 'credit', protection, 'memo', 'refund protection'),
      jsonb_build_object('code', 'processing_recovery', 'credit', o.processing_fee, 'memo', 'processing fee charged')),
    null, jsonb_build_object('face', o.face_total, 'discount', o.discount, 'buyer_fee', o.buyer_fee, 'organiser_fee', o.organiser_fee, 'processing_fee', o.processing_fee, 'deposit', o.table_deposit, 'addons', addons_org, 'protection', protection, 'method', o.payment_method));
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

-- the public API returns add-ons on orders (POS and door hardware act on fast lane / parking)
create or replace function api_orders(p_key text, p_since timestamptz default now() - interval '30 days') returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'event_id', o.event_id, 'event', e.title, 'status', o.status, 'method', o.payment_method, 'face_total', o.face_total, 'buyer_fee', o.buyer_fee, 'total', o.total, 'addons', coalesce(o.addons, '[]'::jsonb), 'paid_at', o.paid_at, 'created_at', o.created_at,
    'lines', (select jsonb_agg(jsonb_build_object('tier_id', l.tier_id, 'qty', l.qty, 'unit_face', l.unit_face)) from order_lines l where l.order_id = o.id),
    'tickets', (select jsonb_agg(jsonb_build_object('code', t.code, 'state', t.state, 'scanned_at', t.scanned_at)) from tickets t where t.order_id = o.id)) order by o.created_at desc), '[]')
  from orders o join events e on e.id = o.event_id where e.organiser_id = api_key_org(p_key) and o.created_at >= p_since
$$;
