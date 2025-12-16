# PDF Download Fallback 구현 계획

ArXiv와 Unpaywall API를 사용하여 Semantic Scholar에서 다운로드 실패한 논문에 대해 대체 다운로드 소스를 추가합니다.

## 현재 문제점

- Semantic Scholar의 `openAccessPdf.url`이 없으면 다운로드 시도조차 안 함
- `externalIds` (ArXiv, DOI)를 API에서 받아오지만 DB에 저장 안 함
- 약 25-30%의 논문이 OA PDF URL 없이 즉시 실패 처리됨

## 해결 방안: Fallback Download Chain

```
1. Semantic Scholar openAccessPdf URL (현재)
2. ArXiv 직접 다운로드 (arxiv_id 있으면)
3. Unpaywall API 조회 (DOI 있으면)
```

---

## 구현 단계

### Phase 1: Database Schema 업데이트

**새 파일**: `supabase/migrations/[timestamp]_add_paper_external_ids.sql`

```sql
ALTER TABLE papers
ADD COLUMN arxiv_id VARCHAR(255),
ADD COLUMN doi VARCHAR(255);

CREATE INDEX idx_papers_arxiv_id ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;
CREATE INDEX idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
```

**수정**: `src/lib/db/papers.ts`

- `semanticScholarPaperToDbPaper()` 함수에서 `arxiv_id`, `doi` 추출하여 저장
- `text_vector_status` 초기값 로직 변경: OA URL 없어도 arxiv_id나 doi 있으면 `'pending'`

---

### Phase 2: Unpaywall API 클라이언트 생성

**새 파일**: `src/lib/unpaywall/client.ts`

```typescript
export class UnpaywallClient {
  async getPdfUrl(doi: string): Promise<string | null>;
}
```

**새 파일**: `src/lib/unpaywall/index.ts` (export)

---

### Phase 3: ArXiv URL 빌더 생성

**새 파일**: `src/lib/arxiv/index.ts`

```typescript
export function buildArxivPdfUrl(arxivId: string): string;
export function isValidArxivId(arxivId: string): boolean;
```

---

### Phase 4: Queue 데이터 타입 확장

**수정**: `src/lib/jobs/queues.ts`

```typescript
export interface PdfDownloadJobData {
  paperId: string;
  pdfUrl?: string; // Semantic Scholar (optional now)
  arxivId?: string; // ArXiv fallback
  doi?: string; // Unpaywall fallback
}
```

---

### Phase 5: Download Worker 리팩토링

**수정**: `src/lib/jobs/workers/pdfDownloadWorker.ts`

핵심 변경:

1. `downloadWithFallbacks()` 함수 추가 - 순차적으로 소스 시도
2. 각 소스 실패 시 다음 소스로 넘어감
3. 성공한 소스 기록

```typescript
async function downloadWithFallbacks(
  data: PdfDownloadJobData
): Promise<DownloadResult> {
  // 1. Try Semantic Scholar
  // 2. Try ArXiv
  // 3. Try Unpaywall
}
```

---

### Phase 6: API Routes 업데이트

**수정**: `src/app/api/collections/route.ts` (lines 149-162)

- `getOpenAccessPapers()` 대신 arxiv_id나 doi가 있는 논문도 포함
- `queuePdfDownload()`에 fallback 소스 전달

**수정**: `src/app/api/collections/[id]/expand/route.ts`

- 동일한 변경 적용

---

## 수정할 파일 목록

| 파일                                                         | 변경 유형                   |
| ------------------------------------------------------------ | --------------------------- |
| `supabase/migrations/[timestamp]_add_paper_external_ids.sql` | 새 파일                     |
| `src/lib/db/papers.ts`                                       | 수정                        |
| `src/lib/unpaywall/client.ts`                                | 새 파일                     |
| `src/lib/unpaywall/index.ts`                                 | 새 파일                     |
| `src/lib/arxiv/index.ts`                                     | 새 파일                     |
| `src/lib/jobs/queues.ts`                                     | 수정                        |
| `src/lib/jobs/workers/pdfDownloadWorker.ts`                  | 수정 (주요)                 |
| `src/app/api/collections/route.ts`                           | 수정                        |
| `src/app/api/collections/[id]/expand/route.ts`               | 수정                        |
| `src/types/database.types.ts`                                | 재생성                      |
| `.env.example`                                               | 수정 (UNPAYWALL_EMAIL 추가) |

---

## 제외 항목 (나중에 구현)

- 기존 실패 논문 backfill 스크립트
- Retry 버튼 UI 및 `/api/papers/[paperId]/retry` 엔드포인트

---

## 환경 변수

```bash
# .env.example에 추가
UNPAYWALL_EMAIL=your-email@example.com  # Unpaywall API 접근용 (필수 아님, 기본값 있음)
```

---

## 구현 순서

1. DB 마이그레이션 생성 및 적용
2. TypeScript 타입 재생성
3. ArXiv, Unpaywall 헬퍼 모듈 생성
4. Queue 인터페이스 업데이트
5. Download Worker fallback 로직 구현
6. API routes 업데이트
7. (Optional) Retry 엔드포인트 및 UI
