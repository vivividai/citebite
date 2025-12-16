# Figure Analysis Worker 분리 및 Status 분리 계획

## 목표

1. Figure 분석을 별도 BullMQ Worker로 분리하여 병렬 처리 개선
2. Paper status를 `text_vector_status`와 `image_vector_status`로 분리

## 설계 결정사항

- **Partial 상태**: 텍스트 성공 + figure 실패 시 → `completed`로 간주 (별도 표시 안함)
- **기존 데이터**: db reset 예정이므로 마이그레이션 로직 불필요

---

## Phase 1: Database Migration

### 1.1 새 마이그레이션 파일 생성

**파일**: `supabase/migrations/YYYYMMDDHHMMSS_split_vector_status.sql`

```sql
-- 새 컬럼 추가
ALTER TABLE papers
ADD COLUMN text_vector_status VARCHAR(20) DEFAULT 'pending'
CHECK (text_vector_status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE papers
ADD COLUMN image_vector_status VARCHAR(20) DEFAULT 'pending'
CHECK (image_vector_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- 인덱스 추가
CREATE INDEX idx_papers_text_vector_status ON papers(text_vector_status);
CREATE INDEX idx_papers_image_vector_status ON papers(image_vector_status);

-- 기존 vector_status 컬럼 삭제
ALTER TABLE papers DROP COLUMN vector_status;
```

### 1.2 TypeScript 타입 재생성

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

---

## Phase 2: Queue 및 Job 타입 추가

### 2.1 queues.ts 수정

**파일**: `src/lib/jobs/queues.ts`

추가할 내용:

```typescript
// Job Data 타입
export interface FigureAnalysisJobData {
  collectionId: string;
  paperId: string;
  storageKey: string;
}

// Queue 싱글톤
let figureAnalysisQueue: Queue<FigureAnalysisJobData> | null = null;

// Queue getter
export function getFigureAnalysisQueue(): Queue<FigureAnalysisJobData> | null;

// Helper 함수
export async function queueFigureAnalysis(
  data: FigureAnalysisJobData
): Promise<string | null>;

// closeQueues()에 figureAnalysisQueue 추가
```

---

## Phase 3: Figure Analysis Worker 생성

### 3.1 새 Worker 파일 생성

**파일**: `src/lib/jobs/workers/figureAnalysisWorker.ts`

```typescript
// 설정
const WORKER_CONCURRENCY = 5;
const ANALYSIS_BATCH_SIZE = 3; // Vision API 병렬 처리
const RATE_LIMIT_DELAY_MS = 300;

// 처리 로직 (pdfIndexWorker의 processMultimodal에서 이동)
async function processFigureAnalysis(job: Job<FigureAnalysisJobData>) {
  // 1. image_vector_status → 'processing'
  // 2. PDF 다운로드
  // 3. PDF 페이지 렌더링
  // 4. pdffigures2로 figure 탐지
  // 5. figure 없으면 → 'skipped' 설정 후 종료
  // 6. figure 추출 및 crop
  // 7. Gemini Vision으로 분석 (batch 처리)
  // 8. figure chunks 인덱싱
  // 9. image_vector_status → 'completed'
}
```

### 3.2 Worker Manager 수정

**파일**: `src/lib/jobs/workers/index.ts`

- `startFigureAnalysisWorker()` 추가
- `stopFigureAnalysisWorker()` 추가
- `startAllWorkers()`, `stopAllWorkers()`에 등록

---

## Phase 4: pdfIndexWorker 수정

### 4.1 Multimodal 로직 제거

**파일**: `src/lib/jobs/workers/pdfIndexWorker.ts`

제거할 항목:

- `processMultimodal()` 함수 전체
- `buildTextContextMap()` 함수
- Multimodal 관련 import 문
- `ENABLE_MULTIMODAL` 환경변수 체크

### 4.2 Status 필드명 변경

- `vector_status` → `text_vector_status`

### 4.3 Figure 분석 Job 큐잉 추가

```typescript
// 텍스트 인덱싱 성공 후
await supabase
  .from('papers')
  .update({ text_vector_status: 'completed' })
  .eq('paper_id', paperId);

// Figure 분석 job 큐에 추가
await queueFigureAnalysis({ collectionId, paperId, storageKey });
```

---

## Phase 5: pdfDownloadWorker 수정

### 5.1 Status 필드명 변경

**파일**: `src/lib/jobs/workers/pdfDownloadWorker.ts`

- `updatePaperStatus()` 함수: `vector_status` → `text_vector_status`

---

## Phase 6: DB Helper 함수 추가

### 6.1 chunks.ts에 함수 추가

