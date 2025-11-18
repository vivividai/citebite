# CiteBite Implementation Workflow Checklist

> **Purpose**: This checklist breaks down the entire CiteBite implementation into small, testable units suitable for E2E validation after each step.
>
> **How to use**: Check off items as you complete them. Each item should be independently testable before moving to the next.

---

## Phase 1: Core Foundation (2-3 weeks)

### 1.1 Project Setup & Configuration _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [x] Initialize Next.js 14 project with TypeScript and App Router
- [x] Install core dependencies (Prisma, Supabase, Tailwind, shadcn/ui, BullMQ, Axios)
- [x] Configure environment variables template (.env.example)
- [x] Set up ESLint, Prettier, and Husky pre-commit hooks
- [x] **E2E Test**: Verify dev server starts successfully

### 1.2 Database Schema & Supabase CLI Setup _(→ [DATABASE](./planning/DATABASE.md))_

- [x] Initialize Supabase CLI in project (`npx supabase init`)
- [x] Start local Supabase development server (`npx supabase start`) - using local DB instead of remote
- [x] Create SQL migration files with schema (Users, Collections, Papers, CollectionPapers, Conversations, Messages) - Citations stored in Messages.cited_papers
- [x] Apply migrations to local database (`npx supabase db reset`)
- [x] Generate TypeScript types from schema (`npx supabase gen types typescript`)
- [x] Create Supabase client helpers (client-side and server-side)
- [x] **E2E Test**: Connect to database and query users table with Supabase client

### 1.3 Supabase Authentication _(→ [BACKEND](./planning/BACKEND.md), [DATABASE](./planning/DATABASE.md))_

- [ ] Create Supabase client helpers (client-side and server-side)
- [ ] Configure Google OAuth provider in Supabase dashboard
- [ ] Implement login page with Google OAuth button
- [ ] Create auth callback route (/api/auth/callback)
- [ ] Implement middleware for protected routes
- [ ] **E2E Test**: Complete login flow and verify session persistence

### 1.4 Basic UI Layout _(→ [FRONTEND](./planning/FRONTEND.md))_

- [x] Create root layout with navigation
- [x] Implement authentication state display (user avatar/logout)
- [x] Create home page with "Create Collection" CTA
- [x] Add shadcn/ui components (Button, Card, Input, Dialog)
- [x] **E2E Test**: Navigate between pages and verify layout renders

### 1.5 Semantic Scholar API Integration _(→ [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [x] Create Semantic Scholar API client (`lib/semantic-scholar/client.ts`)
- [x] Implement paper search function with filters (year, citations, Open Access)
- [x] Add retry logic and exponential backoff
- [x] Set up Redis connection for caching (24h TTL)
- [x] **E2E Test**: Search for papers on a topic and verify results

### 1.6 BullMQ & Redis Setup _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [x] Connect to Redis (Upstash or Railway) - configuration ready, actual Redis instance needed
- [x] Define three queues: `pdf-download`, `pdf-indexing`, `insight-generation`
- [x] Create queue client utilities (`lib/jobs/queues.ts`)
- [x] Create worker skeleton files (no logic yet)
- [x] Add job status polling API route
- [ ] **E2E Test**: Queue a test job and verify it appears in Redis (requires actual Redis instance)

### 1.7 Gemini File Search Integration _(→ [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [x] Initialize Gemini AI client with API key
- [x] Implement File Search Store creation function
- [x] Implement PDF upload to Store function
- [x] Add error handling for rate limits
- [x] **E2E Test**: Upload a sample PDF and verify Store creation

### 1.8 Supabase Storage Setup _(→ [DATABASE](./planning/DATABASE.md))_

- [x] Create 'pdfs' bucket in Supabase Storage
- [x] Set bucket to private mode
- [x] Implement storage helper functions (upload, download, delete)
- [x] Configure RLS policies for bucket access
- [x] **E2E Test**: Upload and download a test file

### 1.9 Collection Creation API _(→ [BACKEND](./planning/BACKEND.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [x] Create POST /api/collections route
- [x] Validate input with Zod schema (keywords, filters)
- [x] Search papers via Semantic Scholar
- [x] Save collection and papers to database
- [x] Create Gemini File Search Store
- [x] Queue PDF download jobs for Open Access papers
- [x] **E2E Test**: Create collection and verify database entries + jobs queued (tested: validation, auth, API integration)

### 1.10 Collection List UI _(→ [FRONTEND](./planning/FRONTEND.md))_

