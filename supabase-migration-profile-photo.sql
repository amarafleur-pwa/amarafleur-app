-- Run this in the Supabase SQL Editor (Database > SQL Editor)

-- Lets each named account carry its own profile photo across devices
alter table app_users add column photo_url text;

-- Push photo_url updates to other devices in realtime
alter publication supabase_realtime add table app_users;