**파일**: `src/lib/db/chunks.ts`

```typescript
export async function getTextChunksWithFigureRefs(
  paperId: string,
  collectionId: string
): Promise<{ id: string; chunkIndex: number; referencedFigures: string[] }[]>;
```

---

## Phase 7: UI 업데이트

### 7.1 Overall Status 계산 함수

**파일**: `src/lib/utils/status.ts` (새 파일)

```typescript
export function calculateOverallStatus(
  textStatus: string | null,
  imageStatus: string | null
): 'pending' | 'processing' | 'completed' | 'failed' {
  const text = textStatus || 'pending';
  const image = imageStatus || 'pending';

  // 둘 다 pending → pending
  if (text === 'pending' && image === 'pending') return 'pending';

  // 하나라도 processing → processing
  if (text === 'processing' || image === 'processing') return 'processing';

  // 텍스트 완료 (image는 completed/skipped/failed 무관) → completed
  if (text === 'completed') return 'completed';

  // 텍스트 실패 → failed
  return 'failed';
}
```

### 7.2 StatusBadge 수정

**파일**: `src/components/collections/PaperCard.tsx`

```typescript
// Props 변경
interface StatusBadgeProps {
  textStatus: string | null;
  imageStatus: string | null;
}

// calculateOverallStatus() 사용
```

### 7.3 PaperList 필터 수정

**파일**: `src/components/collections/PaperList.tsx`

- `paper.vector_status` → `calculateOverallStatus(paper.text_vector_status, paper.image_vector_status)`

### 7.4 CollectionProgress 수정

**파일**: `src/components/collections/CollectionProgress.tsx`

- status 계산 로직 업데이트

### 7.5 Status API 수정

**파일**: `src/app/api/collections/[id]/status/route.ts`

- 쿼리에서 `text_vector_status`, `image_vector_status` 조회
- 응답에 상세 status 포함

### 7.6 Paper 타입 수정

**파일**: `src/hooks/useCollectionPapers.ts`

```typescript
export interface Paper {
  // ...
  text_vector_status: string | null;
  image_vector_status: string | null;
  // vector_status 제거
}
```

---

## Phase 8: 기타 파일 수정

### 8.1 papers.ts 초기 status 설정

**파일**: `src/lib/db/papers.ts`

```typescript
// semanticScholarPaperToDbPaper()
return {
  // ...
  text_vector_status: hasOpenAccessPdf ? 'pending' : 'failed',
  image_vector_status: hasOpenAccessPdf ? 'pending' : 'skipped',
};
```

### 8.2 collections.ts status 계산

**파일**: `src/lib/db/collections.ts`

- `indexedPapers` 계산: `text_vector_status === 'completed'` 기준
- `failedPapers` 계산: `text_vector_status === 'failed'` 기준

---

## 수정 파일 목록

| 파일                                                | 작업   |
| --------------------------------------------------- | ------ |
| `supabase/migrations/새파일.sql`                    | 생성   |
| `src/types/database.types.ts`                       | 재생성 |
| `src/lib/jobs/queues.ts`                            | 수정   |
| `src/lib/jobs/workers/figureAnalysisWorker.ts`      | 생성   |
| `src/lib/jobs/workers/index.ts`                     | 수정   |
| `src/lib/jobs/workers/pdfIndexWorker.ts`            | 수정   |
| `src/lib/jobs/workers/pdfDownloadWorker.ts`         | 수정   |
| `src/lib/db/chunks.ts`                              | 수정   |
| `src/lib/db/papers.ts`                              | 수정   |
| `src/lib/db/collections.ts`                         | 수정   |
| `src/lib/utils/status.ts`                           | 생성   |
| `src/components/collections/PaperCard.tsx`          | 수정   |
| `src/components/collections/PaperList.tsx`          | 수정   |
| `src/components/collections/CollectionProgress.tsx` | 수정   |
| `src/app/api/collections/[id]/status/route.ts`      | 수정   |
| `src/hooks/useCollectionPapers.ts`                  | 수정   |

---

## 처리 흐름 (최종)

```
Paper 생성
  ↓
text_vector_status: 'pending'
image_vector_status: 'pending'
  ↓
PDF Download Worker (concurrency: 5)
  ↓ 성공
text_vector_status: 'processing'
  ↓
PDF Index Worker (concurrency: 3) - 텍스트만
  ↓ 성공
text_vector_status: 'completed'
  ↓ (자동으로 figure job 큐잉)
Figure Analysis Worker (concurrency: 5)
  ↓
  ├─ figure 있음 → image_vector_status: 'completed'
  └─ figure 없음 → image_vector_status: 'skipped'
```
