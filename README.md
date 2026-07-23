# Thai Candidate Sourcing

Internal HR platform for sourcing and evaluating candidates, focused on Thai
people educated abroad. Natural-language (RAG) candidate search + AI fit scoring.
A pared-down juicebox.ai. Built with Next.js 15, Supabase (Postgres + Auth +
pgvector), and Gemini.

See `docs/superpowers/` for the full spec and implementation plan, and
`CLAUDE.md` for conventions.

## Local setup

1. Install dependencies:

   ```
   npm install
   ```

2. Create `.env` (git-ignored) with:

   ```
   DATABASE_URL=postgresql://postgres:[pw]@db.xxxxx.supabase.co:5432/postgres
   GEMINI_API_KEY=...
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. Apply migrations — run each file in `supabase/migrations/*.sql` (in order)
   in the Supabase SQL editor.

4. In Supabase, disable email confirmation for local dev:
   Authentication → Sign In / Providers → Email → turn off "Confirm email".

5. Seed demo data (synthetic Thai candidates, English fields):

   ```
   npx tsx scripts/seed-synthetic.ts 30
   ```

   Seed demo jobs (for job → candidate matching):

   ```
   npx tsx scripts/seed-jobs.ts
   ```

6. Run the dev server:

   ```
   npm run dev
   ```

   Sign up at `/signup`, then make yourself admin once:

   ```sql
   update profiles set role = 'admin' where display_name = '<your-email>';
   ```

## Tests

```
npx vitest run          # all tests
npx vitest run <path>   # a single file
```

Unit tests run offline; integration tests (`*upsert*`, migration checks) hit
real Supabase + Gemini and clean up after themselves.

## Deploy (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Set the four `.env` variables above as Vercel Environment Variables
   (Production + Preview). Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` to the
   client — it is only read in server code (`lib/supabase/server.ts`).
3. Ensure all `supabase/migrations/*.sql` have been applied to the project.
4. Deploy:

   ```
   vercel --prod
   ```

## Gemini free-tier note

Free tier allows 5 generate requests/minute per model. Search ranks by vector
similarity (no LLM per result); the LLM (`analyze`) runs only on-demand per
candidate. For heavy demo/production traffic, enable billing or add a
queue/rate-limit.

## Notes

- Candidate data is stored in English (uniform with future scraped LinkedIn
  data); AI reasoning/advice stays in Thai.
- Migrations are additive and never touch the existing `jobs` table
  (`import_jobs.py`), reserved for the later candidate↔job matching phase.
