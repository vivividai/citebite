# Collection Expansion via References/Citations - 구현 계획

## 개요

Collection 내 논문의 references(이 논문이 인용한 논문)와 citations(이 논문을 인용한 논문)를 검색하여 유사도가 높은 논문으로 컬렉션을 확장하는 기능.

## 핵심 설계 원칙

1. **기존 컴포넌트 최대 재사용**: `PaperPreviewDialog`, `PaperPreviewCard` 재사용
2. **일관된 UX**: Collection 생성과 동일한 유사도 기반 선택 플로우
3. **비동기 처리**: 대량 API 호출은 BullMQ로 백그라운드 처리

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Collection Detail Page                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  PaperCard                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │ [Expand Collection] ← NEW 버튼                          │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ExpandCollectionDialog (NEW)                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Step 1: 옵션 선택                                              │    │
│  │  - [ ] References (이 논문이 인용한 논문들)                     │    │
│  │  - [ ] Citations (이 논문을 인용한 논문들)                      │    │
│  │  - [x] Influential only (영향력 있는 인용만)                    │    │
│  │  - Max papers: [100]                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              [Preview Papers]                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 PaperPreviewDialog (기존 컴포넌트 재사용)                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  - 유사도 슬라이더 (0-100%)                                     │    │
│  │  - 논문 카드 리스트 (PaperPreviewCard)                          │    │
│  │  - 선택된 논문 통계 (Open Access / Paywalled)                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                    [Add to Collection (N papers)]                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 데이터 플로우

```
1. User clicks "Expand Collection" on PaperCard
   │
2. ExpandCollectionDialog opens
   │  - Select: References / Citations / Both
   │  - Options: Influential only, Max papers
   │
3. Click "Preview Papers"
   │
4. POST /api/collections/[id]/expand/preview
   │  ├─ Fetch references/citations from Semantic Scholar
   │  ├─ Get collection's search_query or natural_language_query
   │  ├─ Generate SPECTER embedding for query
   │  ├─ Fetch SPECTER embeddings for related papers (batch API)
   │  ├─ Calculate cosine similarity
   │  ├─ Filter out papers already in collection
   │  └─ Return sorted papers with similarity scores
   │
5. PaperPreviewDialog shows results (REUSED)
   │  - Same threshold slider
   │  - Same selection UI
   │  - Same stats panel
   │
6. User selects papers, clicks "Add to Collection"
   │
7. POST /api/collections/[id]/expand
   │  ├─ Upsert selected papers to papers table
   │  ├─ Link papers to collection
   │  └─ Queue PDF download jobs for Open Access papers
   │
8. UI refreshes, new papers appear in collection
```

---

## 파일 구조

```
src/
├── lib/
│   └── semantic-scholar/
│       ├── types.ts                    # [MODIFY] Reference, Citation 타입 추가
│       └── client.ts                   # [MODIFY] getReferences, getCitations 메서드 추가
│
├── app/api/collections/[id]/
│   └── expand/
│       ├── preview/
│       │   └── route.ts                # [NEW] Preview related papers
│       └── route.ts                    # [NEW] Add papers to collection
│
├── hooks/
│   ├── useExpandPreview.ts             # [NEW] Preview mutation hook
│   └── useExpandCollection.ts          # [NEW] Expand mutation hook
│
├── components/collections/
│   ├── PaperCard.tsx                   # [MODIFY] Expand 버튼 추가
│   ├── ExpandCollectionDialog.tsx      # [NEW] 옵션 선택 다이얼로그
│   ├── PaperPreviewDialog.tsx          # [REUSE] 재사용 (props 확장)
│   └── PaperPreviewCard.tsx            # [REUSE] 그대로 재사용
│
└── lib/validations/
    └── expand.ts                       # [NEW] Zod validation schemas
```

---

## Phase 1: Semantic Scholar Client 확장

### 1.1 Types 추가 (`src/lib/semantic-scholar/types.ts`)

```typescript
/**
 * Citation context with intent classification
 */
export interface CitationContext {
  context: string;
  intent: string;
}

/**
 * Reference (paper that this paper cites)
 */
export interface Reference {
  contexts?: string[];
  intents?: string[];
  contextsWithIntent?: CitationContext[];
  isInfluential?: boolean;
  citedPaper: Paper;
}

/**
 * Citation (paper that cites this paper)
 */
export interface Citation {
  contexts?: string[];
  intents?: string[];
  contextsWithIntent?: CitationContext[];
  isInfluential?: boolean;
  citingPaper: Paper;
}

/**
 * Response for references endpoint
 */
export interface ReferenceBatch {
  offset: number;
  next?: number;
  data: Reference[];
}

/**
 * Response for citations endpoint
 */
export interface CitationBatch {
  offset: number;
  next?: number;
  data: Citation[];
}

/**
 * Options for fetching references/citations
 */
export interface RelatedPapersOptions {
  offset?: number;
  limit?: number;
  fields?: string[];
}
```

### 1.2 Client 메서드 추가 (`src/lib/semantic-scholar/client.ts`)

