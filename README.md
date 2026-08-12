# Liumial — Deploy & Development

This branch wires Liumial for Vercel + Supabase realtime and adds Discord-like UI changes.

Quick setup

1. Create a Supabase project at https://app.supabase.com.
2. In the SQL editor, run schema.sql to create tables (profiles, servers, channels, messages).
3. In Vercel project settings, add environment variables:
   - NEXT_PUBLIC_SUPABASE_URL = your supabase url
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = your anon public key
   - (optional server-only) SUPABASE_SERVICE_ROLE = your service role key (do NOT expose to client)
4. Deploy the repo from this branch on Vercel. The frontend will use Supabase Realtime for messaging.

Local testing

- Run a static server from repo root:
  npx serve . -p 3000
- Open http://localhost:3000

Files added/updated in this branch
- index.html — loading overlay, servers column, proper script order
- style.css — Discord-like UI styles + loading overlay
- app.js — client app refactor with Supabase integration (via server-sync.js)
- server-sync.js — Supabase client wrapper (already present)
- schema.sql — SQL to run in Supabase
- server/ — Express + Socket.io example (for self-hosted sockets)
- next-app/ — minimal Next.js scaffold showing server-side Supabase usage

Security notes
- Do NOT put the SUPABASE_SERVICE_ROLE in client code. Use it server-side for admin-only routes.
- Use Supabase Auth for real user authentication instead of the demo local accounts.
