# CiteBite Deployment Manual

This document provides a comprehensive step-by-step guide for deploying CiteBite to production using Vercel (frontend), Railway (workers), Supabase (database), and Upstash (Redis).

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Supabase Production Setup](#step-1-supabase-production-setup)
4. [Step 2: Upstash Redis Setup](#step-2-upstash-redis-setup)
5. [Step 3: Vercel Deployment](#step-3-vercel-deployment)
6. [Step 4: Railway Deployment](#step-4-railway-deployment)
7. [Step 5: Post-Deployment Verification](#step-5-post-deployment-verification)
8. [Step 6: Custom Domain Setup](#step-6-custom-domain-setup)
9. [Environment Variables Reference](#environment-variables-reference)
10. [Troubleshooting](#troubleshooting)
11. [Cost Estimation](#cost-estimation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           VERCEL                                 │
│            Next.js App (Frontend + API Routes)                  │
│                    Auto-deploy on git push                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┬─────────────────┐
         │                   │                   │                 │
         ▼                   ▼                   ▼                 ▼
┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐
│    Railway      │  │   Supabase   │  │   Upstash   │  │    Supabase     │
│    Workers      │  │  PostgreSQL  │  │    Redis    │  │    Storage      │
│ (BullMQ Jobs)   │  │  + pgvector  │  │  (Queues)   │  │    (PDFs)       │
│ Auto-deploy on  │  │              │  │             │  │                 │
│   git push      │  │              │  │             │  │                 │
└─────────────────┘  └──────────────┘  └─────────────┘  └─────────────────┘
```

### Service Responsibilities

| Service      | Role                                       | Auto-Deploy              |
| ------------ | ------------------------------------------ | ------------------------ |
| **Vercel**   | Next.js frontend + API routes              | Yes (GitHub integration) |
| **Railway**  | BullMQ background workers (PDF processing) | Yes (GitHub integration) |
| **Supabase** | PostgreSQL database, Auth, Storage         | N/A (managed service)    |
| **Upstash**  | Redis for job queues                       | N/A (managed service)    |

---

## Prerequisites

Before starting deployment, ensure you have:

- [ ] GitHub account with CiteBite repository
- [ ] Google Cloud Console account (for OAuth)
- [ ] Credit card for paid tiers (Railway requires $5 minimum)
- [ ] Local development environment working (`npm run dev` succeeds)

### Required API Keys (prepare beforehand)

| Key                      | Source                                      | Required |
| ------------------------ | ------------------------------------------- | -------- |
| Gemini API Key           | https://aistudio.google.com/app/apikey      | Yes      |
| Semantic Scholar API Key | https://www.semanticscholar.org/product/api | Optional |
| Google OAuth Credentials | Google Cloud Console                        | Yes      |

---

## Step 1: Supabase Production Setup

### 1.1 Create Supabase Project

1. Go to https://supabase.com and sign in
2. Click **"New Project"**
3. Fill in project details:
   - **Name**: `citebite` (or your preferred name)
   - **Database Password**: Generate a strong password and **save it securely**
   - **Region**: Choose closest to your users
     - Korea/Asia: `Singapore (Southeast Asia)`
     - US: `East US (North Virginia)`
     - Europe: `West EU (Ireland)`
   - **Pricing Plan**: Free tier is sufficient for MVP
4. Click **"Create new project"**
5. Wait 2-3 minutes for project initialization

### 1.2 Collect Environment Variables

After project is ready, collect these values:

#### From Settings > API:

| Variable                        | Location         | Example                        |
| ------------------------------- | ---------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL      | `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key  | `eyJhbGciOiJIUzI1NiIs...`      |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key | `eyJhbGciOiJIUzI1NiIs...`      |

> **Warning**: `SUPABASE_SERVICE_ROLE_KEY` is secret! Never expose to frontend.

#### From Settings > Database:

| Variable       | Location                | Example                                                                  |
| -------------- | ----------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL` | Connection string > URI | `postgresql://postgres:[PASSWORD]@db.abcdefgh.supabase.co:5432/postgres` |

### 1.3 Apply Database Migrations

Open terminal in your local CiteBite project:

```bash
# 1. Install Supabase CLI if not installed
npm install -g supabase

# 2. Login to Supabase
npx supabase login

# 3. Link to your production project
# Find project-ref in Supabase Dashboard URL: https://supabase.com/dashboard/project/[project-ref]
npx supabase link --project-ref <your-project-ref>

# Example:
# npx supabase link --project-ref abcdefghijklmnop

# 4. Push all migrations to production
npx supabase db push

# 5. Verify migrations applied
# Check Supabase Dashboard > Table Editor
# You should see tables: collections, papers, paper_chunks, conversations, etc.
```

### 1.4 Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Click **"New bucket"**
3. Configure bucket:
   - **Name**: `pdfs`
   - **Public bucket**: **OFF** (unchecked)
   - **Allowed MIME types**: `application/pdf`
   - **File size limit**: `100MB` (104857600 bytes)
4. Click **"Create bucket"**

### 1.5 Configure Authentication

#### Enable Email Auth (default):

1. Go to **Authentication > Providers**
2. Email provider should be enabled by default
3. Configure settings:
   - **Enable email confirmations**: OFF (for easier testing)
   - **Minimum password length**: 6

#### Enable Google OAuth:

**Step A: Create Google OAuth Credentials**

1. Go to https://console.cloud.google.com
2. Create new project or select existing
3. Navigate to **APIs & Services > Credentials**
4. Click **"Create Credentials" > "OAuth client ID"**
5. If prompted, configure OAuth consent screen first:
   - User type: External
   - App name: CiteBite
   - User support email: your email
   - Developer contact: your email
6. Create OAuth client:
   - Application type: **Web application**
   - Name: `CiteBite Production`
   - Authorized JavaScript origins:
     ```
     https://your-project-ref.supabase.co
     ```
   - Authorized redirect URIs:
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
7. Click **"Create"**
8. **Save** the Client ID and Client Secret

**Step B: Configure in Supabase**

1. Go to **Authentication > Providers > Google**
2. Toggle **Enable Google provider**
3. Enter:
   - **Client ID**: (from Google Console)
   - **Client Secret**: (from Google Console)
4. Click **"Save"**

### 1.6 Supabase Setup Checklist

- [ ] Project created and initialized
- [ ] Environment variables collected (4 values)
- [ ] Database migrations applied (`npx supabase db push`)
- [ ] Storage bucket `pdfs` created (private, 100MB limit)
- [ ] Google OAuth configured in both Google Console and Supabase

---

## Step 2: Upstash Redis Setup

### 2.1 Create Upstash Account and Database

1. Go to https://upstash.com
2. Sign up or sign in (GitHub login available)
3. Click **"Create Database"**
4. Configure database:
   - **Name**: `citebite-redis`
   - **Type**: **Regional** (free tier)
   - **Region**: Same as Supabase for lowest latency
     - `ap-southeast-1` for Singapore
     - `us-east-1` for US East
   - **TLS (SSL)**: **Enabled** (default)
5. Click **"Create"**

### 2.2 Collect Redis URL

After database is created:

1. Go to database **Details** tab
2. Find **Endpoint** section
3. Copy the **Redis URL** (with password):
   ```
   rediss://default:xxxxxxxxxxxxx@apn1-xxxxx.upstash.io:6379
   ```

> **Note**: URL starts with `rediss://` (with 's') for TLS connection.

### 2.3 Verify Connection (Optional)

```bash
# Using redis-cli (if installed)
redis-cli -u "rediss://default:xxxxx@xxx.upstash.io:6379" ping
# Should return: PONG
```

### 2.4 Upstash Setup Checklist

- [ ] Upstash account created
- [ ] Redis database created (Regional, free tier)
- [ ] `REDIS_URL` copied and saved

---

## Step 3: Vercel Deployment

### 3.1 Connect Repository to Vercel

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click **"Add New..." > "Project"**
4. Select **"Import Git Repository"**
5. Find and select `citebite` repository
6. Click **"Import"**

### 3.2 Configure Project Settings

On the configuration page:

| Setting              | Value                     |
| -------------------- | ------------------------- |
| **Framework Preset** | Next.js (auto-detected)   |
| **Root Directory**   | `./` (default)            |
| **Build Command**    | `npm run build` (default) |
| **Output Directory** | `.next` (default)         |
| **Install Command**  | `npm install` (default)   |
| **Node.js Version**  | 20.x                      |

### 3.3 Configure Environment Variables

Click **"Environment Variables"** section and add all required variables:

#### Public Variables (all environments):

| Key                             | Value                         | Environment |
| ------------------------------- | ----------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://xxx.supabase.co`     | All         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...`                   | All         |
| `NEXT_PUBLIC_APP_URL`           | `https://your-app.vercel.app` | All         |

#### Server-Only Variables (all environments):

| Key                         | Value              | Environment |
| --------------------------- | ------------------ | ----------- |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...`        | All         |
| `DATABASE_URL`              | `postgresql://...` | All         |
| `GEMINI_API_KEY`            | `AIzaSy...`        | All         |
| `REDIS_URL`                 | `rediss://...`     | All         |
| `SEMANTIC_SCHOLAR_API_KEY`  | `xxx` (optional)   | All         |

#### Optional Variables:

| Key                     | Value   | Environment |
| ----------------------- | ------- | ----------- |
| `ENABLE_MULTIMODAL_RAG` | `false` | All         |

### 3.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (2-5 minutes)
3. Note your deployment URL: `https://citebite-xxx.vercel.app`

### 3.5 Update Environment Variable

After first deployment, update `NEXT_PUBLIC_APP_URL`:

1. Go to **Settings > Environment Variables**
2. Edit `NEXT_PUBLIC_APP_URL`
3. Set value to your actual Vercel URL
4. Click **Save**
5. **Redeploy** for changes to take effect:
   - Go to **Deployments** tab
   - Click **"..." > "Redeploy"** on latest deployment

### 3.6 Update Google OAuth Redirect

Add your Vercel URL to Google OAuth:

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Edit your OAuth 2.0 Client
3. Add to **Authorized JavaScript origins**:
   ```
   https://your-app.vercel.app
   ```
4. Add to **Authorized redirect URIs**:
   ```
   https://your-supabase-project.supabase.co/auth/v1/callback
   ```
   (This should already be there from Step 1)

### 3.7 Vercel Deployment Checklist

- [ ] Repository connected to Vercel
- [ ] All environment variables configured
- [ ] Initial deployment successful
- [ ] `NEXT_PUBLIC_APP_URL` updated with actual URL
- [ ] Google OAuth origins updated

---

## Step 4: Railway Deployment

### 4.1 Create Railway Account and Project

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Select `citebite` repository
6. Click **"Deploy Now"**

### 4.2 Configure Service Settings

After initial deployment (which will fail - that's expected):

1. Click on the deployed service
2. Go to **Settings** tab
3. Configure:

| Setting             | Value                         |
| ------------------- | ----------------------------- |
| **Service Name**    | `citebite-workers`            |
| **Root Directory**  | `/`                           |
| **Build Command**   | Leave empty (uses Dockerfile) |
| **Start Command**   | Leave empty (uses Dockerfile) |
| **Dockerfile Path** | `Dockerfile.workers`          |

Or if not using Dockerfile:

| Setting           | Value             |
| ----------------- | ----------------- |
| **Build Command** | `npm ci`          |
| **Start Command** | `npm run workers` |

### 4.3 Configure Environment Variables

Go to **Variables** tab and add:

```env
# Database (Required)
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Redis (Required)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# AI/ML (Required)
GEMINI_API_KEY=AIzaSy...

# Optional
ENABLE_MULTIMODAL_RAG=false
SEMANTIC_SCHOLAR_API_KEY=xxx
```

### 4.4 Trigger Redeploy

After adding environment variables:

1. Go to **Deployments** tab
2. Click **"Redeploy"** on the failed deployment
3. Or push a new commit to trigger auto-deploy

### 4.5 Verify Worker Logs

1. Go to **Deployments** tab
2. Click on the active deployment
3. Check **Logs** for successful startup:

```
Starting all workers...
✓ PDF download worker started
✓ PDF index worker started
✓ Figure analysis worker started
✓ Bulk upload cleanup worker started
All workers started successfully
```

### 4.6 Railway Deployment Checklist

- [ ] Railway project created from GitHub repo
- [ ] Service configured to use `Dockerfile.workers`
- [ ] All environment variables added
- [ ] Deployment successful
- [ ] Worker logs show all workers started

---

## Step 5: Post-Deployment Verification

### 5.1 Frontend Verification

| Check            | How to Verify                       | Expected Result                |
| ---------------- | ----------------------------------- | ------------------------------ |
| Homepage loads   | Visit `https://your-app.vercel.app` | Landing page displays          |
| Auth works       | Click "Sign in with Google"         | Redirects to Google, then back |
| Protected routes | Visit `/collections` after login    | Shows collections page         |

### 5.2 API Verification

```bash
# Test unauthenticated request (should return 401)
curl https://your-app.vercel.app/api/collections
# Expected: {"error":"User not authenticated"}

# After logging in, use browser DevTools Network tab
# to verify API calls return 200
```

### 5.3 Worker Verification

1. **Create a collection** with a paper that has Open Access PDF
2. **Check Railway logs** for job processing:
   ```
   Processing pdf-download job: xxx
   Downloaded PDF for paper: xxx
   Processing pdf-indexing job: xxx
   Indexed paper: xxx with 15 chunks
   ```
3. **Check Supabase** `paper_chunks` table for embeddings

### 5.4 Full Flow Test

1. Sign in with Google
2. Create new collection with topic "machine learning"
3. Search and add papers
4. Wait for PDF processing (check Railway logs)
5. Start a conversation and ask a question
6. Verify citations appear in response

### 5.5 Verification Checklist

- [ ] Frontend loads without errors
- [ ] Google OAuth login works
- [ ] Collections can be created
- [ ] Paper search returns results
- [ ] PDF download jobs process (Railway logs)
- [ ] PDF indexing completes (check `paper_chunks` table)
- [ ] Chat returns responses with citations

---

## Step 6: Custom Domain Setup

### 6.1 Vercel Custom Domain

1. Go to Vercel Dashboard > Your Project > **Settings** > **Domains**
2. Click **"Add"**
3. Enter your domain: `citebite.com`
4. Follow DNS configuration instructions:

**For apex domain (citebite.com):**

```
Type: A
Name: @
Value: 76.76.21.21
```

**For www subdomain:**

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

5. Wait for DNS propagation (up to 48 hours, usually faster)

### 6.2 Update Environment Variables

After domain is active, update:

| Variable              | New Value              |
| --------------------- | ---------------------- |
| `NEXT_PUBLIC_APP_URL` | `https://citebite.com` |

### 6.3 Update OAuth Settings

**Google Cloud Console:**

1. Add to Authorized JavaScript origins:
   ```
   https://citebite.com
   https://www.citebite.com
   ```

**Supabase Dashboard > Authentication > URL Configuration:**

1. Add to Site URL: `https://citebite.com`
2. Add to Redirect URLs: `https://citebite.com/**`

---

## Environment Variables Reference

### Complete List

| Variable                        | Service         | Required | Description                        |
| ------------------------------- | --------------- | -------- | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Vercel, Railway | Yes      | Supabase project URL               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel, Railway | Yes      | Supabase anonymous key             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Vercel, Railway | Yes      | Supabase service role key (secret) |
| `DATABASE_URL`                  | Vercel, Railway | Yes      | PostgreSQL connection string       |
| `GEMINI_API_KEY`                | Vercel, Railway | Yes      | Google Gemini API key              |
| `REDIS_URL`                     | Vercel, Railway | Yes      | Upstash Redis URL                  |
| `NEXT_PUBLIC_APP_URL`           | Vercel          | Yes      | Your app's public URL              |
| `SEMANTIC_SCHOLAR_API_KEY`      | Vercel, Railway | No       | Semantic Scholar API key           |
| `ENABLE_MULTIMODAL_RAG`         | Railway         | No       | Enable figure analysis             |
| `PDFFIGURES2_API_URL`           | Railway         | No       | PDFFigures2 service URL            |

### Environment Variable Sources

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE DASHBOARD                        │
│  Settings > API:                                             │
│    - NEXT_PUBLIC_SUPABASE_URL                               │
│    - NEXT_PUBLIC_SUPABASE_ANON_KEY                          │
│    - SUPABASE_SERVICE_ROLE_KEY                              │
│  Settings > Database:                                        │
│    - DATABASE_URL                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    UPSTASH DASHBOARD                         │
│  Database > Details:                                         │
│    - REDIS_URL                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  GOOGLE AI STUDIO                            │
│  https://aistudio.google.com/app/apikey                      │
│    - GEMINI_API_KEY                                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  SEMANTIC SCHOLAR                            │
│  https://www.semanticscholar.org/product/api                 │
│    - SEMANTIC_SCHOLAR_API_KEY (optional)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Build Failures

#### Vercel Build Fails

**Symptom**: Build fails with TypeScript or ESLint errors

**Solution**:

```bash
# Run locally first
npm run build

# Fix any errors before pushing
```

#### Railway Build Fails

**Symptom**: Dockerfile build fails

**Solution**:

1. Check `Dockerfile.workers` exists
2. Verify all dependencies in `package.json`
3. Check Railway logs for specific error

---

### Runtime Errors

#### "User not authenticated" on all API calls

**Cause**: Supabase keys not configured correctly

**Solution**:

1. Verify `NEXT_PUBLIC_SUPABASE_URL` starts with `https://`
2. Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon key (not service role)
3. Redeploy after fixing environment variables

#### Workers not processing jobs

**Cause**: Redis connection issue

**Solution**:

1. Check `REDIS_URL` in Railway variables
2. Verify Upstash database is active
3. Check Railway logs for connection errors:
   ```
   Redis client error: ...
   ```

#### PDF download fails

**Cause**: Paper doesn't have Open Access PDF

**Solution**:

- This is expected for non-OA papers
- Use manual PDF upload feature
- Check `papers` table `vector_status` column

#### Google OAuth redirect error

**Cause**: Redirect URI mismatch

**Solution**:

1. Check Google Cloud Console redirect URIs include:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```
2. Check Supabase Auth settings

---

### Database Issues

#### Migrations not applied

**Symptom**: Tables missing in production

**Solution**:

```bash
# Re-run migration push
npx supabase db push --linked
```

#### Connection timeout

**Symptom**: `ETIMEDOUT` errors

**Solution**:

1. Check DATABASE_URL is correct
2. Verify Supabase project is not paused (free tier pauses after inactivity)
3. Check if IP restrictions are enabled in Supabase

---

### Performance Issues

#### Slow API responses

**Possible causes**:

1. Cold start (serverless function warming up)
2. Database in different region than Vercel
3. Large data queries without pagination

**Solutions**:

1. First request is always slower (cold start)
2. Use same region for all services
3. Implement pagination for large datasets

---

## Cost Estimation

### Free Tier Limits

| Service      | Free Tier | Limits                                    |
| ------------ | --------- | ----------------------------------------- |
| **Vercel**   | Hobby     | 100GB bandwidth, 6000 build minutes/month |
| **Supabase** | Free      | 500MB database, 1GB storage, 50K MAU      |
| **Upstash**  | Free      | 10,000 commands/day, 256MB storage        |
| **Railway**  | Trial     | $5 credit, then pay-as-you-go             |

### Estimated Monthly Costs (100 users)

| Service        | Usage                           | Cost             |
| -------------- | ------------------------------- | ---------------- |
| **Vercel**     | ~10GB bandwidth                 | $0 (free tier)   |
| **Supabase**   | ~100MB database, ~500MB storage | $0 (free tier)   |
| **Upstash**    | ~5000 commands/day              | $0 (free tier)   |
| **Railway**    | ~720 hours compute              | ~$5-10           |
| **Gemini API** | ~1M tokens/month                | ~$0.10           |
| **Total**      |                                 | **~$5-10/month** |

### Scaling Costs

When you outgrow free tiers:

| Service      | Paid Plan     | Starting Price               |
| ------------ | ------------- | ---------------------------- |
| **Vercel**   | Pro           | $20/month                    |
| **Supabase** | Pro           | $25/month                    |
| **Upstash**  | Pay-as-you-go | $0.2 per 100K commands       |
| **Railway**  | Pro           | Usage-based (~$0.000463/min) |

---

## Maintenance Tasks

### Regular Checks

| Task                  | Frequency | How                              |
| --------------------- | --------- | -------------------------------- |
| Check error logs      | Weekly    | Vercel & Railway dashboards      |
| Monitor database size | Monthly   | Supabase dashboard               |
| Review failed jobs    | Weekly    | Railway logs or BullMQ dashboard |
| Update dependencies   | Monthly   | `npm outdated && npm update`     |

### Backup Strategy

| Data     | Backup Method              | Frequency             |
| -------- | -------------------------- | --------------------- |
| Database | Supabase automatic backups | Daily (Pro plan)      |
| PDFs     | Supabase Storage           | Included in DB backup |
| Code     | GitHub                     | Every push            |

---

## Quick Reference Commands

```bash
# Deploy (automatic on git push)
git push origin main

# Check Supabase status
npx supabase status

# Push database migrations
npx supabase db push

# Generate TypeScript types
npx supabase gen types typescript --linked > src/types/database.types.ts

# View Railway logs
railway logs

# Check local build before pushing
npm run build
```

---

## Support Resources

| Resource           | URL                                |
| ------------------ | ---------------------------------- |
| Vercel Docs        | https://vercel.com/docs            |
| Railway Docs       | https://docs.railway.app           |
| Supabase Docs      | https://supabase.com/docs          |
| Upstash Docs       | https://upstash.com/docs           |
| Next.js Deployment | https://nextjs.org/docs/deployment |

---

_Last updated: December 2024_