```typescript
/**
 * Get references for a paper (papers that this paper cites)
 */
async getReferences(
  paperId: string,
  options?: RelatedPapersOptions
): Promise<ReferenceBatch>

/**
 * Get all references with pagination
 */
async getAllReferences(
  paperId: string,
  options?: { maxReferences?: number; influentialOnly?: boolean }
): Promise<Reference[]>

/**
 * Get citations for a paper (papers that cite this paper)
 */
async getCitations(
  paperId: string,
  options?: RelatedPapersOptions
): Promise<CitationBatch>

/**
 * Get all citations with pagination
 */
async getAllCitations(
  paperId: string,
  options?: { maxCitations?: number; influentialOnly?: boolean }
): Promise<Citation[]>
```

---

## Phase 2: API Routes

### 2.1 Preview Endpoint (`src/app/api/collections/[id]/expand/preview/route.ts`)

**Request:**

```typescript
POST /api/collections/[id]/expand/preview
{
  paperId: string;           // Source paper ID
  type: 'references' | 'citations' | 'both';
  influentialOnly?: boolean; // Default: false
  maxPapers?: number;        // Default: 100
}
```

**Response:**

```typescript
{
  papers: PaperPreview[];    // Reuse existing type
  stats: {
    totalFound: number;
    referencesCount: number;
    citationsCount: number;
    papersWithEmbeddings: number;
    alreadyInCollection: number;
    rerankingApplied: boolean;
  };
  sourceQuery: string;       // Collection's search query for context
}
```

**로직:**

1. Collection 소유권 확인
2. Collection의 `natural_language_query` 또는 `search_query` 가져오기
3. Semantic Scholar에서 references/citations 가져오기
4. Collection에 이미 있는 논문 제외
5. SPECTER embedding으로 유사도 계산
6. `PaperPreview` 형식으로 변환하여 반환

### 2.2 Expand Endpoint (`src/app/api/collections/[id]/expand/route.ts`)

**Request:**

```typescript
POST /api/collections/[id]/expand
{
  selectedPaperIds: string[];
}
```

**Response:**

```typescript
{
  success: true;
  addedCount: number;
  openAccessCount: number;
  message: string;
}
```

**로직:**

1. Collection 소유권 확인
2. 선택된 논문 정보 batch fetch (Semantic Scholar)
3. Papers 테이블에 upsert
4. Collection-Papers 연결
5. Open Access 논문들 PDF 다운로드 큐잉

---

## Phase 3: React Hooks

### 3.1 useExpandPreview (`src/hooks/useExpandPreview.ts`)

```typescript
export function useExpandPreview() {
  return useMutation({
    mutationFn: async ({
      collectionId,
      paperId,
      type,
      influentialOnly,
      maxPapers,
    }: ExpandPreviewParams) => {
      const response = await fetch(
        `/api/collections/${collectionId}/expand/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperId, type, influentialOnly, maxPapers }),
        }
      );
      // ... error handling
    },
  });
}
```

### 3.2 useExpandCollection (`src/hooks/useExpandCollection.ts`)

```typescript
export function useExpandCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collectionId, selectedPaperIds }) => {
      // ... API call
    },
    onSuccess: (_, { collectionId }) => {
      // Invalidate collection papers query
      queryClient.invalidateQueries({
        queryKey: ['collection-papers', collectionId],
      });
      toast.success('Papers added successfully');
    },
  });
}
```

---

## Phase 4: UI Components

### 4.1 PaperCard 수정 (`src/components/collections/PaperCard.tsx`)

```typescript
// 기존 props에 추가
interface PaperCardProps {
  // ... existing props
  onExpand?: (paperId: string) => void;  // NEW
}

// 버튼 영역에 추가
{!selectionMode && collectionId && onExpand && (
  <Button
    variant="outline"
    size="sm"
    onClick={(e) => {
      e.stopPropagation();
      onExpand(paper.paper_id);
    }}
  >
    <Network className="h-4 w-4 mr-1" />
    Expand
  </Button>
)}
```

### 4.2 ExpandCollectionDialog (NEW)

```typescript
interface ExpandCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  paperId: string;
  paperTitle: string;
}

