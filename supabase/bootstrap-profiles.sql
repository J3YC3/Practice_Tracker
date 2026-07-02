-- Run this after creating users in Supabase Authentication.
-- Replace the example email/name values before running in Supabase SQL Editor.

-- 1. Make one existing auth user the first admin.
insert into profiles (user_id, role, is_admin, display_name, email, require_password_reset)
select id, 'admin', true, 'Jun Wei', email, false
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update
set role = 'admin',
    is_admin = true,
    display_name = excluded.display_name,
    email = excluded.email,
    require_password_reset = false,
    member_id = null;

-- 2. Optional: link an existing auth user to a member account.
with member_row as (
  insert into members (name, role, group_name, phone)
  values ('Jun Wei', 'Section Leader', 'Snare', '')
  returning id
),
user_row as (
  select id as user_id
  from auth.users
  where email = 'junwei@example.com'
)
insert into profiles (user_id, member_id, role, is_admin, display_name, email, require_password_reset)
select user_row.user_id, member_row.id, 'member', false, 'Jun Wei', 'junwei@example.com', true
from user_row, member_row
on conflict (user_id) do update
set member_id = excluded.member_id,
    role = 'member',
    is_admin = profiles.is_admin,
    display_name = excluded.display_name,
    email = excluded.email,
    require_password_reset = excluded.require_password_reset;
