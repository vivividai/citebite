# Paper Chunks 중복 제거 계획

## 목표

`paper_chunks` 테이블에서 `collection_id` 컬럼을 제거하여 같은 논문의 중복 임베딩을 방지.
PDF와 Figure도 논문(paper)별로 한 번만 저장.

## 결정 사항

- **데이터 마이그레이션**: Clean slate (기존 데이터 삭제 후 새로 시작)
- **PDF 저장**: `papers/{paperId}.pdf` (논문별 한 번 저장)
- **Figure 저장**: 별도 `figures` bucket으로 분리
- **Orphan 처리**: 보관 유지 (삭제하지 않음, 나중에 재사용 가능)

---

## 1단계: 데이터베이스 스키마 마이그레이션

### 1.1 새 마이그레이션 파일 생성

**파일**: `supabase/migrations/20251216000000_remove_chunk_collection_id.sql`

```sql
-- 1. 기존 제약조건과 인덱스 삭제
ALTER TABLE paper_chunks DROP CONSTRAINT IF EXISTS unique_chunk;
DROP INDEX IF EXISTS idx_chunks_collection;

-- 2. 기존 데이터 삭제 (clean slate)
TRUNCATE TABLE paper_chunks;

-- 3. collection_id 컬럼 제거
ALTER TABLE paper_chunks DROP COLUMN collection_id;

-- 4. 새로운 유니크 제약조건 추가 (논문 단위)
ALTER TABLE paper_chunks
ADD CONSTRAINT unique_paper_chunk UNIQUE (paper_id, chunk_index, chunk_type);

-- 5. RLS 정책 업데이트 (collection_papers와 JOIN)
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

-- 6. hybrid_search 함수 업데이트 (collection_papers와 JOIN)
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

-- 7. 효율적인 컬렉션 필터링을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_collection_papers_paper_id
ON collection_papers(paper_id);
```

---

## 2단계: 스토리지 구조 변경

### 2.1 figures bucket 생성

**파일**: `supabase/migrations/20251216000001_create_figures_bucket.sql`

```sql
-- figures용 별도 bucket 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('figures', 'figures', false)
ON CONFLICT (id) DO NOTHING;
```

### 2.2 스토리지 경로 업데이트

**새로운 구조**:

- PDF: `pdfs` bucket → `papers/{paperId}.pdf`
- Figure: `figures` bucket → `{paperId}/{figureNumber}.png`

---

## 3단계: 코드 변경

### 3.1 `src/lib/db/chunks.ts`

- `ChunkInsert` 인터페이스에서 `collectionId` 제거
- `insertChunks()`: insert에서 `collection_id` 제거
- `insertChunksWithFigureRefs()`: `collection_id` 제거
- `deleteChunksForPaper()`: `collectionId` 매개변수 제거
- **삭제**: `deleteChunksForCollection()` (더 이상 필요 없음)
- `getChunkCountForPaper()`: `collectionId` 매개변수 제거
- `isPaperIndexed()`: `collectionId` 매개변수 제거
- `getTextChunksWithFigureRefs()`: `collectionId` 매개변수 제거
- `getChunkCountForCollection()` 추가: collection_papers와 JOIN 사용

### 3.2 `src/lib/storage/supabaseStorage.ts`

- `getStoragePath(paperId)`: `papers/${paperId}.pdf` 반환으로 변경
- `uploadPdf()`: `collectionId` 매개변수 제거
- `getPdfUrl()`: `collectionId` 매개변수 제거
- `downloadPdf()`: `collectionId` 매개변수 제거
- `deletePdf()`: `collectionId` 매개변수 제거
- `pdfExists()`: `collectionId` 매개변수 제거
- **삭제**: `deleteCollectionPdfs()` (더 이상 필요 없음)
- `moveFromTempToPermanent()`: `collectionId` 매개변수 제거
- figure 관련 함수들: `figures` bucket 사용하도록 변경

### 3.3 `src/lib/jobs/queues.ts`

- `PdfDownloadJobData`: `collectionId` 제거
- `PdfIndexJobData`: `collectionId` 제거
- `FigureAnalysisJobData`: `collectionId` 제거

### 3.4 `src/lib/jobs/workers/pdfDownloadWorker.ts`

- job data에서 `collectionId` 제거
- 다운로드 전 PDF 존재 여부 확인
- 이미 PDF가 있으면 다운로드 건너뛰기