export function ExpandCollectionDialog({...}: ExpandCollectionDialogProps) {
  // Step 1: Option selection
  const [expandType, setExpandType] = useState<'references' | 'citations' | 'both'>('both');
  const [influentialOnly, setInfluentialOnly] = useState(false);
  const [maxPapers, setMaxPapers] = useState(100);

  // Step 2: Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const expandPreview = useExpandPreview();
  const expandCollection = useExpandCollection();

  const handlePreview = async () => {
    const result = await expandPreview.mutateAsync({
      collectionId,
      paperId,
      type: expandType,
      influentialOnly,
      maxPapers,
    });
    setPreviewData(result);
    setPreviewOpen(true);
  };

  const handleConfirm = (selectedPaperIds: string[]) => {
    expandCollection.mutate({
      collectionId,
      selectedPaperIds,
    }, {
      onSuccess: () => {
        setPreviewOpen(false);
        onOpenChange(false);
      }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expand Collection</DialogTitle>
            <DialogDescription>
              Find related papers from "{paperTitle}"
            </DialogDescription>
          </DialogHeader>

          {/* Expand Type Selection */}
          <div className="space-y-4">
            <Label>Find papers from:</Label>
            <RadioGroup value={expandType} onValueChange={setExpandType}>
              <RadioGroupItem value="references" label="References (papers this paper cites)" />
              <RadioGroupItem value="citations" label="Citations (papers citing this paper)" />
              <RadioGroupItem value="both" label="Both references and citations" />
            </RadioGroup>

            {/* Options */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={influentialOnly}
                onCheckedChange={setInfluentialOnly}
              />
              <Label>Influential citations only</Label>
            </div>

            <div>
              <Label>Maximum papers: {maxPapers}</Label>
              <Slider
                value={[maxPapers]}
                onValueChange={([v]) => setMaxPapers(v)}
                min={10}
                max={200}
                step={10}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePreview}
              disabled={expandPreview.isPending}
            >
              {expandPreview.isPending ? <Loader2 /> : 'Preview Papers'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reuse PaperPreviewDialog */}
      {previewData && (
        <PaperPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          papers={previewData.papers}
          stats={previewData.stats}
          searchQuery={previewData.sourceQuery}
          isCreating={expandCollection.isPending}
          onConfirm={handleConfirm}
          onCancel={() => setPreviewOpen(false)}
          // NEW: Custom button text
          confirmButtonText="Add to Collection"
        />
      )}
    </>
  );
}
```

### 4.3 PaperPreviewDialog 수정 (Minor)

```typescript
interface PaperPreviewDialogProps {
  // ... existing props
  confirmButtonText?: string;  // NEW: "컬렉션 생성" 또는 "Add to Collection"
}

// Footer 버튼 텍스트 변경
<Button onClick={handleConfirm}>
  {isCreating ? (
    <Loader2 />
  ) : (
    confirmButtonText || `컬렉션 생성 (${selectedPaperIds.size}개)`
  )}
</Button>
```

---

## Phase 5: Validation Schemas

### 5.1 Expand Validation (`src/lib/validations/expand.ts`)

```typescript
import { z } from 'zod';

export const expandPreviewSchema = z.object({
  paperId: z.string().min(1, 'Paper ID is required'),
  type: z.enum(['references', 'citations', 'both']),
  influentialOnly: z.boolean().optional().default(false),
  maxPapers: z.number().min(10).max(500).optional().default(100),
});

export const expandCollectionSchema = z.object({
  selectedPaperIds: z
    .array(z.string())
    .min(1, 'At least one paper must be selected'),
});

export type ExpandPreviewInput = z.infer<typeof expandPreviewSchema>;
export type ExpandCollectionInput = z.infer<typeof expandCollectionSchema>;
```

---

## 구현 순서

| Step | Task                                | 예상 작업량 |
| ---- | ----------------------------------- | ----------- |
| 1    | Semantic Scholar types 추가         | 작음        |
| 2    | Semantic Scholar client 메서드 추가 | 중간        |
| 3    | Validation schemas 추가             | 작음        |
| 4    | Preview API route 구현              | 중간        |
| 5    | Expand API route 구현               | 중간        |
| 6    | useExpandPreview hook 구현          | 작음        |
| 7    | useExpandCollection hook 구현       | 작음        |
| 8    | PaperPreviewDialog props 확장       | 작음        |
| 9    | ExpandCollectionDialog 구현         | 중간        |
| 10   | PaperCard에 Expand 버튼 추가        | 작음        |
| 11   | 통합 테스트                         | 중간        |

---

## Rate Limit 고려사항

Semantic Scholar API는 1 req/sec 제한이 있으므로:

1. **References/Citations 가져오기**: 페이지네이션 시 1초 딜레이
2. **SPECTER Embedding 가져오기**: Batch API 사용 (500개/요청)
3. **대량 데이터**: 100개 이상은 프로그레스 표시

예상 시간 (100 papers):

- References/Citations: 1-2초 (단일 요청으로 충분)
- SPECTER Embeddings: 1-2초 (batch API)
- 총: ~5초 이내

---

## 향후 확장 가능성

1. **Multi-hop Expansion**: References의 references까지 탐색
2. **Citation Network Visualization**: 논문 관계 그래프 시각화
3. **Auto-expand**: 주기적으로 새 citations 자동 추가
4. **Bulk Expansion**: 여러 논문에서 동시에 확장

---

## 테스트 시나리오

1. **기본 플로우**: Paper → Expand → Preview → Select → Add
2. **References Only**: References만 선택했을 때
3. **Citations Only**: Citations만 선택했을 때
4. **Influential Only**: 영향력 있는 인용만 필터링
5. **중복 제거**: Collection에 이미 있는 논문 제외 확인
6. **빈 결과**: References/Citations가 없는 논문
7. **대량 데이터**: 100+ papers 처리
8. **Open Access 처리**: PDF 다운로드 큐잉 확인
