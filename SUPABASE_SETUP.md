# Supabase Setup

1. Create a Supabase project.
2. Go to `SQL Editor` and run `supabase/schema.sql`.
3. Go to `Authentication > Users` and create your admin user.
4. Edit `supabase/bootstrap-profiles.sql`, replace the example emails/names, then run it in `SQL Editor`.
5. Copy `.env.local.example` to `.env.local`.
6. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` for admin-created login accounts
7. Restart the dev server with `npm run dev`.

When Supabase env vars are present, the app uses real login/logout. The demo role selector only appears when Supabase is not configured.

New signups automatically get a `profiles` row as a `member`. Admin can link that login profile to a member record inside `Members > Login Access Linking`.

Admin-created accounts use a default password and force the user to set a new password on first login. `SUPABASE_SERVICE_ROLE_KEY` must be added only in local `.env.local` and Vercel Environment Variables. Do not expose it in browser code.

Roles:

- `admin`: can manage all members, sessions, attendance, workout items, workout records, and reviews.
- `member`: can edit only their own attendance/workout records and can only see their own review/status.
