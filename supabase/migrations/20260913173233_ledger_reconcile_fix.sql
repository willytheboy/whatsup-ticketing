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
  select count(*) into missing from orders oo where oo.tenant_id = b.tenant_id and oo.payment_method::text = b.provider and oo.status = 'paid'
    and oo.paid_at::date between coalesce(b.period_start, '1900-01-01') and coalesce(b.period_end, '2999-12-31')
    and not exists (select 1 from provider_transactions x where x.batch_id = b.id and x.order_id = oo.id);
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
