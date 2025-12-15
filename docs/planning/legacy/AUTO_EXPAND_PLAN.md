# Auto Expand Feature Implementation Plan

## Overview

Initial search 노드로부터 지정한 차수(1-3)까지 참조/인용 논문을 일괄 탐색하여 collection에 추가하는 기능 구현.

## User Requirements

- **차수 설정**: 슬라이더로 1-3차 선택
- **타입 설정**: 모든 차수에 동일한 references/citations/both 적용
- **결과 처리**: Preview 후 선택 추가 (기존 PaperPreviewDialog 재사용)

---

## Implementation Steps

### Phase 0: Database Schema - Add Degree Field

#### 0.1 Create Migration for Degree Column

**File**: `supabase/migrations/YYYYMMDDHHMMSS_add_degree_to_collection_papers.sql` (NEW)

```sql
-- Add degree column to track expansion level
ALTER TABLE collection_papers
ADD COLUMN degree SMALLINT DEFAULT 0;

-- degree values:
-- 0 = search (initial search results)
-- 1 = 1st degree expansion (refs/cites from search results)
-- 2 = 2nd degree expansion (refs/cites from degree 1)
-- 3 = 3rd degree expansion (refs/cites from degree 2)

-- Add constraint to ensure valid degree values
ALTER TABLE collection_papers
ADD CONSTRAINT chk_degree CHECK (degree >= 0 AND degree <= 3);

-- Add index for efficient degree-based queries
CREATE INDEX idx_collection_papers_degree ON collection_papers(collection_id, degree);

-- Comment for documentation
COMMENT ON COLUMN collection_papers.degree IS 'Expansion degree: 0=search, 1-3=expansion levels from initial search results';
```

#### 0.2 Update TypeScript Database Types

**File**: `src/types/database.types.ts` (REGENERATE)

After migration, run:

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

Expected new field in `collection_papers`:

```typescript
degree: number | null;
```

#### 0.3 Update PaperLinkData Interface

**File**: `src/lib/db/collections.ts` (MODIFY)

```typescript
export interface PaperLinkData {
  paperId: string;
  sourcePaperId?: string | null;
  relationshipType?: RelationshipType;
  similarityScore?: number | null;
  degree?: number; // NEW: 0=search, 1-3=expansion levels
}
```

Update `linkPapersToCollection` function to include degree:

```typescript
const collectionPapers = paperDataArray.map(paper => ({
  collection_id: collectionId,
  paper_id: paper.paperId,
  source_paper_id: paper.sourcePaperId ?? null,
  relationship_type: paper.relationshipType ?? 'search',
  similarity_score: paper.similarityScore ?? null,
  degree: paper.degree ?? 0, // NEW
}));
```

#### 0.4 Update Graph Types and API

**File**: `src/types/graph.ts` (MODIFY)

```typescript
export interface GraphNode {
  // ... existing fields
  degree: number; // NEW: 0=search, 1-3=expansion levels
}
```

**File**: `src/app/api/collections/[id]/graph/route.ts` (MODIFY)

Add degree to the SELECT query and GraphNode mapping.

---

### Phase 1: Backend - API Endpoint

#### 1.1 Create Zod Validation Schema

**File**: `src/lib/validations/auto-expand.ts` (NEW)

```typescript
import { z } from 'zod';

export const autoExpandPreviewSchema = z.object({
  degree: z.number().int().min(1).max(3),
  type: z.enum(['references', 'citations', 'both']),
  influentialOnly: z.boolean().default(false),
  maxPapersPerNode: z.number().int().min(10).max(100).default(50),
});

export type AutoExpandPreviewInput = z.infer<typeof autoExpandPreviewSchema>;
```

#### 1.2 Create Auto-Expand Preview API

**File**: `src/app/api/collections/[id]/auto-expand/preview/route.ts` (NEW)

**Algorithm**:

1. Get all "search" relationship nodes (degree=0) from collection
2. For each degree (1 to N):
   - Get source nodes = papers at (current_degree - 1)
   - Fetch refs/citations for all source nodes
   - 100ms delay between API calls (rate limiting)
   - Deduplicate against: existing collection + all previously found papers
   - Track `sourcePaperId` and `degree` for each paper
