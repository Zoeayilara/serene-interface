# NACOS Hardware Inventory

Equipment records for the NACOS Hardware Unit: what we have, where it is, and what condition it's in.
It's a TanStack Start app with a Supabase database, deployed on Netlify.

## What it does

- **Sign in** with a named account: one for the Hardware Director, one for the Assistant Hardware Director. Passwords are hashed (PBKDF2-SHA256), and five wrong attempts lock an account for 15 minutes.
- **Inventory**: an overview of every unit by condition, and a table you can search, filter (category, condition, location), sort and export to CSV. It works on phones.
- **Add and update equipment**: counts for Working, Faulty, Under maintenance, Missing and Retired must add up to the total before you can save. Working fills itself in, so after an inspection you only change the problem counts.
- **History**: every add, update and delete, showing who did it, when, and what changed (e.g. `Working: 24 → 26`). The database won't let anyone edit or delete history.
- **Reports**: totals, items needing attention, and breakdowns by category and location, with print/PDF and CSV.
- **Categories**: add, rename, delete. A category that still has equipment in it can't be deleted.
- **Accounts**: everyone can change their own name and password. The Director can add administrators, reset passwords and remove access.
- **Themes**: light and dark.

## Deploying (Supabase + Netlify)

### 1. Create the database (Supabase, free)

1. Go to <https://supabase.com> → **New project**. Pick a region near Nigeria and set a database password (save it somewhere).
2. When it's ready, open **SQL Editor → New query**, paste the whole of `supabase/setup.sql`, and click **Run**. You should see "Success. No rows returned". Run it only once.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://xxxx.supabase.co`, also shown under **Data API**)
   - the **Secret key** (`sb_secret_…`). If you only see legacy keys, copy the **service_role** key instead. This key is powerful: only paste it into Netlify, never into code or chat.

### 2. Deploy on Netlify

1. Push this code to your GitHub repo's `main` branch.
2. On <https://app.netlify.com>: **Add new site → Import an existing project → GitHub**, then pick the repo.
   The build settings come from `netlify.toml` (build `npm run build`, publish `dist`), so don't change them.
3. Before the first deploy, or right after it, open **Site configuration → Environment variables** and add:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the Secret key from step 1 |
   | `SESSION_SECRET` | 40+ random characters, e.g. from <https://1password.com/password-generator> |
   | `ADMIN_USERNAME` | `director` (or any username you like) |
   | `ADMIN_PASSWORD` | a strong password for your first sign-in |

4. **Deploys → Trigger deploy → Deploy site** so the build picks up the variables. You get a link like `https://something.netlify.app`. Rename it under **Site configuration → Change site name**.

### 3. First sign-in

1. Open the link and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. That creates the Hardware Director account. After this, those two variables are ignored.
2. Go to **Accounts**:
   - set your real name (it's what History shows),
   - change your password,
   - **Add administrator** for the Assistant Hardware Director, with a temporary password.
3. Send the link, username and temporary password to your assistant privately. They change the password under Accounts after signing in.
4. Start adding equipment.

## Notes

- **Forgot password**: the Director resets anyone's password under Accounts. If the only Director is locked out, run this in the Supabase SQL Editor, then sign in again with `ADMIN_USERNAME` / `ADMIN_PASSWORD` to recreate the Director account:
  `delete from public.admin_accounts where role = 'hardware_director';`
  Inventory and history are not touched.
- **Session length**: 12 hours. Changing or resetting a password signs that person out everywhere.
- **Supabase free projects pause** after about a week with no activity. If the site says it can't load data, open the Supabase dashboard and click **Restore**. Regular use keeps it awake.
- **Backups**: export a CSV from Reports now and then.

## Local development

```sh
cp .env.example .env   # fill in the values
npm ci
npm run dev
```

Key files:

- `src/lib/admin.server.ts`: password hashing, sessions, sign-in and lockout (server only)
- `src/lib/auth.functions.ts`: sign-in and account management
- `src/lib/inventory.functions.ts`: inventory, categories and the audit trail
- `src/routes/`: pages (`index` inventory, `history`, `reports`, `categories`, `account`, `login`)
- `src/components/item-dialogs.tsx`: add/update form, item view, history list
- `supabase/setup.sql`: one-shot setup for a new Supabase project (same as `supabase/migrations/`, without sample data)
- `netlify.toml`: Netlify build settings