### 3.5 `src/lib/jobs/workers/pdfIndexWorker.ts`

- 청크 삽입에서 `collectionId` 제거
- 처리 전 이미 인덱싱 되었는지 확인
- 청크가 이미 있으면 인덱싱 건너뛰기

### 3.6 `src/lib/jobs/workers/figureAnalysisWorker.ts`

- `figures` bucket 사용하도록 변경
- 작업에서 `collectionId` 제거

### 3.7 `src/lib/rag/figure-indexer.ts`

- `FigureChunkInput`에서 `collectionId` 제거
- `indexFigures()` 및 `indexAnalyzedFigures()` 업데이트
- `deleteFigureChunks()`: `paperId`만 받도록 변경

### 3.8 API 라우트 (논문 제거 로직)

**파일들**:

- `src/app/api/collections/[id]/papers/[paperId]/route.ts`
- `src/app/api/collections/[id]/papers/batch-delete/route.ts`
- `src/app/api/collections/[id]/route.ts`

**변경 사항**:

- `collection_papers` 연결만 제거
- 청크나 PDF는 삭제하지 않음 (orphan 처리 = 보관)
- `papers` 테이블의 레코드는 유지

---

## 4단계: 논문 상태 초기화

### 4.1 모든 논문을 pending 상태로 리셋

Clean slate이므로 재인덱싱 트리거 필요:

```sql
UPDATE papers SET text_vector_status = 'pending', figure_vector_status = 'pending';
```

---

## 수정할 파일 요약

| 파일                                                                | 변경 사항                           |
| ------------------------------------------------------------------- | ----------------------------------- |
| `supabase/migrations/20251216000000_remove_chunk_collection_id.sql` | **신규** - 스키마 마이그레이션      |
| `supabase/migrations/20251216000001_create_figures_bucket.sql`      | **신규** - Figures bucket           |
| `src/lib/db/chunks.ts`                                              | 모든 함수에서 collectionId 제거     |
| `src/lib/storage/supabaseStorage.ts`                                | 경로 업데이트, collectionId 제거    |
| `src/lib/jobs/queues.ts`                                            | job data 인터페이스 업데이트        |
| `src/lib/jobs/workers/pdfDownloadWorker.ts`                         | collectionId 제거, 스킵 로직 추가   |
| `src/lib/jobs/workers/pdfIndexWorker.ts`                            | collectionId 제거, 스킵 로직 추가   |
| `src/lib/jobs/workers/figureAnalysisWorker.ts`                      | figures bucket 사용                 |
| `src/lib/rag/figure-indexer.ts`                                     | collectionId 제거                   |
| `src/app/api/collections/[id]/papers/[paperId]/route.ts`            | 연결만 제거                         |
| `src/app/api/collections/[id]/papers/batch-delete/route.ts`         | 연결만 제거                         |
| `src/app/api/collections/[id]/route.ts`                             | deleteChunksForCollection 호출 제거 |

---

## 엣지 케이스

1. **같은 논문이 여러 컬렉션에 추가될 때**:
   - 다운로드 한 번, 인덱싱 한 번
   - Worker가 `pdfExists()`와 `isPaperIndexed()` 먼저 확인

2. **논문이 컬렉션에서 제거될 때**:
   - `collection_papers` 연결만 제거
   - 청크와 PDF는 유지 (나중에 재사용 가능)

3. **논문 재인덱싱**:
   - 해당 논문의 기존 청크 삭제
   - 청크 재생성
   - 모든 컬렉션이 자동으로 업데이트된 결과 사용

4. **컬렉션 삭제**:
   - `collection_papers` 연결 삭제 (CASCADE)
   - 청크나 PDF는 삭제하지 않음

---

## 테스트 체크리스트

- [ ] Hybrid search가 컬렉션에 맞는 결과 반환
- [ ] 두 번째 컬렉션에 논문 추가 시 청크 중복 안 됨
- [ ] 컬렉션에서 논문 제거해도 청크 유지됨
- [ ] PDF가 `papers/{paperId}.pdf`에 저장됨
- [ ] Figure가 `figures` bucket의 `{paperId}/{figureNumber}.png`에 저장됨
- [ ] Worker가 이미 인덱싱된 논문 건너뜀
- [ ] RLS 정책 정상 작동
