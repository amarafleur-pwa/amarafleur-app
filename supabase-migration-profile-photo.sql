-- Run this in the Supabase SQL Editor (Database > SQL Editor)

-- Lets each named account carry its own profile photo across devices
alter table app_users add column photo_url text;
