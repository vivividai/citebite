# Paper Relationship Graph Visualization Plan

**Status: IMPLEMENTED** (2025-12-11)

## Overview

Collection의 논문들 간의 관계를 Radial 그래프로 시각화. Expand 기능을 통해 추가된 논문이 어떤 source 논문으로부터 확장되었는지 tracking하고, cosine similarity 기반으로 색상 표현.

## User Requirements (Confirmed)

- **레이아웃**: Radial (초기 검색 논문이 중심, 확장된 논문이 바깥)
- **색상**: Collection query 기준 cosine similarity (높을수록 진한색)
- **모양**: PDF indexed = Circle(○), PDF 없음 = X mark(×)
- **Hover**: 논문 카드 tooltip 표시
- **Click**: 상세 정보 패널/모달
- **Double-click**: Expand dialog 열기
- **기존 데이터**: 무시 (DB reset 가능)

---

## Implementation Steps

### Step 1: Database Migration

**파일**: `supabase/migrations/[timestamp]_add_paper_relationships.sql`

```sql
ALTER TABLE collection_papers
ADD COLUMN source_paper_id VARCHAR(255) REFERENCES papers(paper_id) ON DELETE SET NULL,
ADD COLUMN relationship_type VARCHAR(20) DEFAULT 'search',
ADD COLUMN similarity_score DECIMAL(10, 8);

ALTER TABLE collection_papers
ADD CONSTRAINT chk_relationship_type
CHECK (relationship_type IN ('search', 'reference', 'citation'));

CREATE INDEX idx_collection_papers_source ON collection_papers(collection_id, source_paper_id);
CREATE INDEX idx_collection_papers_type ON collection_papers(collection_id, relationship_type);
```

### Step 2: Regenerate TypeScript Types

```bash
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.types.ts
```

### Step 3: Create Graph Types

**파일**: `src/types/graph.ts`

```typescript
export interface GraphNode {
  id: string; // paper_id
  title: string;
  authors: string; // 콤마 구분
  year: number | null;
  citationCount: number | null;
  venue: string | null;
  vectorStatus: 'pending' | 'completed' | 'failed' | null;
  relationshipType: 'search' | 'reference' | 'citation';
  similarity: number | null; // 0-1 cosine similarity
  abstract: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationshipType: 'reference' | 'citation';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

### Step 4: Update linkPapersToCollection

**파일**: `src/lib/db/collections.ts`

```typescript
export async function linkPapersToCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  papers: Array<{
    paperId: string;
    sourcePaperId?: string | null;
    relationshipType: 'search' | 'reference' | 'citation';
    similarityScore?: number | null;
  }>
);
```

### Step 5: Update Expand Validation Schema

**파일**: `src/lib/validations/expand.ts`

```typescript
export const expandCollectionSchema = z.object({
  selectedPaperIds: z.array(z.string()).min(1),
  sourcePaperId: z.string().min(1),
  relationshipType: z.enum(['reference', 'citation']),
  similarities: z.record(z.string(), z.number()).optional(),
});
```

### Step 6: Update Expand API

**파일**: `src/app/api/collections/[id]/expand/route.ts`

- `sourcePaperId`, `relationshipType`, `similarities` 추출
- `linkPapersToCollection` 호출 시 relationship 데이터 전달

### Step 7: Create Graph API

**파일**: `src/app/api/collections/[id]/graph/route.ts`

```typescript
// GET /api/collections/[id]/graph
// Returns: { success: true, data: GraphData }
```

Query:

```sql
SELECT
  cp.paper_id, cp.source_paper_id, cp.relationship_type, cp.similarity_score,
  p.title, p.authors, p.year, p.citation_count, p.venue, p.vector_status, p.abstract