3. Fetch embeddings via `getPapersBatchParallel`
4. Re-rank by similarity to collection query
5. Return papers with degree metadata

**Response Type** (extend PaperPreview):

```typescript
interface AutoExpandPaperPreview extends PaperPreview {
  degree: 1 | 2 | 3;
  sourcePaperId: string;
}
```

**Detailed Implementation**:

```typescript
// Pseudocode for the algorithm
async function autoExpandPreview(
  collectionId,
  { degree, type, influentialOnly, maxPapersPerNode }
) {
  const supabase = await createServerSupabaseClient();
  const client = getSemanticScholarClient();

  // 1. Get existing papers with their degrees
  const { data: existingPapers } = await supabase
    .from('collection_papers')
    .select('paper_id, degree')
    .eq('collection_id', collectionId);

  const existingPaperIds = new Set(existingPapers.map(p => p.paper_id));
  const seenPaperIds = new Set(existingPaperIds); // Global dedup

  // 2. Group existing papers by degree
  const papersByDegree = new Map<number, string[]>();
  for (const p of existingPapers) {
    const deg = p.degree ?? 0;
    if (!papersByDegree.has(deg)) papersByDegree.set(deg, []);
    papersByDegree.get(deg)!.push(p.paper_id);
  }

  // 3. Iteratively expand for each degree level
  const allDiscoveredPapers: AutoExpandPaperPreview[] = [];

  for (let currentDegree = 1; currentDegree <= degree; currentDegree++) {
    const sourcePaperIds = papersByDegree.get(currentDegree - 1) || [];
    if (sourcePaperIds.length === 0) break;

    const degreeResults: AutoExpandPaperPreview[] = [];

    for (const sourcePaperId of sourcePaperIds) {
      // Fetch refs and/or citations based on type
      const papers = await fetchRefsOrCitations(
        client,
        sourcePaperId,
        type,
        influentialOnly,
        maxPapersPerNode
      );

      for (const paper of papers) {
        if (seenPaperIds.has(paper.paperId)) continue;
        seenPaperIds.add(paper.paperId);

        degreeResults.push({
          ...paper,
          degree: currentDegree,
          sourcePaperId,
        });
      }

      await delay(100); // Rate limiting
    }

    // Add discovered papers to the degree map for next iteration
    papersByDegree.set(
      currentDegree,
      degreeResults.map(p => p.paperId)
    );
    allDiscoveredPapers.push(...degreeResults);
  }

  // 4. Re-rank by similarity (existing pattern)
  const rankedPapers = await rankBySimilarity(
    allDiscoveredPapers,
    collectionQuery
  );

  return rankedPapers;
}
```

#### 1.3 Update Expand Collection API

**File**: `src/app/api/collections/[id]/expand/route.ts` (MODIFY)

Current schema:

```typescript
export const expandCollectionSchema = z.object({
  selectedPaperIds: z.array(z.string()).min(1),
  sourcePaperId: z.string().min(1), // Single source
  sourceTypes: z.record(z.string(), z.enum(['reference', 'citation'])),
  similarities: z.record(z.string(), z.number()).optional(),
});
```

New schema (backward compatible):

```typescript
export const expandCollectionSchema = z.object({
  selectedPaperIds: z.array(z.string()).min(1),
  sourcePaperId: z.string().optional(), // Optional for auto-expand
  sourcePaperIds: z.record(z.string(), z.string()).optional(), // NEW: paperId -> sourcePaperId
  sourceTypes: z.record(z.string(), z.enum(['reference', 'citation'])),
  similarities: z.record(z.string(), z.number()).optional(),
  degrees: z.record(z.string(), z.number()).optional(), // NEW: paperId -> degree
});
```

Update `linkPapersToCollection` call:

