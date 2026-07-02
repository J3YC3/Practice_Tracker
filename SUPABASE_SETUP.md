# Supabase Setup

1. Create a Supabase project.
2. Go to `SQL Editor` and run `supabase/schema.sql`.
3. Go to `Authentication > Users` and create your admin user.
4. Edit `supabase/bootstrap-profiles.sql`, replace the example emails/names, then run it in `SQL Editor`.
5. Copy `.env.local.example` to `.env.local`.
6. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. Restart the dev server with `npm run dev`.

When Supabase env vars are present, the app uses real login/logout. The demo role selector only appears when Supabase is not configured.

Roles:

- `admin`: can manage all members, sessions, attendance, workout items, workout records, and reviews.
- `member`: can edit only their own attendance/workout records and can only see their own review/status.
