-- v0.8.0 — WhatsApp-native selling, statement delivery
-- Additive.

-- ---- inbound WhatsApp conversations (the concierge answers people who message the business number) ----
create table if not exists wa_conversations (
  phone text primary key,                       -- digits, international, no plus
  tenant_id uuid references tenants(id),
  user_id uuid,                                 -- profiles.id when the number belongs to a signed-up person
  lang text not null default 'en',
  history jsonb not null default '[]'::jsonb,   -- last turns [{who:'user'|'bot', text, at}]
  cart jsonb,                                   -- {slug, tier_id, name, qty} the person is about to book
  handoff boolean not null default false,       -- a human has been asked for; the bot stays quiet until cleared
  messages int not null default 0,
  last_in_at timestamptz,
  last_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table wa_conversations enable row level security;
drop policy if exists wa_conversations_admin on wa_conversations;
create policy wa_conversations_admin on wa_conversations for all using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create index if not exists wa_conversations_tenant_idx on wa_conversations (tenant_id, updated_at desc);

-- message_log gains an inbound channel value; outbound replies are template 'wa_reply' (free-form text inside the 24-hour window)
comment on column message_log.channel is 'whatsapp | email | whatsapp_in (inbound message, payload.text)';

-- ---- partner statements delivered by WhatsApp / email: message_log template ''statement'' with the statement JSON ----
-- (no schema change; the notify function renders it and the back office queues it from /admin/settlements)

-- tenant admins queue outbound messages (partner statements) from the back office
drop policy if exists message_log_admin_insert on message_log;
create policy message_log_admin_insert on message_log for insert with check (is_tenant_admin(tenant_id));