```typescript
const paperLinkData = upsertedPaperIds.map(paperId => ({
  paperId,
  sourcePaperId: sourcePaperIds?.[paperId] ?? sourcePaperId, // Support both
  relationshipType: sourceTypes[paperId] ?? 'reference',
  similarityScore: similarities?.[paperId] ?? null,
  degree: degrees?.[paperId] ?? 1, // NEW
}));
```

---

### Phase 2: Frontend - Types & Hook

#### 2.1 Extend PaperPreview Type

**File**: `src/lib/search/types.ts` (MODIFY)

```typescript
export interface PaperPreview {
  // ... existing fields
  degree?: 1 | 2 | 3; // For auto-expand feature
  sourcePaperId?: string; // Which paper was expanded to find this
}
```

#### 2.2 Create useAutoExpandPreview Hook

**File**: `src/hooks/useAutoExpandPreview.ts` (NEW)

```typescript
import { useMutation } from '@tanstack/react-query';
import type { PaperPreview } from '@/lib/search/types';
import type { AutoExpandPreviewInput } from '@/lib/validations/auto-expand';

interface AutoExpandPreviewResponse {
  success: boolean;
  data: {
    papers: PaperPreview[];
    stats: {
      degree1Count: number;
      degree2Count: number;
      degree3Count: number;
      totalCount: number;
    };
  };
}

export function useAutoExpandPreview(collectionId: string) {
  return useMutation({
    mutationFn: async (
      input: AutoExpandPreviewInput
    ): Promise<AutoExpandPreviewResponse> => {
      const response = await fetch(
        `/api/collections/${collectionId}/auto-expand/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch auto-expand preview');
      }

      return response.json();
    },
  });
}
```

#### 2.3 Update useExpandCollection Hook

**File**: `src/hooks/useExpandCollection.ts` (MODIFY)

Update input type to support batch source mapping:

```typescript
interface ExpandCollectionInput {
  selectedPaperIds: string[];
  sourcePaperId?: string; // Optional for single-source expand
  sourcePaperIds?: Record<string, string>; // For auto-expand: paperId -> sourcePaperId
  sourceTypes: Record<string, 'reference' | 'citation'>;
  similarities?: Record<string, number>;
  degrees?: Record<string, number>; // NEW: paperId -> degree
}
```

---

### Phase 3: Frontend - UI Components

#### 3.1 Create AutoExpandDialog

**File**: `src/components/collections/AutoExpandDialog.tsx` (NEW)

**UI Elements:**

- **Header**: "Auto Expand Collection"
- **Description**: "Automatically discover related papers by traversing references and citations from your search results."

- **Degree Slider** (1-3):

  ```
  Expansion Depth: [====O====] 2

  • Degree 1: Direct refs/citations from search results
  • Degree 2: + refs/citations from degree 1 papers
  • Degree 3: + refs/citations from degree 2 papers
  ```

- **Type Select** (reuse pattern from ExpandCollectionDialog):
  - References only
  - Citations only
  - Both

- **Influential Only Checkbox**:

  ```
  [x] Only include influential papers
  ```

- **Max Papers Per Node Slider** (10-100, default 50):

  ```
  Max papers per node: [====O====] 50
  ```

- **Scope Estimation** (calculated from searchNodeCount and degree):

  ```
  ℹ️ Estimated scope: ~{estimate} papers from {searchNodeCount} search results
  ⚠️ Warning: This operation may take several minutes for large collections
  ```

- **Preview Button** → triggers mutation with loading state
- **Progress indicator** during preview fetch (spinner + "Fetching papers...")

**State Management:**

```typescript
const [degree, setDegree] = useState(1);
const [type, setType] = useState<'references' | 'citations' | 'both'>('both');
const [influentialOnly, setInfluentialOnly] = useState(false);
const [maxPapersPerNode, setMaxPapersPerNode] = useState(50);
const [previewPapers, setPreviewPapers] = useState<PaperPreview[]>([]);
const [showPreviewDialog, setShowPreviewDialog] = useState(false);
```

**Props:**

```typescript
interface AutoExpandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  searchNodeCount: number;
  onPreviewReady: (papers: PaperPreview[]) => void;
}
```

#### 3.2 Enhance PaperPreviewDialog

**File**: `src/components/collections/PaperPreviewDialog.tsx` (MODIFY)

**New Props:**

```typescript
interface PaperPreviewDialogProps {
  // ... existing props
  showDegreeFilter?: boolean; // NEW: Enable degree filter tabs
  degreeStats?: {
    // NEW: Stats for filter badge counts
    degree1: number;
    degree2: number;
    degree3: number;
  };
}
```

**Degree Filter UI** (when `showDegreeFilter` is true):

```
[All (150)] [Degree 1 (80)] [Degree 2 (50)] [Degree 3 (20)]
```

**Filter Logic:**

```typescript
const [degreeFilter, setDegreeFilter] = useState<'all' | 1 | 2 | 3>('all');

