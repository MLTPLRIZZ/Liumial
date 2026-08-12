-- schema.sql — Supabase schema additions for Liumial
-- Run this in Supabase SQL editor for shared servers, invites, messages and conversations.

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- Profiles (if not present)
create table if not exists profiles (
  id text primary key,
  username text unique,
  display_name text,
  avatar_color text,
  bg text,
  bio text,
  xp integer default 0,
  badges jsonb default '[]'::jsonb,
  luminal integer default 0,
  last_daily_claim timestamptz,
  created_at timestamptz default now()
);

-- Servers: members, public flag, invite code (10-digit), roles JSON
alter table servers
  add column if not exists members jsonb default '[]'::jsonb,
  add column if not exists public boolean default true,
  add column if not exists invite_code text,
  add column if not exists roles jsonb default '{}'::jsonb;

-- Channels table (if not exists)
create table if not exists channels (
  id text primary key,
  server_id text references servers(id),
  name text,
  created_at timestamptz default now()
);

-- Messages: optionally add image_url, reply_to, conversation_id
alter table messages
  add column if not exists image_url text,
  add column if not exists reply_to uuid,
  add column if not exists conversation_id uuid;

-- Conversations for DMs (optional)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null, -- 'channel' or 'dm'
  server_id text,
  name text,
  created_at timestamptz default now()
);

create table if not exists conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  user_id text references profiles(id),
  joined_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_messages_server_channel_ts on messages(server_id, channel_id, ts);
create index if not exists idx_conversation_members_user on conversation_members(user_id);