FROM collection_papers cp
JOIN papers p ON cp.paper_id = p.paper_id
WHERE cp.collection_id = $1
```

### Step 8: Install Graph Library

```bash
npm install react-force-graph-2d
```

### Step 9: Create Graph Data Hook

**파일**: `src/hooks/useCollectionGraph.ts`

### Step 10: Create Graph Components

**파일들**:

- `src/components/graph/PaperGraph.tsx` - 메인 그래프 컴포넌트
- `src/components/graph/NodeTooltip.tsx` - Hover tooltip
- `src/components/graph/PaperDetailPanel.tsx` - Click 시 상세 패널

### Step 11: Add Graph Tab

**파일**: `src/app/collections/[id]/page.tsx`

```tsx
import { Network } from 'lucide-react';
import { PaperGraph } from '@/components/graph/PaperGraph';

<TabsTrigger value="graph" className="gap-2">
  <Network className="h-4 w-4" />
  Graph
</TabsTrigger>

<TabsContent value="graph" className="space-y-4">
  <PaperGraph collectionId={collection.id} />
</TabsContent>
```

### Step 12: Update ExpandCollectionDialog

**파일**: `src/components/collections/ExpandCollectionDialog.tsx`

- expand 시 `sourcePaperId`, `relationshipType`, `similarities` 전달
- Graph query invalidation 추가

---

## Key Implementation Details

### Radial Layout Algorithm

```typescript
const positionNodesRadially = (nodes: GraphNode[]) => {
  const searchNodes = nodes.filter(n => n.relationshipType === 'search');
  const expandedNodes = nodes.filter(n => n.relationshipType !== 'search');

  // Center: search nodes
  searchNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / searchNodes.length;
    node.fx = Math.cos(angle) * 100;
    node.fy = Math.sin(angle) * 100;
  });

  // Outer: expanded nodes (grouped by source)
  // ...
};
```

### Similarity-based Color

```typescript
const getNodeColor = (similarity: number | null) => {
  if (similarity === null) return 'hsl(var(--muted))';
  // HSL gradient: 높은 similarity = 진한 chart-1 색상
  const lightness = 61 + (1 - similarity) * 30;
  return `hsl(12, 76%, ${lightness}%)`;
};
```

### Node Shape Drawing

```typescript
const drawNode = (node, ctx) => {
  if (node.vectorStatus === 'completed') {
    // Circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    // X mark
    ctx.moveTo(node.x - 8, node.y - 8);
    ctx.lineTo(node.x + 8, node.y + 8);
    ctx.moveTo(node.x + 8, node.y - 8);
    ctx.lineTo(node.x - 8, node.y + 8);
    ctx.stroke();
  }
};
```

---

## Files Summary

### New Files (8)

| File                                                   | Purpose                 |
| ------------------------------------------------------ | ----------------------- |
| `supabase/migrations/[ts]_add_paper_relationships.sql` | DB 스키마 확장          |
| `src/types/graph.ts`                                   | Graph 타입 정의         |
| `src/app/api/collections/[id]/graph/route.ts`          | Graph 데이터 API        |
| `src/hooks/useCollectionGraph.ts`                      | Graph 데이터 fetch hook |
| `src/components/graph/PaperGraph.tsx`                  | 메인 그래프 컴포넌트    |
| `src/components/graph/NodeTooltip.tsx`                 | Hover tooltip           |
| `src/components/graph/PaperDetailPanel.tsx`            | 클릭 시 상세 패널       |
| `src/lib/validations/graph.ts`                         | Graph API validation    |

### Modified Files (5)

| File                                                    | Changes                                |
| ------------------------------------------------------- | -------------------------------------- |
| `src/lib/db/collections.ts`                             | `linkPapersToCollection` 시그니처 변경 |
| `src/lib/validations/expand.ts`                         | sourcePaperId, relationshipType 추가   |
| `src/app/api/collections/[id]/expand/route.ts`          | relationship 데이터 저장               |
| `src/app/collections/[id]/page.tsx`                     | Graph 탭 추가                          |
| `src/components/collections/ExpandCollectionDialog.tsx` | source 정보 전달                       |