- [x] Display user's collections on home page
- [x] Show collection metadata (title, paper count, created date)
- [x] Add "Create Collection" dialog with search form
- [x] Show progress indicator while creating collection
- [x] **E2E Test**: Complete collection creation flow end-to-end

---

## Phase 2: RAG Pipeline & Chat (2 weeks)

### 2.1 PDF Download Worker _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md), [BACKEND](./planning/BACKEND.md))_

- [x] Implement download logic in worker (`lib/jobs/workers/pdf-download.ts`)
- [x] Download PDF from Semantic Scholar URL
- [x] Upload to Supabase Storage
- [x] Update `Paper.pdfUrl` and `Paper.storageKey`
- [x] Handle errors and queue retries (max 3 attempts)
- [x] Queue indexing job on success
- [x] **E2E Test**: Queue download job and verify PDF in storage

### 2.2 PDF Indexing Worker _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [x] Retrieve PDF from Supabase Storage
- [x] Upload PDF to Gemini File Search Store with metadata
- [x] Update `Paper.vectorStatus` to 'completed'
- [x] Handle API errors and update status to 'failed'
- [x] Implement exponential backoff for rate limits
- [x] **E2E Test**: Queue indexing job and verify vectorStatus updated

### 2.3 Collection Detail Page _(→ [FRONTEND](./planning/FRONTEND.md))_

- [x] Create /collections/[id] page
- [x] Display collection header (title, description, stats)
- [x] Show paper list with status indicators
- [x] Add tabs: Papers, Chat, Insights
- [x] Display processing progress (X/Y papers indexed)
- [x] **E2E Test**: View collection with mixed paper statuses

### 2.4 Paper List UI _(→ [FRONTEND](./planning/FRONTEND.md))_

- [x] Create paper table/card component
- [x] Display: title, authors, year, citations, Open Access badge
- [x] Add filters: status (all/indexed/failed), year range
- [x] Add sorting: relevance, citations, year
- [x] Show PDF download link (if available)
- [x] Add "View Abstract" modal
- [x] **E2E Test**: Filter and sort papers, open abstract modal

### 2.5 Conversation Schema _(→ [DATABASE](./planning/DATABASE.md))_

- [x] Create SQL migration for Conversation and Message tables
- [x] Create SQL migration for Citation table for tracking cited papers
- [x] Apply migration to database (`npx supabase db push`)
- [x] Add indexes for performance (collectionId, userId, createdAt)
- [x] Regenerate TypeScript types (`npx supabase gen types typescript`)
- [x] **E2E Test**: Create conversation record manually and query with Supabase client

### 2.6 Chat API - Create Conversation _(→ [BACKEND](./planning/BACKEND.md))_

- [ ] Create POST /api/conversations route
- [ ] Validate input (collectionId, verify ownership)
- [ ] Create conversation with auto-generated title placeholder
- [ ] Return conversation ID
- [ ] **E2E Test**: Create conversation via API

### 2.7 Chat API - Send Message _(→ [BACKEND](./planning/BACKEND.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [ ] Create POST /api/conversations/[id]/messages route
- [ ] Validate conversation exists and user has access
- [ ] Save user message to database
- [ ] Query Gemini with File Search tool
- [ ] Extract grounding metadata for citations
- [ ] Validate cited papers exist in collection
- [ ] Save AI response and citations to database
- [ ] **E2E Test**: Send message and verify response with citations

### 2.8 Chat API - Get Messages _(→ [BACKEND](./planning/BACKEND.md))_

- [ ] Create GET /api/conversations/[id]/messages route
- [ ] Return messages with citations (include paper metadata)
- [ ] Implement pagination (limit 50 messages)
- [ ] Add cursor-based pagination for older messages
- [ ] **E2E Test**: Retrieve conversation history

### 2.9 Chat UI - Message Display _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create message list component
- [ ] Display user and AI messages with styling
- [ ] Render markdown in messages
- [ ] Display citations with paper links
- [ ] Add syntax highlighting for code blocks
- [ ] **E2E Test**: View conversation with various message types

### 2.10 Chat UI - Message Input _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create message input component with textarea
- [ ] Add send button and keyboard shortcut (Cmd+Enter)
- [ ] Show loading state while waiting for response
- [ ] Display error messages for failed requests
- [ ] Add retry button for failed messages
- [ ] **E2E Test**: Send message and see response stream in

### 2.11 Citation Display Component _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create citation card component
- [ ] Show cited paper title, authors, year
- [ ] Link to paper in collection
- [ ] Show citation count indicator (e.g., "Cited 3 times")
- [ ] **E2E Test**: Click citation and navigate to paper