const filteredPapers = useMemo(() => {
  if (degreeFilter === 'all') return papers;
  return papers.filter(p => p.degree === degreeFilter);
}, [papers, degreeFilter]);
```

#### 3.3 Enhance PaperPreviewCard

**File**: `src/components/collections/PaperPreviewCard.tsx` (MODIFY)

**Degree Badge** (only shown when `paper.degree` is defined):

```typescript
{paper.degree && (
  <Badge
    variant="outline"
    className={cn(
      "ml-2 text-xs",
      paper.degree === 1 && "border-green-500 text-green-600",
      paper.degree === 2 && "border-blue-500 text-blue-600",
      paper.degree === 3 && "border-purple-500 text-purple-600",
    )}
  >
    Degree {paper.degree}
  </Badge>
)}
```

---

### Phase 4: Integration

#### 4.1 Add Auto Expand Button to PaperGraph

**File**: `src/components/graph/PaperGraph.tsx` (MODIFY)

**Add to toolbar/legend area:**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setAutoExpandDialogOpen(true)}
  disabled={searchNodeCount === 0}
>
  <Sparkles className="h-4 w-4 mr-1" />
  Auto Expand
</Button>
```

**Add state:**

```typescript
const [autoExpandDialogOpen, setAutoExpandDialogOpen] = useState(false);
const [previewPapers, setPreviewPapers] = useState<PaperPreview[]>([]);
const [showAutoExpandPreview, setShowAutoExpandPreview] = useState(false);

// Calculate search node count from graph data
const searchNodeCount = useMemo(
  () => graphData?.nodes.filter(n => n.degree === 0).length ?? 0,
  [graphData]
);
```

**Add components:**

```tsx
<AutoExpandDialog
  open={autoExpandDialogOpen}
  onOpenChange={setAutoExpandDialogOpen}
  collectionId={collectionId}
  searchNodeCount={searchNodeCount}
  onPreviewReady={(papers) => {
    setPreviewPapers(papers);
    setAutoExpandDialogOpen(false);
    setShowAutoExpandPreview(true);
  }}
/>

<PaperPreviewDialog
  open={showAutoExpandPreview}
  onOpenChange={setShowAutoExpandPreview}
  papers={previewPapers}
  showDegreeFilter={true}
  degreeStats={calculateDegreeStats(previewPapers)}
  onConfirm={handleAutoExpandConfirm}
/>
```

#### 4.2 Wire Up Full Flow

**Complete data flow:**

```
1. User clicks "Auto Expand" button in PaperGraph
   ↓
2. AutoExpandDialog opens
   - User selects: degree (1-3), type, influentialOnly, maxPapersPerNode
   ↓
3. User clicks "Preview"
   - useAutoExpandPreview mutation fires
   - POST /api/collections/[id]/auto-expand/preview
   ↓
4. API traverses graph:
   - Gets degree=0 papers (search results)
   - For each degree level, fetches refs/citations
   - Deduplicates, tracks sourcePaperId and degree
   - Returns ranked papers with metadata
   ↓
5. AutoExpandDialog receives papers
   - Calls onPreviewReady(papers)
   - Closes itself
   ↓
6. PaperPreviewDialog opens with degree filtering
   - Shows degree filter tabs
   - Shows degree badges on each card
   - User selects papers
   ↓
7. User clicks "Add Selected"
   - useExpandCollection mutation fires
   - POST /api/collections/[id]/expand
   - Body includes: sourcePaperIds, sourceTypes, degrees
   ↓
8. API adds papers to collection
   - Each paper stored with correct degree, sourcePaperId
   - PDF download queued for Open Access papers
   ↓
9. Graph refreshes
   - New papers appear with correct degree-based positioning/coloring
```

