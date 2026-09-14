-- Demo data v2 for the Lebanon tenant: multi-vertical listings (beach, dining, stay, pass), deals, items, a promoter, venue stations.
-- Idempotent; fixed UUIDs so the app's deep links stay stable. Run after seed/demo.sql.
do $$
declare tid uuid := '633bd22c-3fed-4292-95a9-3d75ea26052a'; oid uuid := 'f717cfcd-0e0e-4a14-8b56-6565cbe590c1';
begin
  -- geo for the existing venues (lat, lng)
  update venues set lat = 33.8958, lng = 35.5215, address = 'Armenia Street, Mar Mikhael' where id = '47fee171-1728-45f3-87e6-b2059bdee17a';
  update venues set lat = 34.2440, lng = 36.0480, address = 'Cedars of God, Bcharre' where id = '3b93fd19-0a33-49d5-97b4-96d88849cfba';
  update venues set lat = 34.2553, lng = 35.6588, address = 'Batroun old port' where id = '930fa727-7b89-4944-8205-45faa23848d9';
  update venues set lat = 33.8965, lng = 35.4800, address = 'Hamra Street' where id = '6afc6987-42b9-47e0-9bc4-28fc773d02f8';
  update venues set lat = 33.9808, lng = 35.6178, address = 'Jounieh old souk, by the marina' where id = '2d91eb5b-457b-4b2f-bd10-293b37d57738';
  update venues set lat = 34.3210, lng = 35.7160, address = 'Chekka coastal highway' where id = '19eacef5-82ae-4908-9e4c-fc26ea36d401';

  insert into venues (id, tenant_id, name, name_ar, city, city_ar, address, lat, lng) values
    ('a1e2c4b6-0001-4a11-9c01-000000000001', tid, 'Batroun Rocks Beach House', 'بيت البحر عالصخور', 'Batroun', 'البترون', 'Batroun coastal road', 34.2417, 35.6577),
    ('a1e2c4b6-0002-4a11-9c01-000000000002', tid, 'Beit Douma', 'بيت دوما', 'Douma', 'دوما', 'Douma old town, Batroun district', 34.2044, 35.7772)
  on conflict (id) do nothing;

  -- tier kinds on what already exists
  update tiers set kind = 'daypass' where id = '7fc4db65-3c48-42e5-9896-84c3dd4c44bb';   -- Batroun fest day pass
  update events set pinned = 'Doors 7 pm · DJ set from 9 · 2 VIP tables left', pinned_ar = 'الأبواب ٧ · الدي جي من ٩ · باقي طاولتين VIP',
    deals = '[{"id":"friend","name":"Bring a friend free this Friday","name_ar":"جيب صاحبك ببلاش هالجمعة"}]' where slug = 'sunset-sessions-rooftop';
  update events set pinned = 'Bibs at the trailhead from 5 pm · bring a headlamp', deals = '[{"id":"lemonade","name":"Free tea at the summit for ticket holders","name_ar":"شاي ببلاش عالقمة لحاملي التذاكر"}]' where slug = 'cedars-night-hike';
  update events set deals = '[{"id":"lemonade","name":"Free lemonade with any stall purchase","name_ar":"ليموناضة ببلاش مع أي شراء"}]', pinned = 'Parking at the municipality lot' where slug = 'souk-el-akel-harvest';
  update events set pinned = 'Silo booth A and B still open · shuttle every hour from Beirut' where slug = 'techno-cement-works';

  -- items on existing events
  insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort, kind, per_order_limit, note) values
    ('b2f3d5c7-0001-4b22-9d02-000000000001', '8516e3bc-e06c-4ac7-a2ed-73886d8e6e39', 'Shuttle from Beirut, round trip', 'باص من بيروت رايح راجع', 15, 120, 44, 9, 'item', 10, 'Leaves Dora 9 pm, back at 5 am'),
    ('b2f3d5c7-0002-4b22-9d02-000000000002', '663fccf8-4d9c-44cc-9b5d-9810eea30ec0', 'Festival tee', 'تي شيرت المهرجان', 15, 300, 96, 9, 'item', 20, 'Pick up at the merch tent')
  on conflict (id) do nothing;

  -- beach club (venue listing): day pass covered by the pass, cabana, towel kit, a deal
  insert into events (id, tenant_id, organiser_id, venue_id, slug, title, title_ar, description, description_ar, category, kind, starts_at, ends_at, doors_at, status, pinned, pinned_ar, deals) values
    ('c3a4e6d8-0001-4c33-9e03-000000000001', tid, oid, 'a1e2c4b6-0001-4a11-9c01-000000000001', 'batroun-rocks', 'Batroun Rocks Beach House', 'بيت البحر عالصخور',
     'Rocks, a bar, the sea. Sunbeds book out by noon on weekends; members walk in.', 'صخور، بار، بحر. الأسرّة بتخلص الضهر بالويكند؛ الأعضاء بيفوتوا دغري.',
     'Beach', 'venue', now()::date + time '08:00', now()::date + interval '120 days', now()::date + time '08:00', 'live', 'Sea flat today · Kiosk open till 7', 'البحر هادي اليوم · الكشك مفتوح لـ ٧',
     '[{"id":"cocktails","name":"2-for-1 sunset cocktails, 5 to 7 pm","name_ar":"كوكتيل ٢ بـ ١ من ٥ لـ ٧"}]')
  on conflict (id) do nothing;
  insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort, kind, per_order_limit, member_free, note) values
    ('b2f3d5c7-0101-4b22-9d02-000000000101', 'c3a4e6d8-0001-4c33-9e03-000000000001', 'Sunbed day pass', 'دخول يومي مع سرير', 15, 60, 41, 0, 'daypass', 10, true, null),
    ('b2f3d5c7-0102-4b22-9d02-000000000102', 'c3a4e6d8-0001-4c33-9e03-000000000001', 'Cabana for the day (6)', 'كبانة لليوم (٦)', 120, 8, 6, 1, 'daypass', 2, false, 'Includes six sunbeds and a cooler'),
    ('b2f3d5c7-0103-4b22-9d02-000000000103', 'c3a4e6d8-0001-4c33-9e03-000000000001', 'Kayak, 1 hour', 'كاياك، ساعة', 20, 6, 2, 2, 'item', 4, false, 'Pick up at the kiosk'),
    ('b2f3d5c7-0104-4b22-9d02-000000000104', 'c3a4e6d8-0001-4c33-9e03-000000000001', 'Towel and sunscreen kit', 'منشفة وواقي شمس', 12, 60, 22, 3, 'item', 6, false, 'Pick up at the kiosk')
  on conflict (id) do nothing;

  -- dining (venue listing with tables)
  insert into events (id, tenant_id, organiser_id, venue_id, slug, title, title_ar, description, description_ar, category, kind, starts_at, ends_at, doors_at, status, deals) values
    ('c3a4e6d8-0002-4c33-9e03-000000000002', tid, oid, '2d91eb5b-457b-4b2f-bd10-293b37d57738', 'marina-fish-house', 'Marina Fish House', 'بيت السمك عالمارينا',
     'Fish by the fishing boats. Tables for two to twelve; no booking fee, deposit only on Friday and Saturday.', 'سمك عند القوارب. طاولات من شخصين لـ ١٢؛ بلا رسوم حجز، عربون بس الجمعة والسبت.',
     'Dining', 'venue', now()::date + time '19:00', now()::date + interval '120 days', now()::date + time '19:00', 'live',
     '[{"id":"members","name":"15% off for pass holders","name_ar":"١٥٪ خصم لحاملي الاشتراك","member_only":true}]')
  on conflict (id) do nothing;
  insert into tables_vip (id, event_id, name, name_ar, seats, min_spend, deposit) values
    ('d4b5f7e9-0001-4d44-9f04-000000000001', 'c3a4e6d8-0002-4c33-9e03-000000000002', 'Table by the water', 'طاولة عالمي', 4, 0, 0),
    ('d4b5f7e9-0002-4d44-9f04-000000000002', 'c3a4e6d8-0002-4c33-9e03-000000000002', 'Long table (8)', 'طاولة طويلة (٨)', 8, 0, 40),
    ('d4b5f7e9-0003-4d44-9f04-000000000003', 'c3a4e6d8-0002-4c33-9e03-000000000002', 'Terrace table', 'طاولة عالتراس', 4, 0, 0)
  on conflict (id) do nothing;
  insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort, kind, per_order_limit, note) values
    ('b2f3d5c7-0201-4b22-9d02-000000000201', 'c3a4e6d8-0002-4c33-9e03-000000000002', 'Chef''s mezze box to take home', 'صندوق مازة من الشيف', 35, 20, 6, 0, 'item', 4, 'Pick up at the counter')
  on conflict (id) do nothing;

  -- stay
  insert into events (id, tenant_id, organiser_id, venue_id, slug, title, title_ar, description, description_ar, category, kind, starts_at, ends_at, doors_at, status) values
    ('c3a4e6d8-0003-4c33-9e03-000000000003', tid, oid, 'a1e2c4b6-0002-4a11-9c01-000000000002', 'beit-douma', 'Beit Douma guest house', 'بيت دوما',
     'Stone house, four rooms, breakfast on the terrace. Instant confirmation, cancel free until 48h before.', 'بيت حجر، أربع غرف، فطور عالتراس. تأكيد فوري، إلغاء مجاني حتى ٤٨ ساعة قبل.',
     'Stay', 'stay', now()::date + time '15:00', now()::date + interval '120 days', now()::date + time '15:00', 'live')
  on conflict (id) do nothing;
  insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort, kind, per_order_limit, note) values
    ('b2f3d5c7-0301-4b22-9d02-000000000301', 'c3a4e6d8-0003-4c33-9e03-000000000003', 'Double room with breakfast', 'غرفة مزدوجة مع فطور', 95, 4, 2, 0, 'stay', 14, 'Fri to Sun'),
    ('b2f3d5c7-0302-4b22-9d02-000000000302', 'c3a4e6d8-0003-4c33-9e03-000000000003', 'Family suite', 'جناح عائلي', 160, 1, 0, 1, 'stay', 14, null),
    ('b2f3d5c7-0303-4b22-9d02-000000000303', 'c3a4e6d8-0003-4c33-9e03-000000000003', 'Douma hike with guide, Saturday', 'مشي بدوما مع دليل، السبت', 35, 12, 5, 2, 'item', 6, 'Meet at the church square, 8 am')
  on conflict (id) do nothing;

  -- pass (membership): three plans as pass tiers; day passes flagged member_free are covered
  insert into events (id, tenant_id, organiser_id, venue_id, slug, title, title_ar, description, description_ar, category, kind, starts_at, ends_at, doors_at, status) values
    ('c3a4e6d8-0004-4c33-9e03-000000000004', tid, oid, 'a1e2c4b6-0001-4a11-9c01-000000000001', 'summer-pass-2027', 'Summer Pass 2027', 'اشتراك الصيف ٢٠٢٧',
     'Unlimited entry to the partner beach clubs, 15% off dining at partner restaurants, two guests at member rate. Plan a visit the night before, check in with your QR.',
     'دخول غير محدود لنوادي البحر الشريكة، ١٥٪ خصم بالمطاعم الشريكة، ضيفين بسعر الأعضاء.',
     'Beach', 'pass', now()::date + time '08:00', now()::date + interval '365 days', now()::date + time '08:00', 'live')
  on conflict (id) do nothing;
  insert into tiers (id, event_id, name, name_ar, face_price, capacity, sold, sort, kind, per_order_limit, plan_months) values
    ('b2f3d5c7-0401-4b22-9d02-000000000401', 'c3a4e6d8-0004-4c33-9e03-000000000004', 'Monthly', 'شهري', 89, 9999, 212, 0, 'pass', 1, 1),
    ('b2f3d5c7-0402-4b22-9d02-000000000402', 'c3a4e6d8-0004-4c33-9e03-000000000004', 'Season', 'موسمي', 320, 9999, 480, 1, 'pass', 1, 4),
    ('b2f3d5c7-0403-4b22-9d02-000000000403', 'c3a4e6d8-0004-4c33-9e03-000000000004', 'Annual', 'سنوي', 540, 9999, 96, 2, 'pass', 1, 12)
  on conflict (id) do nothing;

  -- a promoter on the organiser
  insert into promoters (id, tenant_id, organiser_id, name, code, commission_pct, clicks) values
    ('e5c6a8f0-0001-4e55-9a05-000000000001', tid, oid, 'Nour K.', 'NOUR-WU', 8, 38) on conflict (id) do nothing;

  -- venue stations (offline until a venue goes live from the back office)
  insert into streams (id, tenant_id, venue_id, slug, title, title_ar, kind, source, access, status, description) values
    ('f6d7b9a1-0001-4f66-9b06-000000000001', tid, '47fee171-1728-45f3-87e6-b2059bdee17a', 'rooftop-residents', 'Rooftop residents', 'مقيمين السطح', 'audio', 'hls', 'public', 'offline', 'Resident DJs from the Mar Mikhael rooftop. Venue-owned.'),
    ('f6d7b9a1-0002-4f66-9b06-000000000002', tid, '2d91eb5b-457b-4b2f-bd10-293b37d57738', 'marina-dinner-set', 'Marina dinner set', 'سهرة المارينا', 'audio', 'hls', 'public', 'offline', 'Oud and old Beirut, live from the marina on weekends.')
  on conflict (id) do nothing;
end $$;
