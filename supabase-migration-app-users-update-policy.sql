-- Run this in the Supabase SQL Editor (Database > SQL Editor)

-- Allows updating an app_users row (e.g. profile photo) — was missing,
-- so photo_url updates were silently blocked by RLS (0 rows affected, no error)
create policy "anon can update app_users"
  on app_users for update
  to anon
  using (true)
  with check (true);