### 2.12 Suggested Questions _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Generate 3-5 starter questions based on collection papers
- [ ] Display as clickable chips below input
- [ ] Auto-fill input on click
- [ ] **E2E Test**: Click suggested question and send

---

## Phase 3: Manual PDF Upload (1 week)

### 3.1 Upload UI Component _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Install react-dropzone
- [ ] Create drag-and-drop upload component
- [ ] Add file validation (PDF only, max 100MB)
- [ ] Show upload progress bar
- [ ] Display success/error messages
- [ ] **E2E Test**: Upload PDF via drag-and-drop

### 3.2 Upload API _(→ [BACKEND](./planning/BACKEND.md), [DATABASE](./planning/DATABASE.md))_

- [ ] Create POST /api/papers/[paperId]/upload route
- [ ] Validate file type and size server-side
- [ ] Upload to Supabase Storage
- [ ] Update Paper.pdfUrl and Paper.storageKey
- [ ] Queue indexing job
- [ ] **E2E Test**: Upload PDF and verify queued for indexing

### 3.3 Storage RLS Policies _(→ [DATABASE](./planning/DATABASE.md))_

- [ ] Create policy: users can upload to their collections
- [ ] Create policy: users can download from their collections
- [ ] Test with authenticated and unauthenticated users
- [ ] **E2E Test**: Verify unauthorized users can't access PDFs

### 3.4 Paper Status Management _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Add "Upload PDF" button for non-Open Access papers
- [ ] Show upload modal when clicked
- [ ] Update UI after successful upload (show indexing status)
- [ ] Add "Retry" button for failed papers
- [ ] **E2E Test**: Upload manual PDF and verify status updates

---

## Phase 4: Conversation History (1 week)

### 4.1 Auto Title Generation _(→ [BACKEND](./planning/BACKEND.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [ ] Call Gemini API after first user message
- [ ] Generate concise title (max 60 chars)
- [ ] Update Conversation.title
- [ ] **E2E Test**: Create conversation and verify title generated

### 4.2 Conversation List UI _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create conversation dropdown selector
- [ ] Display: title, date, message count
- [ ] Add "New Conversation" option
- [ ] Sort by last message date (most recent first)
- [ ] **E2E Test**: Select conversation and verify messages load

### 4.3 Load Previous Conversation _(→ [FRONTEND](./planning/FRONTEND.md), [BACKEND](./planning/BACKEND.md))_

- [ ] Fetch conversation messages on selection
- [ ] Render message history in chat UI
- [ ] Maintain scroll position (bottom for new, preserve for old)
- [ ] Include conversation context in new messages (last 10 messages)
- [ ] **E2E Test**: Resume conversation and send new message

### 4.4 Edit Conversation Title _(→ [FRONTEND](./planning/FRONTEND.md), [BACKEND](./planning/BACKEND.md))_

- [ ] Add edit icon next to title
- [ ] Inline editing with text input
- [ ] Save on Enter or blur
- [ ] Update UI optimistically
- [ ] **E2E Test**: Edit title and verify saved

### 4.5 Delete Conversation _(→ [FRONTEND](./planning/FRONTEND.md), [BACKEND](./planning/BACKEND.md))_

- [ ] Add delete button in conversation dropdown
- [ ] Show confirmation dialog
- [ ] Soft delete (set deletedAt timestamp)
- [ ] Remove from UI
- [ ] Redirect to new conversation if currently viewing
- [ ] **E2E Test**: Delete conversation and verify no longer appears

---

## Phase 5: Collection Update (1 week)

### 5.1 Check for Updates API _(→ [BACKEND](./planning/BACKEND.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [ ] Create GET /api/collections/[id]/check-updates route
- [ ] Search with original criteria + `publicationDateAfter` filter
- [ ] Deduplicate against existing papers (by Semantic Scholar ID)
- [ ] Return list of new papers
- [ ] **E2E Test**: Check updates and verify new papers returned

### 5.2 Add Papers API _(→ [BACKEND](./planning/BACKEND.md))_

- [ ] Create POST /api/collections/[id]/add-papers route
- [ ] Accept array of paper IDs
- [ ] Create CollectionPaper relations
- [ ] Queue PDF download jobs
- [ ] **E2E Test**: Add papers and verify jobs queued

### 5.3 Update UI _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Add "Check for new papers" button in collection header
- [ ] Show loading state while checking
- [ ] Display new papers in modal with checkboxes
- [ ] Add "Add All" and "Add Selected" buttons
- [ ] Show notification after adding papers
- [ ] **E2E Test**: Complete update flow end-to-end

