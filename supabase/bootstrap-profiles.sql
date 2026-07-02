-- Run this after creating users in Supabase Authentication.
-- Replace the email/name values before running.

-- 1. Make one existing auth user the first admin.
insert into profiles (user_id, role, display_name)
select id, 'admin', 'Jun Wei'
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update
set role = 'admin',
    display_name = excluded.display_name,
    member_id = null;

-- 2. Link an existing auth user to a member account.
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
insert into profiles (user_id, member_id, role, display_name)
select user_row.user_id, member_row.id, 'member', 'Jun Wei'
from user_row, member_row
on conflict (user_id) do update
set member_id = excluded.member_id,
    role = 'member',
    display_name = excluded.display_name;
