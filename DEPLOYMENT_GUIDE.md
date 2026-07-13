# WealthCraft Deployment Guide

This guide walks you through deploying WealthCraft v1.0.0 to Vercel via the Vercel Dashboard. This is the safest and recommended deployment method.

## 1. Push to GitHub
1. Ensure all local changes are committed:
   ```bash
   git add .
   git commit -m "chore: Prepare for Vercel deployment"
   ```
2. Push your `main` or `release/v1.0.0` branch to your remote GitHub repository.

## 2. Import Project into Vercel
1. Log into your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New** -> **Project**.
3. Select your WealthCraft GitHub repository and click **Import**.
4. Leave the Framework Preset as **Next.js**.

## 3. Configure Environment Variables
During the Vercel import process (or via the project settings later), you must inject your production environment variables. Expand the **Environment Variables** section and paste the following keys (refer to your local `.env.production` file for values):

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXT_PUBLIC_PUSHER_KEY`
- `PUSHER_APP_ID`
- `PUSHER_SECRET`
- `NEXT_PUBLIC_PUSHER_CLUSTER`
- `PUSHER_CLUSTER`

> [!WARNING]
> Do NOT use `development-secret-key-12345` for `AUTH_SECRET` in production! Generate a new key using `openssl rand -base64 32`.

## 4. Configure Database
WealthCraft relies on Neon Serverless Postgres.
1. Ensure your Neon production database is active.
2. The `DATABASE_URL` must point to the production database and include `?sslmode=require`.
3. WealthCraft uses Drizzle ORM. The build process automatically handles schema generation, but you should manually verify that tables exist via the Neon console or by hitting your authenticated `GET /api/register` endpoint (if it contains `verify/create` logic).

## 5. Configure Authentication
1. Go to your Google Cloud Console.
2. In your OAuth Client configuration, add your new Vercel production URL to the **Authorized JavaScript origins** and **Authorized redirect URIs** (e.g., `https://wealthcraft.vercel.app/api/auth/callback/google`).
3. Set `NEXTAUTH_URL` to your production URL if Vercel does not inject it automatically.

## 6. Configure Pusher
1. Verify that your Pusher Channels production app is active.
2. Ensure the Pusher keys match exactly between your `.env.local` testing environment and Vercel.

## 7. Trigger Deployment
Click **Deploy** in the Vercel interface. Vercel will run `npm run build`.

## 8. Verify Deployment
Monitor the Vercel Build Logs. Ensure the process finishes with:
`Creating an optimized production build ...`
`✓ Compiled successfully`

## 9. Post-Deployment Smoke Tests
Follow the instructions in `POST_DEPLOYMENT_CHECKLIST.md` to ensure the live environment is stable.
