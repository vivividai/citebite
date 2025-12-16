# Paper Chunks Deduplication Plan

## Goal

Remove `collection_id` from `paper_chunks` to prevent duplicate embeddings for the same paper.
Store PDF and Figure once per paper.

## User Decisions

- **Data migration**: Clean slate (delete existing data and start fresh)
- **PDF storage**: `papers/{paperId}.pdf` (store once per paper)
- **Figure storage**: Separate `figures` bucket
- **Orphan handling**: Keep (don't delete, can be reused later)

---

## Phase 1: Database Schema Migration

### 1.1 Create new migration file

**File**: `supabase/migrations/20251216000000_remove_chunk_collection_id.sql`

```sql
-- 1. Drop existing constraints and indexes
ALTER TABLE paper_chunks DROP CONSTRAINT IF EXISTS unique_chunk;
DROP INDEX IF EXISTS idx_chunks_collection;

-- 2. Clear existing data (clean slate)
TRUNCATE TABLE paper_chunks;

-- 3. Remove collection_id column
ALTER TABLE paper_chunks DROP COLUMN collection_id;

-- 4. Add new unique constraint (paper-level)
ALTER TABLE paper_chunks
ADD CONSTRAINT unique_paper_chunk UNIQUE (paper_id, chunk_index, chunk_type);

-- 5. Update RLS Policies (JOIN with collection_papers)
DROP POLICY IF EXISTS "Users can read own collection chunks" ON paper_chunks;
DROP POLICY IF EXISTS "Users can read public collection chunks" ON paper_chunks;

CREATE POLICY "Users can read chunks for their papers"
ON paper_chunks FOR SELECT TO authenticated
USING (
  paper_id IN (
    SELECT cp.paper_id FROM collection_papers cp
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can read chunks for public papers"
ON paper_chunks FOR SELECT TO authenticated
USING (
  paper_id IN (
    SELECT cp.paper_id FROM collection_papers cp
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.is_public = true
  )
);

-- 6. Update hybrid_search function (JOIN with collection_papers)
DROP FUNCTION IF EXISTS hybrid_search(UUID, vector(768), TEXT, INT, FLOAT);

CREATE OR REPLACE FUNCTION hybrid_search(
  p_collection_id UUID,
  p_query_embedding vector(768),
  p_query_text TEXT,
  p_limit INT DEFAULT 20,
  p_semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (...) AS $$
WITH collection_paper_ids AS (
  SELECT paper_id FROM collection_papers WHERE collection_id = p_collection_id
),
semantic AS (
  SELECT ... FROM paper_chunks pc
  WHERE pc.paper_id IN (SELECT paper_id FROM collection_paper_ids)
  ...
),
...
$$ LANGUAGE SQL;

-- 7. Add index for efficient collection filtering
CREATE INDEX IF NOT EXISTS idx_collection_papers_paper_id
ON collection_papers(paper_id);
```

---

## Phase 2: Storage Restructure

### 2.1 Create figures bucket

**File**: `supabase/migrations/20251216000001_create_figures_bucket.sql`

```sql
-- Create separate bucket for figures
INSERT INTO storage.buckets (id, name, public)
VALUES ('figures', 'figures', false)
ON CONFLICT (id) DO NOTHING;
```

### 2.2 Update storage paths

**New structure**:

- PDF: `pdfs` bucket → `papers/{paperId}.pdf`
- Figure: `figures` bucket → `{paperId}/{figureNumber}.png`

---

## Phase 3: Code Changes

### 3.1 `src/lib/db/chunks.ts`

- Remove `collectionId` from `ChunkInsert` interface
- Update `insertChunks()`: remove `collection_id` from insert
- Update `insertChunksWithFigureRefs()`: remove `collection_id`
- Update `deleteChunksForPaper()`: remove `collectionId` param
- **Remove** `deleteChunksForCollection()` (no longer needed)
- Update `getChunkCountForPaper()`: remove `collectionId` param
- Update `isPaperIndexed()`: remove `collectionId` param
- Update `getTextChunksWithFigureRefs()`: remove `collectionId` param
- Add `getChunkCountForCollection()` using JOIN with collection_papers

### 3.2 `src/lib/storage/supabaseStorage.ts`

- Update `getStoragePath(paperId)`: return `papers/${paperId}.pdf`
- Update `uploadPdf()`: remove `collectionId` param
- Update `getPdfUrl()`: remove `collectionId` param
- Update `downloadPdf()`: remove `collectionId` param
- Update `deletePdf()`: remove `collectionId` param
- Update `pdfExists()`: remove `collectionId` param
- **Remove** `deleteCollectionPdfs()` (no longer needed)
- Update `moveFromTempToPermanent()`: remove `collectionId` param
- Update figure functions to use `figures` bucket

### 3.3 `src/lib/jobs/queues.ts`

- Update `PdfDownloadJobData`: remove `collectionId`
- Update `PdfIndexJobData`: remove `collectionId`
- Update `FigureAnalysisJobData`: remove `collectionId`

### 3.4 `src/lib/jobs/workers/pdfDownloadWorker.ts`

- Remove `collectionId` from job data
- Check if PDF already exists before downloading
- Skip download if paper already has PDF

### 3.5 `src/lib/jobs/workers/pdfIndexWorker.ts`

- Remove `collectionId` from chunk insertion
- Check if paper already indexed before processing
- Skip indexing if chunks already exist

### 3.6 `src/lib/jobs/workers/figureAnalysisWorker.ts`

- Update to use `figures` bucket
- Remove `collectionId` from operations

### 3.7 `src/lib/rag/figure-indexer.ts`

- Remove `collectionId` from `FigureChunkInput`
- Update `indexFigures()` and `indexAnalyzedFigures()`
- Update `deleteFigureChunks()` to only take `paperId`

### 3.8 API Routes (paper removal logic)

**Files**:

- `src/app/api/collections/[id]/papers/[paperId]/route.ts`
- `src/app/api/collections/[id]/papers/batch-delete/route.ts`
- `src/app/api/collections/[id]/route.ts`

**Changes**:

- Only remove `collection_papers` link
- Do NOT delete chunks or PDF (orphan handling = keep)
- Paper record stays in `papers` table

---

## Phase 4: Reset paper status

### 4.1 Reset all papers to pending

Since clean slate, need to trigger re-indexing:

```sql
UPDATE papers SET text_vector_status = 'pending', figure_vector_status = 'pending';
```

---

## Files to Modify (Summary)

| File                                                                | Changes                                |
| ------------------------------------------------------------------- | -------------------------------------- |
| `supabase/migrations/20251216000000_remove_chunk_collection_id.sql` | **NEW** - Schema migration             |
| `supabase/migrations/20251216000001_create_figures_bucket.sql`      | **NEW** - Figures bucket               |
| `src/lib/db/chunks.ts`                                              | Remove collectionId from all functions |
| `src/lib/storage/supabaseStorage.ts`                                | Update paths, remove collectionId      |
| `src/lib/jobs/queues.ts`                                            | Update job data interfaces             |
| `src/lib/jobs/workers/pdfDownloadWorker.ts`                         | Remove collectionId, add skip logic    |
| `src/lib/jobs/workers/pdfIndexWorker.ts`                            | Remove collectionId, add skip logic    |
| `src/lib/jobs/workers/figureAnalysisWorker.ts`                      | Use figures bucket                     |
| `src/lib/rag/figure-indexer.ts`                                     | Remove collectionId                    |
| `src/app/api/collections/[id]/papers/[paperId]/route.ts`            | Only remove link                       |
| `src/app/api/collections/[id]/papers/batch-delete/route.ts`         | Only remove links                      |
| `src/app/api/collections/[id]/route.ts`                             | Remove deleteChunksForCollection call  |

---

## Edge Cases

1. **Same paper added to multiple collections**:
   - Download once, index once
   - Workers check `pdfExists()` and `isPaperIndexed()` first

2. **Paper removed from collection**:
   - Only remove `collection_papers` link
   - Chunks and PDF remain (for potential reuse)

3. **Re-indexing a paper**:
   - Delete existing chunks for paper
   - Re-create chunks
   - All collections automatically see updated results

4. **Collection deletion**:
   - Delete `collection_papers` links (CASCADE)
   - Do NOT delete chunks or PDFs

---

## Testing Checklist

- [ ] Hybrid search returns correct results for collection
- [ ] Adding paper to second collection does not duplicate chunks
- [ ] Removing paper from collection keeps chunks
- [ ] PDF stored at `papers/{paperId}.pdf`
- [ ] Figures stored in `figures` bucket at `{paperId}/{figureNumber}.png`
- [ ] Workers skip already-indexed papers
- [ ] RLS policies work correctly
