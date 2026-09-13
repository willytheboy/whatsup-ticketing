-- WhatsUp Ticketing — demo seed (tenant "lb", WhatsUp Lebanon).
-- Idempotent: safe to re-run. Run after all migrations, as the postgres/service role.
-- Partners for the organiser and venues are created automatically by the partner_autocreate triggers.
begin;

insert into tenants (id, slug, name, brand)
values ('633bd22c-3fed-4292-95a9-3d75ea26052a', 'lb', 'WhatsUp Lebanon',
        '{"accent":"#D3302F","primary":"#1E7A3F","tagline":"Where every image is a story","instagram":"whatsuplebanon"}')
on conflict (slug) do nothing;

insert into organisers (id, tenant_id, name, name_ar, verified, payout_method)
values ('f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'WhatsUp Lebanon', 'واتس أب لبنان', true, 'whish')
on conflict (id) do nothing;

insert into venues (id, tenant_id, name, name_ar, city, city_ar) values
  ('47fee171-1728-45f3-87e6-b2059bdee17a', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Mar Mikhael Rooftop', 'سطح مار مخايل', 'Beirut', 'بيروت'),
  ('3b93fd19-0a33-49d5-97b4-96d88849cfba', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Arz Trailhead', 'مدخل درب الأرز', 'Bcharre', 'بشري'),
  ('930fa727-7b89-4944-8205-45faa23848d9', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Old Port Stage', 'مسرح المرفأ القديم', 'Batroun', 'البترون'),
  ('6afc6987-42b9-47e0-9bc4-28fc773d02f8', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Hamra Black Box', 'هامرا بلاك بوكس', 'Beirut', 'بيروت'),
  ('2d91eb5b-457b-4b2f-bd10-293b37d57738', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Jounieh Marina', 'مارينا جونية', 'Jounieh', 'جونية'),
  ('19eacef5-82ae-4908-9e4c-fc26ea36d401', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'Chekka Silos', 'صوامع شكا', 'Chekka', 'شكا')
on conflict (id) do nothing;

insert into events (id, tenant_id, organiser_id, venue_id, slug, title, title_ar, description, category, starts_at, doors_at, status) values
  ('941382e5-9ab9-4cc2-81a4-a768f1712c56', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '47fee171-1728-45f3-87e6-b2059bdee17a', 'sunset-sessions-rooftop', 'Sunset Sessions: Beirut Rooftop', 'جلسات الغروب: سطح بيروت', 'Golden hour, house and disco edits, and the best view of the port.', 'Music', '2026-09-18T16:00:00+00', '2026-09-18T16:00:00+00', 'live'),
  ('94a0de5b-5c64-4581-bec0-005055c6839c', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '3b93fd19-0a33-49d5-97b4-96d88849cfba', 'cedars-night-hike', 'Cedars Night Hike & Stargazing', 'مشي ليلي بين الأرز', 'Guided 6km night walk under the cedars with a telescope station at the summit.', 'Outdoors', '2026-09-19T17:30:00+00', '2026-09-19T17:30:00+00', 'live'),
  ('663fccf8-4d9c-44cc-9b5d-9810eea30ec0', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '930fa727-7b89-4944-8205-45faa23848d9', 'batroun-waterfront-fest', 'Batroun Waterfront Fest', 'مهرجان واجهة البترون', 'Two stages, twelve acts, lemonade stands, and the sea. Family-friendly until 10pm.', 'Festival', '2026-09-19T15:00:00+00', '2026-09-19T15:00:00+00', 'live'),
  ('64d6f78d-17ff-486f-8fa1-52c094aafdf9', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '6afc6987-42b9-47e0-9bc4-28fc773d02f8', 'comedy-night-bil-lebnene', 'Comedy Night: Bil Lebnene', 'ليلة كوميديا', 'Five comedians, one mic, strictly in Lebanese. 18+.', 'Comedy', '2026-09-20T18:00:00+00', '2026-09-20T18:00:00+00', 'live'),
  ('5d638ea9-64e9-4c62-b412-54c5709b8d76', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '2d91eb5b-457b-4b2f-bd10-293b37d57738', 'souk-el-akel-harvest', 'Souk el Akel: Harvest Edition', 'سوق الأكل', 'Forty producers from the Bekaa and the North. Free entry, ticketed tasting tour at 2pm.', 'Food', '2026-09-20T09:00:00+00', '2026-09-20T09:00:00+00', 'live'),
  ('8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1', '19eacef5-82ae-4908-9e4c-fc26ea36d401', 'techno-cement-works', 'Techno at the Cement Works', 'تكنو في معمل الإسمنت', 'All-night warehouse rave in a decommissioned cement silo.', 'Music', '2026-09-26T20:00:00+00', '2026-09-26T20:00:00+00', 'live')
on conflict (id) do nothing;

insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort) values
  ('d20287f0-2e48-4f90-ad44-7a145c6143ff', '941382e5-9ab9-4cc2-81a4-a768f1712c56', 'Early Bird', 'مبكر', 15, 120, 120, 0),
  ('1e7ae929-76c2-4cfb-8426-561a2cc3ce59', '941382e5-9ab9-4cc2-81a4-a768f1712c56', 'Regular', 'عادي', 25, 300, 190, 1),
  ('3c8700ca-6775-4931-a148-d7236523de68', '941382e5-9ab9-4cc2-81a4-a768f1712c56', 'VIP Loft', 'VIP', 60, 40, 31, 2),
  ('e2c079e1-37e6-4c11-9387-9b8c6c686fce', '94a0de5b-5c64-4581-bec0-005055c6839c', 'Hike only', null, 20, 60, 29, 0),
  ('5bcace8e-6388-43c4-802b-e2754f05656d', '94a0de5b-5c64-4581-bec0-005055c6839c', 'Hike + bus from Beirut', null, 35, 40, 26, 1),
  ('7fc4db65-3c48-42e5-9896-84c3dd4c44bb', '663fccf8-4d9c-44cc-9b5d-9810eea30ec0', 'Day pass', null, 10, 2000, 798, 0),
  ('adb491dd-1006-46c6-81c5-5ac01b586806', '663fccf8-4d9c-44cc-9b5d-9810eea30ec0', 'Weekend pass', null, 18, 800, 498, 1),
  ('87d79d08-0f18-498b-903e-5cffe153915f', '64d6f78d-17ff-486f-8fa1-52c094aafdf9', 'General', null, 12, 70, 39, 0),
  ('3d97ac0c-6f7c-46a5-8d4d-a2c43f91ba90', '64d6f78d-17ff-486f-8fa1-52c094aafdf9', 'Front row', null, 22, 10, 7, 1),
  ('fdae4bf7-4e89-418a-bbbd-938756901c29', '5d638ea9-64e9-4c62-b412-54c5709b8d76', 'Entry', null, 0, 5000, 903, 0),
  ('c3160459-7f39-4a46-a678-3afea7e49efc', '5d638ea9-64e9-4c62-b412-54c5709b8d76', 'Tasting tour', null, 15, 80, 59, 1),
  ('5d06e267-4e46-4d8e-812a-01b6d42c90b6', '8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', 'Phase 1', null, 20, 500, 500, 0),
  ('1edff068-51a7-4d11-b68d-3b4de0b960b4', '8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', 'Phase 2', null, 30, 700, 312, 1)
on conflict (id) do nothing;

insert into tables_vip (id, event_id, name, seats, min_spend, deposit) values
  ('6486d2bd-ce84-4b5a-b2ff-77ba3118adf1', '8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', 'Silo booth A', 8, 500, 250),
  ('c9fbeb6c-d9fe-4854-84d7-19f024f4c2d4', '8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', 'Silo booth B', 8, 500, 250)
on conflict (id) do nothing;

insert into promo_codes (id, tenant_id, code, pct_off, active)
values ('404d656d-a130-4687-95dc-9831d73ae806', '633bd22c-3fed-4292-95a9-3d75ea26052a', 'WHATSUP10', 10, true)
on conflict (id) do nothing;

commit;

-- Staff accounts: create the users in Supabase Auth (email + password), then grant roles.
-- The handle_new_user trigger creates the profile row; memberships are granted by a tenant admin:
--   select admin_set_membership('633bd22c-3fed-4292-95a9-3d75ea26052a', 'you@example.com', 'super_admin', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1');
-- For the very first admin (no admin exists yet) insert the membership directly with the service role:
--   insert into memberships (tenant_id, user_id, role, organiser_id)
--   values ('633bd22c-3fed-4292-95a9-3d75ea26052a', '<auth.users.id>', 'super_admin', 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1');
