-- Supabase SQL Editor'da bir kez çalıştırın.
create extension if not exists "pgcrypto";

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name text not null,
  public_url text not null,
  source_url text,
  cloudinary_public_id text,
  mime_type text,
  size_bytes bigint,
  status text not null default 'ready' check (status in ('ready','failed','queued')),
  created_at timestamptz not null default now()
);

create table if not exists public.link_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  unique(owner_id, url)
);

create table if not exists public.publish_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  account_key text,
  caption text not null default '',
  status text not null default 'queued' check (status in ('queued','processing','published','failed')),
  instagram_container_id text,
  instagram_media_id text,
  error_message text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.publish_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  queue_id uuid references public.publish_queue(id) on delete set null,
  level text not null default 'info' check (level in ('info','error','warning')),
  status text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists publish_queue_owner_status_idx on public.publish_queue(owner_id,status);
create index if not exists publish_logs_owner_created_idx on public.publish_logs(owner_id,created_at desc);

alter table public.media_assets enable row level security;
alter table public.link_queue enable row level security;
alter table public.publish_queue enable row level security;
alter table public.publish_logs enable row level security;

-- Tek kullanıcı için bile RLS açık kalır; yalnızca giriş yapan kullanıcı kendi satırlarını görür.
create policy "own media" on public.media_assets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own links" on public.link_queue for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own queue" on public.publish_queue for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own logs" on public.publish_logs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Realtime is optional; ilk sürüm 30 saniyelik yenileme kullanır.
-- İsterseniz Supabase Dashboard > Database > Publications bölümünden publish_queue ekleyebilirsiniz.
