# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CiteBite (formerly ResearchGPT)** is an AI-powered research assistant that enables researchers to automatically collect papers on specific topics, chat with them using RAG (Retrieval-Augmented Generation), and generate insights about research trends.

### Core Value Proposition

- Automated paper collection from Semantic Scholar API (Open Access PDFs)
- Manual PDF upload support for non-Open Access papers
- Citation-backed AI conversations with proper source attribution
- Persistent conversation history across sessions
- Automatic insight generation (research trends, top papers, gaps)
- Public collection sharing for community collaboration

### Target Users

- Graduate students and PhD researchers
- R&D engineers in industry
- Domain experts tracking latest developments

---

## Tech Stack (Quick Reference)

**Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
**Backend**: Next.js API Routes, Supabase Auth
**Database**: Supabase PostgreSQL (Prisma ORM)
**Vector DB**: Gemini File Search API (managed RAG)
**Storage**: Supabase Storage (PDF files with CDN)
**Background Jobs**: BullMQ + Redis
**AI/ML**: Gemini 2.5 Flash
**External APIs**: Semantic Scholar, Gemini File Search

For detailed tech stack and implementation methods, refer to [Technical Documentation](#documentation-structure).

---

## Documentation Structure

Technical documentation is organized by concern for easier navigation:

- **[OVERVIEW.md](./docs/planning/OVERVIEW.md)** - System architecture, data flows, and feature-to-tech-stack mapping
- **[EXTERNAL_APIS.md](./docs/planning/EXTERNAL_APIS.md)** - Semantic Scholar and Gemini File Search API integration guides with detailed endpoint documentation
- **[FRONTEND.md](./docs/planning/FRONTEND.md)** - Frontend stack (Next.js, React, UI libraries, state management, component patterns)
- **[BACKEND.md](./docs/planning/BACKEND.md)** - Backend stack (API routes, authentication, input validation, HTTP clients)
- **[DATABASE.md](./docs/planning/DATABASE.md)** - Database design (PostgreSQL schema, Prisma ORM, Supabase Storage, RLS policies)
- **[INFRASTRUCTURE.md](./docs/planning/INFRASTRUCTURE.md)** - Background jobs (BullMQ), deployment (Vercel, Railway), security, testing, and cost analysis
- **[ROADMAP.md](./docs/ROADMAP.md)** - Detailed implementation checklist with 8 phases (~110 testable tasks)

**When to reference each document:**

- **Starting a new feature** → OVERVIEW.md for architecture context and data flow
- **API integration work** → EXTERNAL_APIS.md for endpoint details and error handling
- **UI development** → FRONTEND.md for component patterns and state management
- **Backend API work** → BACKEND.md for authentication, validation, and API patterns
- **Database changes** → DATABASE.md for schema, migrations, and RLS policies
- **Deployment/operations** → INFRASTRUCTURE.md for deployment configs, background jobs, and cost analysis
- **Implementation planning** → ROADMAP.md for phase-by-phase tasks with E2E test checkpoints

---

## Quick Start

```bash
# Install dependencies
npm install
# or
pnpm install

# Set up environment variables
cp .env.example .env.local
# Required environment variables:
# - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY (server-only)
# - DATABASE_URL (Supabase PostgreSQL connection string)
# - GEMINI_API_KEY
# - SEMANTIC_SCHOLAR_API_KEY
# - REDIS_URL (for BullMQ)

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

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
│   │   ├── collections/       # Collection pages
│   │   ├── chat/              # Chat interface
│   │   └── api/               # API routes
│   │       ├── auth/          # Supabase auth callback
│   │       ├── collections/   # Collection CRUD
│   │       ├── papers/        # Paper upload/management
│   │       └── conversations/ # Chat endpoints
│   ├── components/            # React components
│   ├── lib/                   # Utilities
│   │   ├── supabase/         # Supabase client (client & server)
│   │   ├── db/               # Prisma client, schemas
│   │   ├── jobs/             # BullMQ job definitions
│   │   ├── gemini/           # Gemini File Search client
│   │   ├── semantic-scholar/ # Semantic Scholar API client
│   │   └── storage/          # Supabase Storage helpers
│   └── types/                # TypeScript types
├── prisma/                    # Database schema and migrations
├── public/                    # Static assets
├── tests/                     # Test files
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
- Auto-generated insights (trends, top papers, gaps)
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

- Handle PDF downloads, indexing, and insight generation with BullMQ
- Minimize user wait time with progress indicators in UI
- Provide retry logic and clear error messages on failure

### 2. Citation Validation

**Don't skip citation validation** - LLMs hallucinate; verify cited papers exist in collection

- Extract cited paper IDs from Gemini's grounding metadata
- Verify papers actually exist in the collection
- Store citation information in database for traceability

### 3. Security First

**Never expose API keys to frontend**

- Use `NEXT_PUBLIC_*` prefix only for client-safe keys
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` must be server-side only
- Control data access with Supabase Row Level Security (RLS) policies
- Validate all user inputs (use Zod)

For detailed security guide, see [INFRASTRUCTURE.md - Security Best Practices](./docs/planning/INFRASTRUCTURE.md).

### 4. Performance Optimization

- Cache server state with React Query and automatic refetching
- Cache Semantic Scholar API responses in Redis (24 hours)
- Prevent N+1 queries with Prisma `include`
- Lazy load conversation messages (paginate when >50 messages)

For detailed optimization strategies, see [INFRASTRUCTURE.md - Performance Optimization](./docs/planning/INFRASTRUCTURE.md).

### 5. Failure Handling and User Experience

**Don't ignore failed PDFs** - Provide clear UI to retry or manually upload

- PDF download failure → Mark as `vectorStatus: 'failed'`, provide retry button
- Embedding failure → Retry 3 times, then notify user
- LLM timeout → Show partial response (if available) + retry button
- API rate limit → Queue with exponential backoff, show estimated wait time

---

## Development Roadmap

The project is divided into 8 phases (10-12 weeks total):

**Phase 1 (2-3 weeks):** Core foundation - Supabase setup (Auth, DB, Storage), Semantic Scholar integration, Gemini File Search setup, PDF download pipeline
**Phase 2 (2 weeks):** RAG pipeline and chat UI with citations
**Phase 3 (1 week):** Manual PDF upload for non-Open Access papers
**Phase 4 (1 week):** Conversation history and persistence
**Phase 5 (1 week):** Collection update with new papers
**Phase 6 (1-2 weeks):** Automatic insights dashboard
**Phase 7 (1 week):** Public collection sharing
**Phase 8 (1 week):** UX polish, testing, bug fixes

For detailed implementation checklist with ~110 testable tasks, E2E test checkpoints, and completion criteria for each phase, see **[ROADMAP.md](./docs/ROADMAP.md)**.

---

## Common Pitfalls to Avoid

1. **Don't embed entire papers** - While Gemini File Search handles chunking automatically, very large PDFs may fail processing (respect 100MB limit)
2. **Don't forget conversation context** - Include last 5-10 messages in LLM prompt to maintain conversation continuity
3. **Don't hard-delete conversations or collections** - Implement soft delete with recovery option
4. **Don't skip deduplication** - Same paper can appear in multiple collections (check duplicates by Semantic Scholar paper ID)
5. **Don't overload insights** - Keep summaries concise (3-5 bullet points per section)

For more implementation details and best practices, see [OVERVIEW.md](./docs/planning/OVERVIEW.md).

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
**Gemini File Search**: Free tier 1GB vector storage, Indexing $0.15/1M tokens
**Expected costs** (100 users, 50 papers/collection): ~$0.10 per collection

For detailed cost analysis and growth-stage projections, see [INFRASTRUCTURE.md - Cost Analysis](./docs/planning/INFRASTRUCTURE.md).