---

## Files Summary

### Files to Create (4)

| File                                                                     | Description                    |
| ------------------------------------------------------------------------ | ------------------------------ |
| `supabase/migrations/YYYYMMDDHHMMSS_add_degree_to_collection_papers.sql` | DB migration for degree column |
| `src/lib/validations/auto-expand.ts`                                     | Zod schema for auto-expand     |
| `src/app/api/collections/[id]/auto-expand/preview/route.ts`              | Preview API endpoint           |
| `src/components/collections/AutoExpandDialog.tsx`                        | Auto-expand dialog UI          |

### Files to Modify (9)

| File                                                | Changes                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `src/types/database.types.ts`                       | Regenerate after migration                                 |
| `src/lib/db/collections.ts`                         | Add degree to PaperLinkData, update linkPapersToCollection |
| `src/types/graph.ts`                                | Add degree to GraphNode                                    |
| `src/app/api/collections/[id]/graph/route.ts`       | Include degree in query and response                       |
| `src/lib/search/types.ts`                           | Add degree, sourcePaperId to PaperPreview                  |
| `src/lib/validations/expand.ts`                     | Add sourcePaperIds, degrees to schema                      |
| `src/app/api/collections/[id]/expand/route.ts`      | Support batch sourcePaperIds and degrees                   |
| `src/hooks/useExpandCollection.ts`                  | Update input type for batch operations                     |
| `src/components/collections/PaperPreviewDialog.tsx` | Add degree filter tabs                                     |
| `src/components/collections/PaperPreviewCard.tsx`   | Add degree badge                                           |
| `src/components/graph/PaperGraph.tsx`               | Add Auto Expand button and dialog integration              |

---

## Key Design Decisions

### Why Store Degree in Database?

1. **Query Efficiency**: `WHERE degree = 1` is much faster than recursive source_paper_id traversal
2. **Graph Visualization**: Degree-based coloring/sizing without frontend calculation
3. **Data Consistency**: Single source of truth, no frontend/backend calculation mismatch
4. **API Simplicity**: Filtering/grouping by degree is straightforward

### Degree Values

- `0` = Search results (initial papers)
- `1` = 1st degree expansion (refs/cites from degree 0)
- `2` = 2nd degree expansion (refs/cites from degree 1)
- `3` = 3rd degree expansion (refs/cites from degree 2)

### Rate Limiting Strategy

- Sequential API calls with 100ms delay per node (existing pattern)
- Total time estimate: `(papersAtPreviousDegree × 2 × type_multiplier) × 100ms`
- Show progress indicator with estimated time

### Deduplication Strategy

- Global `seenPaperIds` Set across all degrees
- Check against existing collection papers first
- First occurrence wins (keeps sourcePaperId/degree from earliest find)

### Performance Constraints

- Max 3 degrees to prevent combinatorial explosion
- Max 100 papers per node limit
- Warning if total source papers > 10 ("This may take several minutes")

### Backward Compatibility

- Existing papers get `degree=0` by default (migration handles this)
- Single-node expand still works (sourcePaperId parameter)
- New batch expand adds sourcePaperIds/degrees parameters

---

## Migration Plan for Existing Data

After running the migration:

1. All existing `collection_papers` rows will have `degree=0` (default)
2. This is correct for search results
3. For papers added via single-node expand, degree should be 1
   - Option A: Leave as 0 (simpler, minor inaccuracy)
   - Option B: Update based on relationship_type != 'search' (more accurate)

**Recommended**: Option A - Leave existing data as-is. New expand operations will use correct degrees.

---

## Estimated Scope

- ~700 lines of new code
- ~200 lines of modifications
- 4 new files, 11 modified files
- 1 database migration
