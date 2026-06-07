-- Run this in the Supabase SQL Editor (Database > SQL Editor)

-- 1. Global account registry: tracks the up-to-3 claimed names
create table app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  claimed_at timestamptz not null default now()
);

alter table app_users enable row level security;

create policy "anon can read app_users"
  on app_users for select
  to anon
  using (true);

create policy "anon can claim app_users"
  on app_users for insert
  to anon
  with check (true);

create policy "anon can release app_users"
  on app_users for delete
  to anon
  using (true);

-- 2. Attribution column on every entry table
alter table orders add column logged_by text;
alter table payments add column logged_by text;
alter table personal_expenses add column logged_by text;
alter table business_expenses add column logged_by text;
alter table customers add column logged_by text;
