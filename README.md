# CiteBite

AI-powered research assistant that helps researchers collect papers and chat with them using RAG (Retrieval-Augmented Generation).

## Features

- **Automated Paper Collection** - Search and collect papers from Semantic Scholar with Open Access PDFs
- **Manual PDF Upload** - Upload paywalled or local PDFs to your collection
- **Citation-backed AI Chat** - Ask questions and get answers with proper source citations
- **Conversation History** - Save and resume conversations across sessions
- **Collection Sharing** - Share your curated collections publicly

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Supabase Auth (Google OAuth)
- **Database**: Supabase PostgreSQL with pgvector for embeddings
- **Storage**: Supabase Storage for PDFs
- **Background Jobs**: BullMQ + Redis
- **AI**: Google Gemini 2.5 Flash, Gemini embedding-001
- **External APIs**: Semantic Scholar

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop
- npm

### 1. Clone and Install

```bash
git clone https://github.com/vivividai/citebite.git
cd citebite
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys:

```env
# Supabase (from https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini AI (from https://aistudio.google.com)
GEMINI_API_KEY=your-gemini-api-key

# Redis (local default)
REDIS_URL=redis://localhost:6379

# Optional
SEMANTIC_SCHOLAR_API_KEY=your-api-key  # Higher rate limits
```

### 3. Start Services

```bash
# Terminal 1: Start Supabase (first time takes ~5 min)
npx supabase start

# Terminal 2: Start Redis
docker run -d --name citebite-redis -p 6379:6379 redis:7-alpine

# Terminal 3: Start background workers
npm run workers

# Terminal 4: Start dev server
npm run dev
```

### 4. Initialize Database

```bash
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.types.ts
```

Open http://localhost:3000

### Verify Setup

| Service         | URL                    |
| --------------- | ---------------------- |
| App             | http://localhost:3000  |
| Supabase Studio | http://localhost:54323 |

### Stop Services

```bash
npx supabase stop
docker stop citebite-redis
# Ctrl+C for workers and dev server
```

## Scripts

| Command                | Description                  |
| ---------------------- | ---------------------------- |
| `npm run dev`          | Start development server     |
| `npm run build`        | Build for production         |
| `npm run workers`      | Start background job workers |
| `npm run queues:check` | Monitor queue status         |
| `npm run queues:clear` | Clear all queues (dev only)  |

## Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── (auth)/         # Auth pages (login, callback)
│   ├── collections/    # Collection pages with chat UI
│   └── api/            # API routes
├── components/         # React components
├── lib/                # Utilities
│   ├── supabase/      # Supabase clients
│   ├── gemini/        # Gemini AI integration
│   ├── jobs/          # BullMQ job definitions
│   └── semantic-scholar/  # Paper search API
└── types/              # TypeScript types
```

## Documentation

See [`docs/planning/`](./docs/planning/) for detailed technical documentation:

- [OVERVIEW.md](./docs/planning/OVERVIEW.md) - System architecture
- [DATABASE.md](./docs/planning/DATABASE.md) - Schema and migrations
- [ROADMAP.md](./docs/ROADMAP.md) - Implementation roadmap

## License

MIT
