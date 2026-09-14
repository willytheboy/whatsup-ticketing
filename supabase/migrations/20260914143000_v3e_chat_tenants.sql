-- people can delete their own messages in a room
drop policy if exists chat_delete_own on chat_messages;
create policy chat_delete_own on chat_messages for delete using (user_id = auth.uid());
-- super-admins may create tenants directly from the back office too (create_tenant is the normal path)
drop policy if exists tenants_super_insert on tenants;
create policy tenants_super_insert on tenants for insert with check (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'super_admin'));
-- coming-soon countries on the city sheet come from the tenants table, not from code
insert into tenants (slug, name, country, country_ar, base_currency, display_currency, fx_rate, live, brand)
values ('ae', 'What''s Up UAE', 'UAE', 'الإمارات', 'AED', 'AED', 1, false, '{"word":"UAE"}'), ('eg', 'What''s Up Egypt', 'Egypt', 'مصر', 'EGP', 'EGP', 1, false, '{"word":"Egypt"}')
on conflict (slug) do update set live = excluded.live, country = excluded.country, country_ar = excluded.country_ar;
update tenants set country = 'Lebanon', country_ar = 'لبنان' where slug = 'lb';
