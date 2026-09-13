-- views must respect the caller's RLS, not the owner's
alter view organiser_event_stats set (security_invoker = true);
alter view organiser_daily_sales set (security_invoker = true);
alter view promoter_stats set (security_invoker = true);
-- buyers need to read their own order rows' events/tiers even when an event later leaves 'live' — covered by events_public (ended included).
-- profile auto-create on first login
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, phone, email, name, referral_code)
  values (new.id, new.phone, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,'guest'),'@',1)), gen_referral_code(coalesce(new.raw_user_meta_data->>'name','WU')))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
-- public read of event slugs for routing
create index if not exists events_slug on events(tenant_id, slug);
