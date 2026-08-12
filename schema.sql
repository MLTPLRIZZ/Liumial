-- schema.sql: Supabase / Postgres schema for Liumial

create extension if not exists pgcrypto;

-- profiles (users)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text,
  bio text,
  avatar_color text,
  bg text,
  xp int default 0,
  badges text[],
  created_at timestamptz default now()
);

-- servers
create table if not exists servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- channels
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id) not null,
  name text not null,
  created_at timestamptz default now()
);

-- messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references servers(id),
  channel_id uuid references channels(id),
  author_id uuid references profiles(id),
  content text,
  ts timestamptz default now()
);

create index if not exists idx_messages_channel_ts on messages(channel_id, ts);
