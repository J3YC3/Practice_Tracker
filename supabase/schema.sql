create extension if not exists "uuid-ossp";

create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  role text not null default 'Member',
  group_name text not null default 'General',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  create type user_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references auth.users(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  role user_role not null default 'member',
  display_name text not null default '',
  email text,
  require_password_reset boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists email text;
alter table profiles add column if not exists require_password_reset boolean not null default false;

create table if not exists training_sessions (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  late_after_minutes integer not null default 10,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type attendance_status as enum ('present', 'late', 'absent', 'excused');
exception
  when duplicate_object then null;
end $$;

create table if not exists attendance_records (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  session_id uuid not null references training_sessions(id) on delete cascade,
  status attendance_status not null,
  reason text,
  created_at timestamptz not null default now(),
  unique(member_id, session_id)
);

create table if not exists workout_metrics (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references training_sessions(id) on delete cascade,
  name text not null,
  unit text not null default 'reps',
  target numeric
);

create table if not exists workout_records (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  session_id uuid references training_sessions(id) on delete set null,
  metric_id uuid not null references workout_metrics(id) on delete cascade,
  value numeric not null,
  remark text,
  recorded_at timestamptz not null default now(),
  unique(member_id, session_id, metric_id)
);

create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_label text not null,
  score integer not null check (score between 0 and 100),
  feedback text not null default '',
  created_at timestamptz not null default now()
);

alter table members enable row level security;
alter table profiles enable row level security;
alter table training_sessions enable row level security;
alter table attendance_records enable row level security;
alter table workout_metrics enable row level security;
alter table workout_records enable row level security;
alter table reviews enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function current_member_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select member_id from profiles where user_id = auth.uid();
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (user_id, role, display_name, email, require_password_reset)
  values (
    new.id,
    'member',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), ''),
    new.email,
    false
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = case
        when profiles.display_name = '' then excluded.display_name
        else profiles.display_name
      end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

drop policy if exists "Users can read own profile and admins read all" on profiles;
create policy "Users can read own profile and admins read all" on profiles
for select to authenticated
using (user_id = auth.uid() or is_admin());

drop policy if exists "Users can update own basic profile" on profiles;
drop policy if exists "Admins can manage profiles" on profiles;
create policy "Admins can manage profiles" on profiles
for all to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Authenticated users can read members" on members;
create policy "Authenticated users can read members" on members for select to authenticated using (true);
drop policy if exists "Admins can manage members" on members;
create policy "Admins can manage members" on members for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Authenticated users can read sessions" on training_sessions;
create policy "Authenticated users can read sessions" on training_sessions for select to authenticated using (true);
drop policy if exists "Admins can manage sessions" on training_sessions;
create policy "Admins can manage sessions" on training_sessions for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Authenticated users can read attendance" on attendance_records;
create policy "Authenticated users can read attendance" on attendance_records
for select to authenticated
using (is_admin() or member_id = current_member_id());
drop policy if exists "Admins can manage all attendance" on attendance_records;
create policy "Admins can manage all attendance" on attendance_records for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "Members can manage own attendance" on attendance_records;
create policy "Members can manage own attendance" on attendance_records for all to authenticated using (member_id = current_member_id()) with check (member_id = current_member_id());

drop policy if exists "Authenticated users can read metrics" on workout_metrics;
create policy "Authenticated users can read metrics" on workout_metrics for select to authenticated using (true);
drop policy if exists "Admins can manage metrics" on workout_metrics;
create policy "Admins can manage metrics" on workout_metrics for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Authenticated users can read workouts" on workout_records;
create policy "Authenticated users can read workouts" on workout_records
for select to authenticated
using (is_admin() or member_id = current_member_id());
drop policy if exists "Admins can manage all workouts" on workout_records;
create policy "Admins can manage all workouts" on workout_records for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "Members can manage own workouts" on workout_records;
create policy "Members can manage own workouts" on workout_records for all to authenticated using (member_id = current_member_id()) with check (member_id = current_member_id());

drop policy if exists "Authenticated users can read reviews" on reviews;
create policy "Authenticated users can read reviews" on reviews
for select to authenticated
using (is_admin() or member_id = current_member_id());
drop policy if exists "Admins can manage reviews" on reviews;
create policy "Admins can manage reviews" on reviews for all to authenticated using (is_admin()) with check (is_admin());

insert into workout_metrics (name, unit, target)
values ('Pumping', 'reps', 40), ('Sit-up', 'reps', 50)
on conflict do nothing;