### 5.4 Insight Regeneration Trigger _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [ ] Queue insight generation job after adding papers
- [ ] Update insights UI when job completes
- [ ] Show notification: "Insights updated"
- [ ] **E2E Test**: Verify insights regenerate after update

---

## Phase 6: Insights Dashboard (1-2 weeks)

### 6.1 Insight Generation Logic _(→ [BACKEND](./planning/BACKEND.md), [EXTERNAL_APIS](./planning/EXTERNAL_APIS.md))_

- [ ] Aggregate paper abstracts and metadata
- [ ] Create Gemini prompt for trend analysis
- [ ] Define JSON response schema (trends, top papers, gaps)
- [ ] Parse and validate response
- [ ] Extract top papers by citation count (Top 5)
- [ ] **E2E Test**: Generate insights manually and verify output

### 6.2 Insight Generation Worker _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [ ] Implement worker in `lib/jobs/workers/insight-generation.ts`
- [ ] Handle long-running LLM calls (timeout: 60s)
- [ ] Retry on transient errors (max 2 attempts)
- [ ] Save to Collection.insightSummary (JSONB field)
- [ ] Update Collection.lastInsightGeneratedAt
- [ ] **E2E Test**: Queue job and verify insights saved

### 6.3 Insights Dashboard UI _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create Insights tab in collection detail
- [ ] Display main research trends (3-5 cards)
- [ ] Show top papers list with citations
- [ ] Display recent trends (last 1 year)
- [ ] Show research gaps section
- [ ] Add "Refresh Insights" button
- [ ] **E2E Test**: View insights dashboard with real data

### 6.4 Suggested Questions from Insights _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Generate 3-5 questions based on trends and gaps
- [ ] Display in both Insights and Chat tabs
- [ ] Click to navigate to Chat and auto-fill
- [ ] **E2E Test**: Click suggested question and verify navigation

### 6.5 Auto-trigger on Collection Creation _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [ ] Queue insight job after all PDFs indexed
- [ ] Poll job status and update UI
- [ ] Show "Generating insights..." state
- [ ] **E2E Test**: Create collection and verify insights auto-generate

---

## Phase 7: Public Collections (1 week)

### 7.1 Public/Private Toggle _(→ [FRONTEND](./planning/FRONTEND.md), [BACKEND](./planning/BACKEND.md), [DATABASE](./planning/DATABASE.md))_

- [ ] Add isPublic field UI (toggle switch)
- [ ] Create PATCH /api/collections/[id] route
- [ ] Validate user ownership before updating
- [ ] Update RLS policies to allow public read access
- [ ] **E2E Test**: Toggle collection visibility and verify access

### 7.2 Public Collections Discovery Page _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create /discover page
- [ ] Fetch public collections (paginated, 20 per page)
- [ ] Display collection cards with preview (title, paper count, creator)
- [ ] Add search input (filter by keywords)
- [ ] Add sort options (popular, recent, most papers)
- [ ] **E2E Test**: Browse public collections and search

### 7.3 Copy Collection API _(→ [BACKEND](./planning/BACKEND.md))_

- [ ] Create POST /api/collections/[id]/copy route
- [ ] Create new Collection with same metadata
- [ ] Copy CollectionPaper relations (reference same papers)
- [ ] Share fileSearchStoreId (no re-indexing)
- [ ] Copy insightSummary
- [ ] Increment original Collection.copyCount
- [ ] **E2E Test**: Copy public collection and verify papers accessible

### 7.4 Collection Statistics _(→ [BACKEND](./planning/BACKEND.md), [DATABASE](./planning/DATABASE.md))_

- [ ] Add copyCount field to Collection model
- [ ] Display on public collection cards
- [ ] Track unique user count (derived from copies + owner)
- [ ] **E2E Test**: Verify stats update after copy

### 7.5 Public Collection View _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Allow unauthenticated users to view public collections
- [ ] Show "Copy to My Collections" button for non-owners
- [ ] Disable chat for non-owners (show "Copy to chat")
- [ ] Show read-only insights
- [ ] **E2E Test**: View public collection without authentication

---

## Phase 8: Polish & Testing (1 week)

### 8.1 Progress Indicators _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create real-time status polling hook
- [ ] Display progress bar for PDF processing (X/Y indexed)
- [ ] Show estimated time remaining
- [ ] Add WebSocket alternative if polling is too slow
- [ ] **E2E Test**: Monitor progress in real-time

