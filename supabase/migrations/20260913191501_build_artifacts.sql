-- Deployment helper: source bundles (tar.gz, base64) fetched by the Vercel build step. Not part of the product schema.
create table if not exists build_artifacts (
  name text primary key,
  key text not null,
  data text not null,
  bytes int not null default 0,
  version text,
  updated_at timestamptz not null default now()
);
alter table build_artifacts enable row level security;
create or replace function get_build_artifact(p_name text, p_key text) returns text language sql stable security definer as $$
  select data from build_artifacts where name = p_name and key = p_key
$$;
revoke all on build_artifacts from anon, authenticated;
grant execute on function get_build_artifact(text, text) to anon;
