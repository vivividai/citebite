# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CiteBite** is an AI-powered research assistant that enables researchers to automatically collect papers on specific topics and chat with them using RAG (Retrieval-Augmented Generation).

### Core Value Proposition

- Automated paper collection from Semantic Scholar API (Open Access PDFs)
- Manual PDF upload support for non-Open Access papers
- Citation-backed AI conversations with proper source attribution
- Persistent conversation history across sessions
- Public collection sharing for community collaboration

### Target Users

- Graduate students and PhD researchers
- R&D engineers in industry
- Domain experts tracking latest developments

---

## Tech Stack (Quick Reference)

**Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
**Backend**: Next.js API Routes, Supabase Auth
**Database**: Supabase PostgreSQL (Supabase Client + SQL migrations)
**Vector DB**: pgvector (custom RAG with Gemini embeddings)
**Storage**: Supabase Storage (PDF files with CDN)
**Background Jobs**: BullMQ + Redis
**AI/ML**: Gemini 2.5 Flash, Gemini embedding-001
**External APIs**: Semantic Scholar

For detailed tech stack and implementation methods, refer to [Technical Documentation](#documentation-structure).

---

## Documentation Structure

Technical documentation is organized by concern for easier navigation:

- **[OVERVIEW.md](./docs/planning/OVERVIEW.md)** - System architecture, data flows, and feature-to-tech-stack mapping
- **[EXTERNAL_APIS.md](./docs/planning/EXTERNAL_APIS.md)** - Semantic Scholar API integration guide with detailed endpoint documentation
- **[FRONTEND.md](./docs/planning/FRONTEND.md)** - Frontend stack (Next.js, React, UI libraries, state management, component patterns)
- **[BACKEND.md](./docs/planning/BACKEND.md)** - Backend stack (API routes, authentication, input validation, HTTP clients)
- **[DATABASE.md](./docs/planning/DATABASE.md)** - Database design (PostgreSQL schema, Supabase CLI, SQL migrations, Supabase Storage, RLS policies)
- **[INFRASTRUCTURE.md](./docs/planning/INFRASTRUCTURE.md)** - Background jobs (BullMQ), deployment (Vercel, Railway), security, testing, and cost analysis
- **[MULTIMODAL_RAG.md](./docs/planning/MULTIMODAL_RAG.md)** - Multimodal RAG implementation plan (Figure/Chart extraction and analysis)
- **[ROADMAP.md](./docs/ROADMAP.md)** - Detailed implementation checklist with 8 phases (~110 testable tasks)

**When to reference each document:**

- **Starting a new feature** → OVERVIEW.md for architecture context and data flow
- **API integration work** → EXTERNAL_APIS.md for endpoint details and error handling
- **UI development** → FRONTEND.md for component patterns and state management
- **Backend API work** → BACKEND.md for authentication, validation, and API patterns
- **Database changes** → DATABASE.md for schema, migrations, and RLS policies
- **Deployment/operations** → INFRASTRUCTURE.md for deployment configs, background jobs, and cost analysis
- **Implementation planning** → ROADMAP.md for phase-by-phase tasks

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop (for local Supabase and Redis)
- npm (this project uses npm, not pnpm or yarn)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys:
# - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY (server-only)
# - DATABASE_URL (Supabase PostgreSQL connection string)
# - GEMINI_API_KEY
# - SEMANTIC_SCHOLAR_API_KEY (optional, for API key authentication)
# - REDIS_URL (for BullMQ, default: redis://localhost:6379)

# 3. Start local Supabase
npx supabase start
# Note: First time may take 5-10 minutes to download Docker images
# This will start PostgreSQL, Auth, Storage, and other Supabase services

# 4. Apply database migrations
npx supabase db reset
# This applies all migrations in supabase/migrations/

# 5. Generate TypeScript types from database schema
npx supabase gen types typescript --local > src/types/database.types.ts

# 6. Start Redis (Docker)
docker run -d --name citebite-redis -p 6379:6379 redis:7-alpine
# Or use existing Redis instance and update REDIS_URL in .env.local

# 7. Start background workers (in separate terminal)
npm run workers
# This starts BullMQ workers for PDF processing

# 8. Start development server
npm run dev
# App will be available at http://localhost:3000
```

### Verify Setup

After starting all services, verify they're running:

- **Next.js**: http://localhost:3000
- **Supabase Studio**: http://localhost:54323
- **API Health**: http://localhost:3000/api/collections (should return 401 if not logged in)
- **Workers**: Check terminal where `npm run workers` is running for log output

### Stop Services

```bash
# Stop Next.js dev server (Ctrl+C in dev terminal)

# Stop workers (Ctrl+C in worker terminal)

# Stop Supabase
npx supabase stop

# Stop Redis
docker stop citebite-redis
# To remove: docker rm citebite-redis
```

### Useful Scripts

For detailed script documentation and utility commands, see [scripts/README.md](./scripts/README.md).

**Key commands:**

- `npm run workers` - Start background job workers
- `npm run queues:check` - Monitor queue status
- `npm run queues:clear` - Clear all queues (dev only)

For complete development workflow and deployment guide, see [INFRASTRUCTURE.md](./docs/planning/INFRASTRUCTURE.md).

---

## File Organization

```
citebite/
├── docs/
│   └── planning/              # Technical documentation (OVERVIEW, EXTERNAL_APIS, FRONTEND, BACKEND, DATABASE, INFRASTRUCTURE)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth routes
│   │   ├── collections/       # Collection pages (includes integrated chat UI)
│   │   │   └── [id]/          # Collection detail page with chat interface
│   │   └── api/               # API routes
│   │       ├── collections/   # Collection CRUD
│   │       ├── papers/        # Paper upload/management
│   │       └── conversations/ # Chat endpoints
│   ├── components/            # React components
│   │   ├── chat/              # Chat UI components
│   │   ├── collections/       # Collection UI components
│   │   └── layout/            # Layout components
│   ├── lib/                   # Utilities
│   │   ├── supabase/         # Supabase client (client & server)
│   │   ├── db/               # Database helpers and types
│   │   ├── jobs/             # BullMQ job definitions
│   │   ├── gemini/           # Gemini API client (chat, embeddings)
│   │   ├── semantic-scholar/ # Semantic Scholar API client
│   │   └── storage/          # Supabase Storage helpers
│   └── types/                # TypeScript types
├── supabase/
│   ├── migrations/           # SQL migration files
│   └── config.toml           # Supabase configuration
├── public/                    # Static assets
└── .env.example              # Environment variable template
```

---

## Important Product Decisions

### MVP Scope

**Included Features:**

- Collection creation and management
- Open Access PDF auto-collection via Semantic Scholar
- Manual PDF upload for paywalled papers
- RAG-based chat with citation tracking
- Conversation history (save and resume)
- Collection updates (check for new papers)
- Public collection sharing

**Excluded Features (Post-MVP):**

- Paper relationship visualization
- Note-taking and bookmarks
- Comparative analysis across papers
- Team collaboration features
- Automatic citation export (BibTeX, etc.)

### UX Principles

- Desktop-first (minimum 1024px width)
- Clear progress indicators for background jobs (PDF processing)
- Empty states with actionable CTAs
- Error messages with suggested next steps
- Onboarding flow for first-time users (3 slides + sample collection)

### Success Metrics

- 80%+ of new users create first collection
- 70%+ of collection creators start AI conversation
- 40%+ WAU retention within 4 weeks
- 50%+ of users update collections monthly
- <5s average AI response time
- <10% PDF processing failure rate

---

## Key Development Guidelines

### 1. Asynchronous Processing Required

**Don't process PDFs synchronously** - Always use background jobs (BullMQ)

- Handle PDF downloads and indexing with BullMQ
- Minimize user wait time with progress indicators in UI
- Provide retry logic and clear error messages on failure

### 2. Citation Validation

**Don't skip citation validation** - LLMs hallucinate; verify cited papers exist in collection

- Extract cited paper IDs from RAG grounding metadata
- Verify papers actually exist in the collection
- Store citation information in database for traceability

### 3. Semantic Scholar Query Syntax

**Always use Semantic Scholar's specific query operators** - NOT standard boolean operators (AND, OR, NOT)

Semantic Scholar API uses its own query syntax that differs from standard boolean operators:

- Use `+` for required terms (not AND)
- Use `|` for OR logic (not OR)
- Use `-` for exclusion (not NOT)
- Use `( )` for grouping
- Use `" "` for exact phrase matching

**Examples:**

```
❌ Wrong: "quantum computing AND (review OR survey)"
✅ Correct: "\"quantum computing\" +(review | survey | roadmap)"
```

**AI keyword generation:** When using Gemini to generate search keywords, ensure the prompt instructs it to use Semantic Scholar's query syntax (see `src/lib/gemini/keyword-extraction.ts`).

For complete query syntax reference, see [EXTERNAL_APIS.md - Query Syntax](./docs/planning/EXTERNAL_APIS.md#141-검색-쿼리-빌더-및-query-syntax).

### 4. Security First

**Never expose API keys to frontend**

- Use `NEXT_PUBLIC_*` prefix only for client-safe keys
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` must be server-side only
- Control data access with Supabase Row Level Security (RLS) policies
- Validate all user inputs (use Zod)

For detailed security guide, see [INFRASTRUCTURE.md - Security Best Practices](./docs/planning/INFRASTRUCTURE.md).

### 5. Performance Optimization

- Cache server state with TanStack Query (React Query) and automatic refetching
- Cache Semantic Scholar API responses in Redis (24 hours)
- Prevent N+1 queries with proper JOIN queries
- Lazy load conversation messages (paginate when >50 messages)

For detailed optimization strategies, see [INFRASTRUCTURE.md - Performance Optimization](./docs/planning/INFRASTRUCTURE.md).

### 6. Failure Handling and User Experience

**Don't ignore failed PDFs** - Provide clear UI to retry or manually upload

- PDF download failure → Mark as `vectorStatus: 'failed'`, provide retry button
- Embedding failure → Retry 3 times, then notify user
- LLM timeout → Show partial response (if available) + retry button
- API rate limit → Queue with exponential backoff, show estimated wait time

### 7. Database Development Workflow

**Always validate database changes locally before deploying** - Use the supabase-local-validator subagent

When working with database changes, you MUST use the `supabase-local-validator` subagent to:

- Verify SQL migrations are applied correctly in local Supabase environment
- Test Row Level Security (RLS) policies with different user contexts
- Validate schema changes don't break existing queries
- Ensure foreign key constraints and indexes are properly set up
- Test database triggers and functions locally

**When to use the supabase-local-validator agent:**

- **After creating new SQL migrations** - Proactively validate migrations work in local Supabase
- **After modifying RLS policies** - Test policies with different user roles and edge cases
- **During initial project setup** - Set up and verify local Supabase development environment
- **Before deploying schema changes** - Catch issues early in local environment

**Example workflow:**

```bash
# 1. Create migration file
npx supabase migration new add_collections_table

# 2. Write SQL migration
# ... edit migration file ...

# 3. Claude Code automatically launches supabase-local-validator agent
# to verify the migration works correctly

# 4. Fix any issues found by the agent
# 5. Commit when validation passes
```

The agent will:

- Start local Supabase (if not running)
- Apply migrations to local database
- Run test queries to verify schema
- Test RLS policies with mock user contexts
- Report any errors or warnings

---

## Development Roadmap

The project is divided into 7 phases:

**Phase 1:** Core foundation - Supabase setup (Auth, DB, Storage), Semantic Scholar integration, pgvector RAG setup, PDF download pipeline
**Phase 2:** RAG pipeline and chat UI with citations
**Phase 3:** Manual PDF upload for non-Open Access papers
**Phase 4:** Conversation history and persistence
**Phase 5:** Collection update with new papers
**Phase 6:** Public collection sharing
**Phase 7:** UX polish, testing, bug fixes

For detailed implementation checklist with ~110 testable tasks and completion criteria for each phase, see **[ROADMAP.md](./docs/ROADMAP.md)**.

---

## Common Pitfalls to Avoid

1. **Don't embed entire papers** - Use proper chunking strategy (3072 chars max with 450 char overlap, ≈768 tokens), very large PDFs may fail processing (respect 100MB limit)
2. **Don't forget conversation context** - Include last 5-10 messages in LLM prompt to maintain conversation continuity
3. **Don't hard-delete conversations or collections** - Implement soft delete with recovery option
4. **Don't skip deduplication** - Same paper can appear in multiple collections (check duplicates by Semantic Scholar paper ID)

For more implementation details and best practices, see [OVERVIEW.md](./docs/planning/OVERVIEW.md).

---

## Common Development Tasks

### Working with Database

**Create a new migration:**

```bash
npx supabase migration new add_new_table
# Edit file in supabase/migrations/
npx supabase db reset  # Apply locally
npx supabase gen types typescript --local > src/types/database.types.ts
```

**Query the database:**

```typescript
// Use server-side Supabase client
import { createClient } from '@/lib/supabase/server';

const supabase = createClient();
const { data, error } = await supabase
  .from('collections')
  .select('*')
  .eq('user_id', userId);
```

### Working with Background Jobs

**Start workers:**

```bash
npm run workers
```

**Monitor queues:**

```bash
npm run queues:check
```

**Clear stuck jobs:**

```bash
npm run queues:clear
```

### Adding a New API Route

1. Create route file in `src/app/api/`
2. Validate input with Zod schema
3. Use server-side Supabase client for auth and data access

---

## Troubleshooting

### "User not authenticated" errors

- Ensure you're logged in: Visit http://localhost:3000/login
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in .env.local
- Verify Supabase is running: `npx supabase status`

### Background jobs not processing

- Verify workers are running: `npm run workers`
- Check Redis connection: `npm run queues:check`
- If Redis is down: `docker start citebite-redis`
- View worker logs in the terminal where workers are running

### "Supabase is not running" error

- Start Supabase: `npx supabase start`
- If stuck: `npx supabase stop && npx supabase start`
- Check Docker Desktop is running

### Database schema out of sync

- Reset database: `npx supabase db reset`
- Regenerate types: `npx supabase gen types typescript --local > src/types/database.types.ts`
- Restart dev server: `npm run dev`

### Hot reload not working

- Restart dev server: Stop (Ctrl+C) and run `npm run dev` again
- Clear Next.js cache: `rm -rf .next`
- Check for TypeScript errors in terminal

### API routes returning 404

- Verify route file exists in correct location (`src/app/api/`)
- Check file naming convention (use `route.ts`, not `index.ts`)
- Restart dev server

---

## Initial Supabase Setup

Before starting development, create a Supabase project:

1. Create a Supabase project at https://supabase.com
2. Note down your Project URL and anon key
3. Enable Google OAuth in Authentication > Providers
4. Create a Storage bucket named 'pdfs' (private)
5. Get your database connection string from Settings > Database

For detailed setup and RLS policies, see [DATABASE.md](./docs/planning/DATABASE.md).

---

## Cost Considerations

**Supabase Free Tier**: Database 500MB, Storage 1GB, Auth 50,000 MAU
**Gemini API**: Embedding $0.00001/1K chars, Flash $0.075/1M input tokens
**Expected costs** (100 users, 50 papers/collection): ~$0.05 per collection

For detailed cost analysis and growth-stage projections, see [INFRASTRUCTURE.md - Cost Analysis](./docs/planning/INFRASTRUCTURE.md).