### 8.2 Error Handling & Retry _(→ [FRONTEND](./planning/FRONTEND.md), [BACKEND](./planning/BACKEND.md))_

- [ ] Create user-friendly error message components
- [ ] Add retry buttons for failed operations
- [ ] Implement retry logic in API routes
- [ ] Show specific error messages (rate limit, timeout, etc.)
- [ ] **E2E Test**: Trigger errors and verify retry works

### 8.3 Empty States _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] "No collections yet" with "Create Collection" CTA
- [ ] "No papers in collection" (should not happen)
- [ ] "No conversations yet" with starter questions
- [ ] "No insights generated yet" with explanation
- [ ] **E2E Test**: Verify all empty states render correctly

### 8.4 Onboarding Flow _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Create welcome modal (3 slides)
- [ ] Explain: 1) Create collections, 2) Chat with AI, 3) Get insights
- [ ] Add "Create Sample Collection" option
- [ ] Set onboarding complete flag (User.onboardingCompleted)
- [ ] **E2E Test**: Complete onboarding and create sample collection

### 8.5 Performance Optimization _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md), [FRONTEND](./planning/FRONTEND.md))_

- [ ] Add React Query for server state caching
- [ ] Configure staleTime and cacheTime per query
- [ ] Optimize Prisma queries with `include` (avoid N+1)
- [ ] Add database indexes for common queries
- [ ] Configure Supabase Storage CDN
- [ ] **E2E Test**: Measure page load times and API response times

### 8.6 Loading States _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Add skeleton loaders for all data fetching
- [ ] Show spinners for button actions
- [ ] Optimistic UI updates where possible
- [ ] **E2E Test**: Verify smooth loading experience

### 8.7 Responsive Design (Desktop-first) _(→ [FRONTEND](./planning/FRONTEND.md))_

- [ ] Ensure minimum 1024px width works well
- [ ] Test on common resolutions (1920x1080, 1440x900)
- [ ] Add horizontal scroll for narrow screens
- [ ] **E2E Test**: Test on different screen sizes

### 8.8 E2E Test Suite _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [ ] Write Playwright tests for critical paths:
  - [ ] Authentication flow
  - [ ] Collection creation
  - [ ] Paper upload
  - [ ] Chat conversation
  - [ ] Collection update
  - [ ] Public collection copy
- [ ] Set up CI pipeline to run tests
- [ ] **E2E Test**: All tests pass in CI

### 8.9 Security Audit _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md), [DATABASE](./planning/DATABASE.md), [BACKEND](./planning/BACKEND.md))_

- [ ] Verify all API keys are server-only (no NEXT*PUBLIC* for secrets)
- [ ] Test RLS policies with different user scenarios
- [ ] Validate all user inputs with Zod
- [ ] Test CORS configuration
- [ ] Check for SQL injection vulnerabilities
- [ ] **E2E Test**: Attempt unauthorized access and verify blocked

### 8.10 Production Deployment _(→ [INFRASTRUCTURE](./planning/INFRASTRUCTURE.md))_

- [ ] Deploy to Vercel (frontend + API routes)
- [ ] Deploy workers to Railway or separate server
- [ ] Configure environment variables in production
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Configure domain and SSL
- [ ] **E2E Test**: Run smoke tests in production

---

## Summary

**Total Tasks**: ~110 items across 8 phases

**Task Characteristics**:

- Each task is completable in 1-4 hours
- Independently testable with E2E validation
- Committable as discrete changes
- Clear acceptance criteria

**Phase Dependencies**:

- Complete phases sequentially for best results
- Each phase builds on previous foundations
- Some tasks within phases can run in parallel

**Testing Strategy**:

- Manual E2E test after each task
- Automated E2E tests in Phase 8
- Continuous validation throughout development

**Progress Tracking**:

- Check off items as completed
- Document blockers or issues inline
- Update estimates based on actual time spent

---

## Related Documentation

For detailed technical specifications, refer to:

- [OVERVIEW.md](./planning/OVERVIEW.md) - System architecture and data flow
- [EXTERNAL_APIS.md](./planning/EXTERNAL_APIS.md) - API integration details
- [FRONTEND.md](./planning/FRONTEND.md) - Frontend stack and patterns
- [BACKEND.md](./planning/BACKEND.md) - Backend implementation guide
- [DATABASE.md](./planning/DATABASE.md) - Database schema and RLS policies
- [INFRASTRUCTURE.md](./planning/INFRASTRUCTURE.md) - Deployment and operations

---

**Last Updated**: 2025-11-15
**Version**: 1.0
**Status**: Ready for implementation
