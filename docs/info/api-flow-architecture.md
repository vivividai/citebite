# CiteBite API Flow Architecture

**작성일**: 2025-11-19
**목적**: 논문 검색부터 RAG 기반 채팅까지 전체 시스템의 API 호출 흐름을 상세히 문서화

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [Collection 생성 및 Paper 수집 흐름](#2-collection-생성-및-paper-수집-흐름)
3. [PDF 다운로드 파이프라인](#3-pdf-다운로드-파이프라인)
4. [PDF 인덱싱 파이프라인](#4-pdf-인덱싱-파이프라인)
5. [RAG 기반 채팅 흐름](#5-rag-기반-채팅-흐름)
6. [Collection 조회 및 상태 관리](#6-collection-조회-및-상태-관리)
7. [전체 데이터 흐름 요약](#7-전체-데이터-흐름-요약)

---

## 1. 시스템 개요

CiteBite는 다음과 같은 주요 컴포넌트로 구성됩니다:

```
Frontend (Next.js)
    ↓
API Routes (/api/*)
    ↓
┌─────────────┬─────────────┬──────────────┐
│   Database  │   External  │  Background  │
│  (Supabase) │     APIs    │  Jobs (BullMQ)│
└─────────────┴─────────────┴──────────────┘
```

### 주요 외부 API

1. **Semantic Scholar API**: 논문 검색 및 메타데이터 조회
2. **Gemini File Search API**: PDF 업로드, 벡터 인덱싱, RAG 채팅

### Background Job Queues

1. **pdf-download**: PDF 다운로드 및 Supabase Storage 업로드
2. **pdf-indexing**: PDF를 Gemini File Search Store에 업로드 및 인덱싱
3. **insight-generation**: Collection 인사이트 자동 생성 (미구현)

---

## 2. Collection 생성 및 Paper 수집 흐름

### 2.1 API 엔드포인트

**`POST /api/collections`**

### 2.2 상세 호출 흐름

#### Step 1: 요청 검증 및 인증

**파일**: `src/app/api/collections/route.ts:73-106`

```typescript
// 1. Request body 파싱
const body = await request.json();

// 2. Zod 스키마 검증
const result = createCollectionSchema.safeParse(body);

// 3. Supabase Auth 인증
const supabase = await createServerSupabaseClient();
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();
```

**호출 함수**:

- `createServerSupabaseClient()` - `src/lib/supabase/server.ts`
- `createCollectionSchema.safeParse()` - `src/lib/validations/collections.ts`

---

#### Step 2: Semantic Scholar API를 통한 논문 검색

**파일**: `src/app/api/collections/route.ts:108-130`

```typescript
// Semantic Scholar Client 초기화
const semanticScholarClient = getSemanticScholarClient();

// 논문 검색 실행
const searchResponse = await semanticScholarClient.searchPapers({
  keywords: validatedData.keywords,
  yearFrom: validatedData.filters?.yearFrom,
  yearTo: validatedData.filters?.yearTo,
  minCitations: validatedData.filters?.minCitations,
  openAccessOnly: validatedData.filters?.openAccessOnly,
  limit: 100,
});
```

**호출 함수**:

- `getSemanticScholarClient()` - `src/lib/semantic-scholar/client.ts:240`
- `semanticScholarClient.searchPapers()` - `src/lib/semantic-scholar/client.ts:133`

**Semantic Scholar API 내부 동작**:

1. **캐시 확인** (`client.ts:135-141`)

   ```typescript
   const cacheKey = this.getCacheKey(params);
   const cached = await getCache<CacheEntry>(cacheKey);
   ```

   - Redis 캐시에서 동일한 검색 쿼리 결과 확인
   - TTL: 24시간

2. **API 요청 구성** (`client.ts:145-163`)

   ```typescript
   const query = this.buildQuery(params); // 쿼리 문자열 생성
   const requestParams = {
     query,
     fields:
       'paperId,title,abstract,authors,year,citationCount,venue,openAccessPdf,...',
     limit: 100,
     offset: 0,
     openAccessPdf: params.openAccessOnly ? '' : undefined,
   };
   ```

3. **Retry 로직으로 API 호출** (`client.ts:166-170`)

   ```typescript
   const response = await this.executeWithRetry(async () => {
     return this.client.get<SearchResponse>('/paper/search/bulk', {
       params: requestParams,
     });
   });
   ```

   - 실제 API 엔드포인트: `https://api.semanticscholar.org/graph/v1/paper/search/bulk`
   - Retry 조건: Rate limit (429), Service unavailable (503), Timeout, Network errors
   - Max retries: 3회
   - Exponential backoff: 1초 → 2초 → 4초

4. **캐시 저장** (`client.ts:174-179`)
   ```typescript
   const cacheEntry: CacheEntry = { data, timestamp: Date.now() };
   await setCache(cacheKey, cacheEntry, CACHE_TTL);
   ```

**응답 데이터 구조**:

```json
{
  "total": 1234,
  "offset": 0,
  "data": [
    {
      "paperId": "abc123",
      "title": "Attention Is All You Need",
      "abstract": "...",
      "authors": [{"name": "Ashish Vaswani", ...}],
      "year": 2017,
      "citationCount": 50000,
      "venue": "NeurIPS",
      "openAccessPdf": {
        "url": "https://arxiv.org/pdf/1706.03762.pdf"
      },
      "externalIds": {"ArXiv": "1706.03762"}
    }
  ]
}
```

---

#### Step 3: Database에 Collection 생성

**파일**: `src/app/api/collections/route.ts:133-138`

```typescript
const collection = await createCollection(supabase, {
  name: validatedData.name,
  search_query: validatedData.keywords,
  filters: validatedData.filters || null,
  user_id: user.id,
});
```

**호출 함수**: `createCollection()` - `src/lib/db/collections.ts`

**Database 작업**:

```sql
INSERT INTO collections (name, search_query, filters, user_id)
VALUES ($1, $2, $3, $4)
RETURNING *;
```

**생성된 Collection 객체**:

```typescript
{
  id: "uuid-v4",
  name: "Transformer Models",
  search_query: "attention mechanisms transformers",
  filters: { yearFrom: 2017, minCitations: 100 },
  user_id: "user-uuid",
  file_search_store_id: null, // 아직 미생성
  created_at: "2025-11-19T10:00:00Z",
  updated_at: "2025-11-19T10:00:00Z"
}
```

---

#### Step 4: Papers를 Database에 Upsert

**파일**: `src/app/api/collections/route.ts:141-142`

```typescript
const dbPapers = papers.map(semanticScholarPaperToDbPaper);
const upsertedPaperIds = await upsertPapers(supabase, dbPapers);
```

**호출 함수**:

- `semanticScholarPaperToDbPaper()` - `src/lib/db/papers.ts`
- `upsertPapers()` - `src/lib/db/papers.ts`

**Database 작업**:

```sql
INSERT INTO papers (
  paper_id, title, abstract, authors, year,
  citation_count, venue, external_ids, open_access_pdf_url, vector_status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'none')
ON CONFLICT (paper_id) DO UPDATE SET
  title = EXCLUDED.title,
  abstract = EXCLUDED.abstract,
  ... (업데이트 로직)
RETURNING paper_id;
```

**중요 포인트**:

- `ON CONFLICT (paper_id) DO UPDATE`: 동일한 논문이 여러 Collection에 존재 가능 (중복 방지)
- `vector_status`: 초기값은 `'none'` (아직 벡터화되지 않음)

---

#### Step 5: Collection과 Papers 연결

**파일**: `src/app/api/collections/route.ts:145`

```typescript
await linkPapersToCollection(supabase, collection.id, upsertedPaperIds);
```

**Database 작업**:

```sql
INSERT INTO collection_papers (collection_id, paper_id)
VALUES ($1, $2), ($1, $3), ...
ON CONFLICT DO NOTHING;
```

**ERD 관계**:

```
collections (1) ←→ (N) collection_papers (N) ←→ (1) papers
```

---

#### Step 6: Gemini File Search Store 생성

**파일**: `src/app/api/collections/route.ts:148-164`

```typescript
const storeResult = await createFileSearchStore(
  collection.id,
  `${validatedData.name} - ${collection.id.substring(0, 8)}`
);

if (storeResult.success && storeResult.storeId) {
  await updateCollectionFileSearchStore(
    supabase,
    collection.id,
    storeResult.storeId
  );
}
```

**호출 함수**: `createFileSearchStore()` - `src/lib/gemini/fileSearch.ts:41`

**Gemini API 호출 상세**:

1. **Gemini Client 초기화** (`fileSearch.ts:46`)

   ```typescript
   const client = getGeminiClient();
   ```

   - 환경변수 `GEMINI_API_KEY` 사용
   - SDK: `@google/generative-ai` v1.29.1

2. **File Search Store 생성 요청** (`fileSearch.ts:51-55`)

   ```typescript
   const store = await client.fileSearchStores.create({
     config: {
       displayName: 'Transformer Models - abc12345',
     },
   });
   ```

   - 실제 API 엔드포인트: `POST https://generativelanguage.googleapis.com/v1beta/fileSearchStores`
   - Request Body:
     ```json
     {
       "config": {
         "displayName": "Transformer Models - abc12345"
       }
     }
     ```

3. **Store ID 추출** (`fileSearch.ts:59`)

   ```typescript
   const storeId = store.name?.split('/').pop();
   ```

   - Response에서 resource name 파싱
   - 예: `fileSearchStores/store_abc123` → `store_abc123`

4. **Database 업데이트** (`collections.ts`)
   ```sql
   UPDATE collections
   SET file_search_store_id = $1
   WHERE id = $2;
   ```

**생성된 Store 정보**:

```typescript
{
  success: true,
  storeId: "store_abc123xyz",
  storeName: "Transformer Models - abc12345"
}
```

---

#### Step 7: Open Access Papers의 PDF 다운로드 Job 큐잉

**파일**: `src/app/api/collections/route.ts:166-180`

```typescript
const openAccessPapers = getOpenAccessPapers(papers);

for (const paper of openAccessPapers) {
  if (!paper.openAccessPdf?.url) continue;

  const jobId = await queuePdfDownload({
    collectionId: collection.id,
    paperId: paper.paperId,
    pdfUrl: paper.openAccessPdf.url,
  });

  queuedJobs.push(jobId);
}
```

**호출 함수**:

- `getOpenAccessPapers()` - `src/lib/db/papers.ts`
  - Filter: `papers.filter(p => p.openAccessPdf?.url)`
- `queuePdfDownload()` - `src/lib/jobs/queues.ts:168`

**BullMQ Job 생성 상세**:

1. **Queue 가져오기** (`queues.ts:171`)

   ```typescript
   const queue = getPdfDownloadQueue();
   ```

   - Redis 연결 확인
   - Queue 인스턴스 반환 (singleton)

2. **Job 추가** (`queues.ts:178`)

   ```typescript
   const job = await queue.add('download-pdf', {
     collectionId: 'collection-uuid',
     paperId: 'abc123',
     pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
   });
   ```

3. **Job 옵션** (`queues.ts:52-64`)
   ```typescript
   {
     attempts: 3,                    // 최대 3회 재시도
     backoff: {
       type: 'exponential',
       delay: 2000                   // 2초부터 시작
     },
     removeOnComplete: {
       age: 24 * 3600,               // 24시간 후 삭제
       count: 1000                   // 최대 1000개 유지
     },
     removeOnFail: {
       age: 7 * 24 * 3600            // 실패 시 7일 보관
     }
   }
   ```

**Redis에 저장되는 Job 데이터**:

```json
{
  "id": "job_xyz789",
  "name": "download-pdf",
  "data": {
    "collectionId": "collection-uuid",
    "paperId": "abc123",
    "pdfUrl": "https://arxiv.org/pdf/1706.03762.pdf"
  },
  "opts": { ... },
  "timestamp": 1700000000000,
  "delay": 0,
  "priority": 0
}
```

---

#### Step 8: API 응답 반환

**파일**: `src/app/api/collections/route.ts:185-206`

```typescript
return NextResponse.json(
  {
    success: true,
    data: {
      collection: {
        id: collection.id,
        name: collection.name,
        searchQuery: collection.search_query,
        filters: collection.filters,
        fileSearchStoreId: storeResult.storeId || null,
        createdAt: collection.created_at,
      },
      stats: {
        totalPapers: papers.length,
        openAccessPapers: openAccessPapers.length,
        queuedDownloads: successfulJobs,
        failedToQueue: queuedJobs.length - successfulJobs,
      },
    },
  },
  { status: 201 }
);
```

**응답 예시**:

```json
{
  "success": true,
  "data": {
    "collection": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Transformer Models",
      "searchQuery": "attention mechanisms transformers",
      "filters": { "yearFrom": 2017, "minCitations": 100 },
      "fileSearchStoreId": "store_abc123xyz",
      "createdAt": "2025-11-19T10:00:00Z"
    },
    "stats": {
      "totalPapers": 100,
      "openAccessPapers": 45,
      "queuedDownloads": 45,
      "failedToQueue": 0
    }
  }
}
```

---

## 3. PDF 다운로드 파이프라인

### 3.1 Background Worker 시작

**파일**: `src/lib/jobs/workers/pdfDownloadWorker.ts:168`

```typescript
export function startPdfDownloadWorker(): Worker<PdfDownloadJobData> | null {
  const connection = getRedisClient();

  pdfDownloadWorker = new Worker<PdfDownloadJobData>(
    'pdf-download',
    processPdfDownload,
    {
      connection,
      concurrency: 5, // 최대 5개 동시 처리
      limiter: {
        max: 10, // 초당 최대 10개 job
        duration: 1000,
      },
    }
  );
}
```

**Worker 설정**:

- Queue 이름: `pdf-download`
- 동시 처리: 5개
- Rate limit: 초당 10개

---

### 3.2 PDF 다운로드 Job 처리

**파일**: `src/lib/jobs/workers/pdfDownloadWorker.ts:71`

```typescript
async function processPdfDownload(job: Job<PdfDownloadJobData>) {
  const { collectionId, paperId, pdfUrl } = job.data;

  // ... 처리 로직
}
```

#### Step 1: PDF 다운로드

**파일**: `pdfDownloadWorker.ts:81-84`

```typescript
const pdfBuffer = await downloadPdfFromUrl(pdfUrl);
```

**내부 동작** (`pdfDownloadWorker.ts:23-43`):

```typescript
async function downloadPdfFromUrl(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000, // 30초 타임아웃
    maxContentLength: 100 * 1024 * 1024, // 100MB 제한
    headers: {
      'User-Agent': 'CiteBite/1.0 (Research Paper Collector)',
    },
  });

  // Content-Type 검증
  const contentType = response.headers['content-type'];
  if (contentType && !contentType.includes('application/pdf')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  return Buffer.from(response.data);
}
```

**실제 HTTP 요청**:

```http
GET https://arxiv.org/pdf/1706.03762.pdf HTTP/1.1
User-Agent: CiteBite/1.0 (Research Paper Collector)
Accept: */*
```

---

#### Step 2: Supabase Storage에 업로드

**파일**: `pdfDownloadWorker.ts:87`

```typescript
const storagePath = await uploadPdf(collectionId, paperId, pdfBuffer);
```

**호출 함수**: `uploadPdf()` - `src/lib/storage/supabaseStorage.ts`

**Supabase Storage API 호출**:

1. **Storage path 생성**

   ```typescript
   const path = `${collectionId}/${paperId}.pdf`;
   ```

2. **파일 업로드**
   ```typescript
   const { data, error } = await supabase.storage
     .from('pdfs')
     .upload(path, pdfBuffer, {
       contentType: 'application/pdf',
       upsert: true,
     });
   ```

   - Bucket: `pdfs` (private)
   - Path: `{collectionId}/{paperId}.pdf`
   - Upsert: 기존 파일 덮어쓰기 허용

**Storage 구조**:

```
pdfs/
├── collection-uuid-1/
│   ├── paper-abc123.pdf
│   ├── paper-def456.pdf
│   └── ...
├── collection-uuid-2/
│   └── ...
```

---

#### Step 3: Database 상태 업데이트

**파일**: `pdfDownloadWorker.ts:91`

```typescript
await updatePaperStatus(paperId, 'processing');
```

**Database 작업** (`pdfDownloadWorker.ts:48-66`):

```sql
UPDATE papers
SET vector_status = 'processing'
WHERE paper_id = $1;
```

**상태 전이**:

```
none → processing → completed (또는 failed)
```

---

#### Step 4: PDF 인덱싱 Job 큐잉

**파일**: `pdfDownloadWorker.ts:95-100`

```typescript
const storageKey = getStoragePath(collectionId, paperId);
const indexJobId = await queuePdfIndexing({
  collectionId,
  paperId,
  storageKey,
});
```

**호출 함수**: `queuePdfIndexing()` - `src/lib/jobs/queues.ts:189`

**BullMQ Job 생성**:

```typescript
await queue.add('index-pdf', {
  collectionId: 'collection-uuid',
  paperId: 'abc123',
  storageKey: 'collection-uuid/abc123.pdf',
});
```

**Job 옵션** (`queues.ts:91-103`):

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000                 // 5초부터 시작 (API rate limit 고려)
  }
}
```

---

### 3.3 에러 처리 및 Retry 로직

**파일**: `pdfDownloadWorker.ts:115-137`

```typescript
catch (error) {
  const isRetryable = isRetryableError(error);

  if (!isRetryable) {
    // Non-retryable error: 즉시 실패 처리
    await updatePaperStatus(paperId, 'failed');
  }

  throw error; // BullMQ가 retry 처리
}
```

**Retry 판단 로직** (`pdfDownloadWorker.ts:143-163`):

```typescript
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    // Retry 불가: 404 (Not Found), 403 (Forbidden), 400 (Bad Request)
    if (status === 404 || status === 403 || status === 400) {
      return false;
    }

    // Retry 가능: Network errors, Timeouts, 5xx errors
    return true;
  }

  return true; // Unknown errors는 retry
}
```

**Worker Event Handlers** (`pdfDownloadWorker.ts:200-242`):

```typescript
pdfDownloadWorker.on('completed', async job => {
  console.log(`Job ${job.id} completed for paper ${job.data.paperId}`);
});

pdfDownloadWorker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err);

  // 최종 실패 시 DB 상태 업데이트
  await supabase
    .from('papers')
    .update({ vector_status: 'failed' })
    .eq('paper_id', job.data.paperId);
});
```

---

## 4. PDF 인덱싱 파이프라인

### 4.1 Background Worker 시작

**파일**: `src/lib/jobs/workers/pdfIndexWorker.ts:156`

```typescript
export function startPdfIndexWorker(): Worker<PdfIndexJobData> | null {
  pdfIndexWorker = new Worker<PdfIndexJobData>(
    'pdf-indexing',
    processPdfIndexing,
    {
      connection,
      concurrency: 3, // Gemini API rate limit 고려
      limiter: {
        max: 5, // 초당 최대 5개 job
        duration: 1000,
      },
    }
  );
}
```

**Worker 설정**:

- Queue 이름: `pdf-indexing`
- 동시 처리: 3개 (Gemini API rate limit 때문에 낮춤)
- Rate limit: 초당 5개

---

### 4.2 PDF 인덱싱 Job 처리

**파일**: `src/lib/jobs/workers/pdfIndexWorker.ts:20`

```typescript
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId, storageKey } = job.data;

  // ... 처리 로직
}
```

#### Step 1: Collection의 File Search Store ID 조회

**파일**: `pdfIndexWorker.ts:31-47`

```typescript
const { data: collection, error: collectionError } = await supabase
  .from('collections')
  .select('file_search_store_id')
  .eq('id', collectionId)
  .single();

if (!collection.file_search_store_id) {
  throw new Error('Collection missing file_search_store_id');
}
```

**Database 쿼리**:

```sql
SELECT file_search_store_id
FROM collections
WHERE id = $1
LIMIT 1;
```

---

#### Step 2: Paper 메타데이터 조회

**파일**: `pdfIndexWorker.ts:54-64`

```typescript
const { data: paper, error: paperError } = await supabase
  .from('papers')
  .select('paper_id, title, authors, year, venue')
  .eq('paper_id', paperId)
  .single();
```

**Database 쿼리**:

```sql
SELECT paper_id, title, authors, year, venue
FROM papers
WHERE paper_id = $1
LIMIT 1;
```

**조회된 데이터 예시**:

```typescript
{
  paper_id: "abc123",
  title: "Attention Is All You Need",
  authors: [
    { name: "Ashish Vaswani", authorId: "..." },
    { name: "Noam Shazeer", authorId: "..." }
  ],
  year: 2017,
  venue: "NeurIPS"
}
```

---

#### Step 3: Supabase Storage에서 PDF 다운로드

**파일**: `pdfIndexWorker.ts:72`

```typescript
const pdfBuffer = await downloadPdf(collectionId, paperId);
```

**호출 함수**: `downloadPdf()` - `src/lib/storage/supabaseStorage.ts`

**Supabase Storage API 호출**:

```typescript
const { data, error } = await supabase.storage
  .from('pdfs')
  .download(`${collectionId}/${paperId}.pdf`);

const arrayBuffer = await data.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
```

---

#### Step 4: Gemini 메타데이터 준비

**파일**: `pdfIndexWorker.ts:78-91`

```typescript
const authorsString = paper.authors ? JSON.stringify(paper.authors) : undefined;

const metadata: PaperMetadata = {
  paper_id: paper.paper_id,
  title: paper.title.substring(0, 256), // Gemini 제한: 256자
  authors: authorsString?.substring(0, 256), // Gemini 제한: 256자
  year: paper.year || undefined,
  venue: paper.venue?.substring(0, 256), // Gemini 제한: 256자
};
```

**중요**: Gemini File Search의 custom metadata는 **string value 최대 256자 제한**

**메타데이터 예시**:

```typescript
{
  paper_id: "abc123",
  title: "Attention Is All You Need",
  authors: "[{\"name\":\"Ashish Vaswani\",\"authorId\":\"...\"}]",
  year: 2017,
  venue: "NeurIPS"
}
```

---

#### Step 5: Gemini File Search Store에 PDF 업로드

**파일**: `pdfIndexWorker.ts:98-103`

```typescript
const result = await withRetry(
  () => uploadPdfToStore(collection.file_search_store_id!, pdfBuffer, metadata),
  3, // max retries
  1000 // initial delay 1s
);
```

**호출 함수**: `uploadPdfToStore()` - `src/lib/gemini/fileSearch.ts:93`

**Gemini API 호출 상세**:

1. **Buffer를 Blob으로 변환** (`fileSearch.ts:103`)

   ```typescript
   const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
   ```

2. **File Search Store에 업로드** (`fileSearch.ts:106-126`)

   ```typescript
   const operation = await client.fileSearchStores.uploadToFileSearchStore({
     fileSearchStoreName: `fileSearchStores/${storeId}`,
     file: blob,
     config: {
       mimeType: 'application/pdf',
       displayName: metadata.title,
       customMetadata: [
         { key: 'paper_id', stringValue: metadata.paper_id },
         { key: 'title', stringValue: metadata.title },
         { key: 'authors', stringValue: metadata.authors },
         { key: 'year', stringValue: metadata.year.toString() },
         { key: 'venue', stringValue: metadata.venue },
       ],
     },
   });
   ```

   **실제 API 엔드포인트**:

   ```
   POST https://generativelanguage.googleapis.com/v1beta/fileSearchStores/{storeId}/uploadToFileSearchStore
   ```

   **Request 구조**:
   - Content-Type: `multipart/form-data`
   - PDF 파일 binary
   - Metadata JSON

3. **Operation 완료 확인** (`fileSearch.ts:136-144`)

   ```typescript
   if (operation.response && operation.response.documentName) {
     // 즉시 완료된 경우
     const fileId = operation.response.documentName.split('/').pop();
     return { success: true, fileId };
   }
   ```

4. **Polling으로 완료 대기** (`fileSearch.ts:149-169`)

   ```typescript
   const result = await pollOperation(operation, client);
   ```

   **Polling 로직** (`fileSearch.ts:274-355`):

   ```typescript
   async function pollOperation(...) {
     let attempts = 0;
     const MAX_POLLING_ATTEMPTS = 60;     // 최대 60회
     const POLLING_INTERVAL_MS = 5000;    // 5초 간격

     while (attempts < MAX_POLLING_ATTEMPTS) {
       const updatedOperation = await client.operations.get({
         name: operation.name,
       });

       if (updatedOperation.done) {
         const fileId = updatedOperation.response?.documentName.split('/').pop();
         return { success: true, fileId };
       }

       await sleep(5000);
       attempts++;
     }

     // Timeout: 5분 (60 * 5초)
     return { success: false, error: 'Operation timeout' };
   }
   ```

**Gemini File Search 내부 처리**:

1. PDF 파일 수신 및 저장
2. PDF를 청크(chunk)로 분할
3. 각 청크를 벡터로 임베딩
4. 벡터 DB에 저장 (semantic search 가능)
5. Operation 완료

**성공 응답**:

```typescript
{
  success: true,
  fileId: "documents/xyz789"
}
```

---

#### Step 6: Retry 로직 (Rate Limit 처리)

**파일**: `src/lib/gemini/fileSearch.ts:392`

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error.message?.includes('quota') ||
        error.message?.includes('rate limit') ||
        error.code === 429;

      if (!isRateLimit || i === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, i);
      console.log(`Rate limit hit, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}
```

**Retry 전략**:

- 1차 실패: 1초 대기
- 2차 실패: 2초 대기
- 3차 실패: 4초 대기
- 3회 실패 후 throw

---

#### Step 7: Database 상태 업데이트

**파일**: `pdfIndexWorker.ts:114-117`

```typescript
const { error: updateError } = await supabase
  .from('papers')
  .update({ vector_status: 'completed' })
  .eq('paper_id', paperId);
```

**Database 쿼리**:

```sql
UPDATE papers
SET vector_status = 'completed'
WHERE paper_id = $1;
```

**상태 전이**:

```
processing → completed
```

---

### 4.3 에러 처리

**파일**: `pdfIndexWorker.ts:132-150`

```typescript
catch (error) {
  console.error('Failed to process job:', error);

  // 실패 시 상태 업데이트
  await supabase
    .from('papers')
    .update({ vector_status: 'failed' })
    .eq('paper_id', paperId);

  throw error; // BullMQ가 retry 처리
}
```

**Worker Event Handlers** (`pdfIndexWorker.ts:188-201`):

```typescript
pdfIndexWorker.on('completed', async job => {
  console.log(`Job ${job.id} completed for paper ${job.data.paperId}`);
});

pdfIndexWorker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  // Note: 상태 업데이트는 processPdfIndexing의 catch에서 처리됨
});
```

---

## 5. RAG 기반 채팅 흐름

### 5.1 Conversation 생성

**API 엔드포인트**: `POST /api/conversations`

**파일**: `src/app/api/conversations/route.ts:11`

#### Step 1: 요청 검증 및 인증

**파일**: `route.ts:14-22`

```typescript
// 1. 인증
const supabase = await createServerSupabaseClient();
const {
  data: { user },
} = await supabase.auth.getUser();

// 2. Request body 검증
const body = await request.json();
const result = createConversationSchema.safeParse(body);
const { collectionId, title } = result.data;
```

---

#### Step 2: Collection 소유권 확인

**파일**: `route.ts:44-45`

```typescript
await getCollectionWithOwnership(supabase, collectionId, user.id);
```

**Database 쿼리**:

```sql
SELECT *
FROM collections
WHERE id = $1 AND user_id = $2
LIMIT 1;
```

---

#### Step 3: Conversation 생성

**파일**: `route.ts:64-69`

```typescript
const conversation = await createConversation(
  supabase,
  collectionId,
  user.id,
  title
);
```

**Database 작업** (`src/lib/db/conversations.ts`):

```sql
INSERT INTO conversations (collection_id, user_id, title)
VALUES ($1, $2, $3)
RETURNING *;
```

**생성된 Conversation**:

```typescript
{
  id: "conversation-uuid",
  collection_id: "collection-uuid",
  user_id: "user-uuid",
  title: "Questions about Transformers",
  last_message_at: null,
  created_at: "2025-11-19T10:30:00Z"
}
```

---

### 5.2 메시지 전송 및 AI 응답

**API 엔드포인트**: `POST /api/conversations/[id]/messages`

**파일**: `src/app/api/conversations/[id]/messages/route.ts:128`

#### Step 1: 요청 검증 및 인증

**파일**: `messages/route.ts:136-158`

```typescript
// 1. 인증
const supabase = await createServerSupabaseClient();
const {
  data: { user },
} = await supabase.auth.getUser();

// 2. Request body 검증
const body = await request.json();
const result = sendMessageSchema.safeParse(body);
const { content: userMessage } = result.data;
```

---

#### Step 2: Conversation 및 Collection 확인

**파일**: `messages/route.ts:163-186`

```typescript
// Conversation 확인
const conversation = await getConversationWithOwnership(
  supabase,
  conversationId,
  user.id
);

// Collection 확인 및 File Search Store 검증
const collection = await getCollectionWithOwnership(
  supabase,
  conversation.collection_id,
  user.id
);

if (!collection.file_search_store_id) {
  return NextResponse.json(
    { error: 'Collection has no papers indexed yet' },
    { status: 400 }
  );
}
```

**Database 쿼리**:

```sql
-- Conversation 조회
SELECT c.*, col.user_id
FROM conversations c
JOIN collections col ON c.collection_id = col.id
WHERE c.id = $1 AND col.user_id = $2;

-- Collection 조회
SELECT *
FROM collections
WHERE id = $1 AND user_id = $2;
```

---

#### Step 3: Collection의 Papers 조회

**파일**: `messages/route.ts:188-201`

```typescript
const collectionPapers = await getCollectionPapers(supabase, collection.id);
const collectionPaperIds = collectionPapers.map(p => p.paper_id);

if (collectionPaperIds.length === 0) {
  return NextResponse.json(
    { error: 'Collection has no papers' },
    { status: 400 }
  );
}
```

**Database 쿼리** (`src/lib/db/papers.ts`):

```sql
SELECT p.*
FROM papers p
JOIN collection_papers cp ON p.paper_id = cp.paper_id
WHERE cp.collection_id = $1;
```

**조회된 Paper IDs 예시**:

```typescript
["abc123", "def456", "ghi789", ...]
```

---

#### Step 4: Conversation History 조회

**파일**: `messages/route.ts:204-214`

```typescript
const conversationHistory = await getLatestMessages(
  supabase,
  conversationId,
  10 // 최근 10개 메시지
);

const formattedHistory = conversationHistory.map(msg => ({
  role: msg.role as 'user' | 'assistant',
  content: msg.content,
}));
```

**Database 쿼리** (`src/lib/db/messages.ts`):

```sql
SELECT *
FROM messages
WHERE conversation_id = $1
ORDER BY timestamp DESC
LIMIT 10;
```

**조회된 History 예시**:

```typescript
[
  { role: 'user', content: 'What are transformers?' },
  {
    role: 'assistant',
    content: 'Transformers are neural network architectures...',
  },
  { role: 'user', content: 'How does attention work?' },
  { role: 'assistant', content: 'Attention mechanisms allow...' },
];
```

---

#### Step 5: Gemini에 File Search 쿼리

**파일**: `messages/route.ts:223-228`

```typescript
aiResponse = await queryWithFileSearch(
  collection.file_search_store_id,
  userMessage,
  formattedHistory,
  collectionPaperIds
);
```

**호출 함수**: `queryWithFileSearch()` - `src/lib/gemini/chat.ts:50`

**Gemini API 호출 상세**:

1. **Content 배열 구성** (`chat.ts:62-72`)

   ```typescript
   const contents = [
     // Conversation history
     ...conversationHistory.map(msg => ({
       role: msg.role === 'assistant' ? 'model' : 'user',
       parts: [{ text: msg.content }],
     })),
     // New user message
     {
       role: 'user',
       parts: [{ text: userMessage }],
     },
   ];
   ```

   **구성된 Contents 예시**:

   ```typescript
   [
     { role: 'user', parts: [{ text: 'What are transformers?' }] },
     { role: 'model', parts: [{ text: 'Transformers are...' }] },
     { role: 'user', parts: [{ text: 'How does self-attention work?' }] },
   ];
   ```

2. **Gemini generateContent 호출** (`chat.ts:76-88`)

   ```typescript
   const response = await client.models.generateContent({
     model: 'gemini-2.5-flash',
     contents,
     config: {
       tools: [
         {
           fileSearch: {
             fileSearchStoreNames: [`fileSearchStores/${fileSearchStoreId}`],
           },
         },
       ],
     },
   });
   ```

   **실제 API 엔드포인트**:

   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
   ```

   **Request Body**:

   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "What are transformers?" }]
       },
       {
         "role": "model",
         "parts": [
           { "text": "Transformers are neural network architectures..." }
         ]
       },
       {
         "role": "user",
         "parts": [{ "text": "How does self-attention work?" }]
       }
     ],
     "tools": [
       {
         "fileSearch": {
           "fileSearchStoreNames": ["fileSearchStores/store_abc123xyz"]
         }
       }
     ]
   }
   ```

3. **Gemini 내부 처리 과정**:

   a. **User query 분석**
   - 질문의 의도 파악
   - 검색 키워드 추출

   b. **File Search Store에서 관련 문서 검색**
   - User query를 벡터로 임베딩
   - File Search Store의 벡터 DB에서 유사도 검색 (semantic search)
   - 가장 관련성 높은 청크(chunk) 추출

   c. **Grounded response 생성**
   - 검색된 문서 청크를 context로 사용
   - LLM이 context 기반으로 답변 생성
   - 사용된 청크에 대한 citation 메타데이터 포함

4. **응답 추출** (`chat.ts:94-105`)

   ```typescript
   const answer =
     response.candidates?.[0]?.content?.parts?.[0]?.text ||
     'No answer generated';

   const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

   const citedPapers = extractCitationsFromMetadata(
     groundingMetadata,
     collectionPaperIds
   );
   ```

   **Gemini Response 구조**:

   ```json
   {
     "candidates": [
       {
         "content": {
           "parts": [
             {
               "text": "Self-attention allows the model to weigh the importance of different words..."
             }
           ],
           "role": "model"
         },
         "groundingMetadata": {
           "groundingChunks": [
             {
               "document": {
                 "name": "documents/xyz789",
                 "metadata": [
                   { "key": "paper_id", "stringValue": "abc123" },
                   {
                     "key": "title",
                     "stringValue": "Attention Is All You Need"
                   }
                 ]
               },
               "relevanceScore": 0.95
             }
           ]
         }
       }
     ]
   }
   ```

---

#### Step 6: Citations 추출 및 검증

**파일**: `chat.ts:156`

```typescript
function extractCitationsFromMetadata(
  groundingMetadata: unknown,
  collectionPaperIds: string[]
): CitedPaper[] {
  const chunks = groundingMetadata.groundingChunks || [];
  const citedPapers: CitedPaper[] = [];
  const seenPaperIds = new Set<string>();

  for (const chunk of chunks) {
    // Paper ID 추출
    let paperId = extractPaperIdFromChunk(chunk);

    // Collection에 속한 paper인지 검증
    if (paperId && collectionPaperIds.includes(paperId)) {
      if (!seenPaperIds.has(paperId)) {
        seenPaperIds.add(paperId);

        citedPapers.push({
          paperId,
          title: chunk.metadata?.title || 'Unknown paper',
          relevanceScore: chunk.relevanceScore,
        });
      }
    } else if (paperId) {
      console.warn(
        `Paper ${paperId} cited but not in collection (hallucination)`
      );
    }
  }

  return citedPapers;
}
```

**Citation 추출 로직** (`chat.ts:181-228`):

1. **grounding chunks 순회**
2. **각 chunk에서 paper_id 추출**:
   - `chunk.metadata.paper_id`
   - `chunk.document.metadata.paper_id`
   - `chunk.documentName` 파싱
3. **Collection에 속한 paper인지 검증** (hallucination 방지)
4. **중복 제거** (Set 사용)

**추출된 Citations 예시**:

```typescript
[
  {
    paperId: 'abc123',
    title: 'Attention Is All You Need',
    relevanceScore: 0.95,
  },
  {
    paperId: 'def456',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers',
    relevanceScore: 0.87,
  },
];
```

---

#### Step 7: Citations 데이터 보강 (Enrichment)

**파일**: `messages/route.ts:248-257`

```typescript
validatedCitations = await validateAndEnrichCitations(
  supabase,
  aiResponse.citedPapers,
  collection.id
);
```

**호출 함수**: `validateAndEnrichCitations()` - `src/lib/citations/validator.ts`

**Database 쿼리**:

```sql
SELECT p.paper_id, p.title, p.authors, p.year, p.venue
FROM papers p
JOIN collection_papers cp ON p.paper_id = cp.paper_id
WHERE cp.collection_id = $1
  AND p.paper_id = ANY($2);
```

**보강된 Citations**:

```typescript
[
  {
    paperId: 'abc123',
    title: 'Attention Is All You Need',
    authors: [
      { name: 'Ashish Vaswani', authorId: '...' },
      { name: 'Noam Shazeer', authorId: '...' },
    ],
    year: 2017,
    venue: 'NeurIPS',
    relevanceScore: 0.95,
  },
];
```

---

#### Step 8: 메시지 저장

**파일**: `messages/route.ts:260-274`

```typescript
// User message 저장
const userMessageRecord = await createMessage(
  supabase,
  conversationId,
  'user',
  userMessage
);

// Assistant message 저장 (citations 포함)
const assistantMessageRecord = await createMessage(
  supabase,
  conversationId,
  'assistant',
  aiResponse.answer,
  validatedCitations.length > 0 ? validatedCitations : undefined
);
```

**Database 작업** (`src/lib/db/messages.ts`):

```sql
-- User message
INSERT INTO messages (conversation_id, role, content, cited_papers, timestamp)
VALUES ($1, 'user', $2, NULL, NOW())
RETURNING *;

-- Assistant message
INSERT INTO messages (conversation_id, role, content, cited_papers, timestamp)
VALUES ($1, 'assistant', $2, $3::jsonb, NOW())
RETURNING *;
```

**저장된 Assistant Message**:

```typescript
{
  id: "message-uuid",
  conversation_id: "conversation-uuid",
  role: "assistant",
  content: "Self-attention allows the model to weigh...",
  cited_papers: [
    {
      paperId: "abc123",
      title: "Attention Is All You Need",
      authors: [...],
      year: 2017,
      venue: "NeurIPS",
      relevanceScore: 0.95
    }
  ],
  timestamp: "2025-11-19T10:35:00Z"
}
```

---

#### Step 9: Conversation 마지막 메시지 시간 업데이트

**파일**: `messages/route.ts:277`

```typescript
await updateLastMessageAt(supabase, conversationId);
```

**Database 작업**:

```sql
UPDATE conversations
SET last_message_at = NOW()
WHERE id = $1;
```

---

#### Step 10: 응답 반환

**파일**: `messages/route.ts:280-300`

```typescript
return NextResponse.json(
  {
    success: true,
    data: {
      userMessage: {
        id: userMessageRecord.id,
        role: 'user',
        content: userMessageRecord.content,
        timestamp: userMessageRecord.timestamp,
      },
      assistantMessage: {
        id: assistantMessageRecord.id,
        role: 'assistant',
        content: assistantMessageRecord.content,
        cited_papers: validatedCitations,
        timestamp: assistantMessageRecord.timestamp,
      },
    },
  },
  { status: 200 }
);
```

---

### 5.3 메시지 조회

**API 엔드포인트**: `GET /api/conversations/[id]/messages`

**파일**: `src/app/api/conversations/[id]/messages/route.ts:29`

#### Step 1: Query Parameters 검증

**파일**: `messages/route.ts:48-67`

```typescript
const searchParams = request.nextUrl.searchParams;
const queryParams = {
  limit: searchParams.get('limit'), // 1-100, default 50
  before: searchParams.get('before'), // ISO datetime
  after: searchParams.get('after'), // ISO datetime
};

const result = getMessagesSchema.safeParse(queryParams);
const { limit, before, after } = result.data;
```

---

#### Step 2: Conversation 소유권 확인

**파일**: `messages/route.ts:70`

```typescript
await getConversationWithOwnership(supabase, conversationId, user.id);
```

---

#### Step 3: Cursor-based Pagination으로 메시지 조회

**파일**: `messages/route.ts:73-77`

```typescript
const { messages, pagination } = await getMessagesByConversationWithCursor(
  supabase,
  conversationId,
  { limit, before, after }
);
```

**Database 쿼리** (`src/lib/db/messages.ts`):

```sql
-- Before cursor (older messages)
SELECT *
FROM messages
WHERE conversation_id = $1
  AND timestamp < $2
ORDER BY timestamp DESC
LIMIT $3;

-- After cursor (newer messages)
SELECT *
FROM messages
WHERE conversation_id = $1
  AND timestamp > $2
ORDER BY timestamp ASC
LIMIT $3;

-- No cursor (latest messages)
SELECT *
FROM messages
WHERE conversation_id = $1
ORDER BY timestamp DESC
LIMIT $2;
```

**응답 예시**:

```typescript
{
  messages: [
    {
      id: "msg-1",
      role: "user",
      content: "What are transformers?",
      cited_papers: null,
      timestamp: "2025-11-19T10:30:00Z"
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Transformers are...",
      cited_papers: [...],
      timestamp: "2025-11-19T10:30:05Z"
    }
  ],
  pagination: {
    hasMore: true,
    nextCursor: "2025-11-19T10:25:00Z",
    prevCursor: "2025-11-19T10:35:00Z"
  }
}
```

---

## 6. Collection 조회 및 상태 관리

### 6.1 Collection 목록 조회

**API 엔드포인트**: `GET /api/collections`

**파일**: `src/app/api/collections/route.ts:32`

```typescript
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const collections = await getUserCollections(supabase, user.id);

  return NextResponse.json({ success: true, data: { collections } });
}
```

**Database 쿼리** (`src/lib/db/collections.ts`):

```sql
SELECT
  c.*,
  COUNT(DISTINCT cp.paper_id) as paper_count
FROM collections c
LEFT JOIN collection_papers cp ON c.id = cp.collection_id
WHERE c.user_id = $1
GROUP BY c.id
ORDER BY c.created_at DESC;
```

---

### 6.2 Collection 상세 조회

**API 엔드포인트**: `GET /api/collections/[id]`

**파일**: `src/app/api/collections/[id]/route.ts:17`

```typescript
export async function GET(request, { params }) {
  const collection = await getCollectionById(supabase, params.id, user.id);
  return NextResponse.json({ success: true, data: { collection } });
}
```

**Database 쿼리**:

```sql
SELECT
  c.*,
  COUNT(DISTINCT cp.paper_id) as total_papers,
  COUNT(DISTINCT CASE WHEN p.vector_status = 'completed' THEN cp.paper_id END) as indexed_papers
FROM collections c
LEFT JOIN collection_papers cp ON c.id = cp.collection_id
LEFT JOIN papers p ON cp.paper_id = p.paper_id
WHERE c.id = $1 AND c.user_id = $2
GROUP BY c.id;
```

---

### 6.3 Collection Papers 조회

**API 엔드포인트**: `GET /api/collections/[id]/papers`

**파일**: `src/app/api/collections/[id]/papers/route.ts:17`

```typescript
export async function GET(request, { params }) {
  await getCollectionWithOwnership(supabase, params.id, user.id);
  const papers = await getCollectionPapers(supabase, params.id);

  return NextResponse.json({ success: true, data: { papers } });
}
```

**Database 쿼리**:

```sql
SELECT p.*
FROM papers p
JOIN collection_papers cp ON p.paper_id = cp.paper_id
WHERE cp.collection_id = $1
ORDER BY p.citation_count DESC, p.year DESC;
```

---

### 6.4 Collection 처리 상태 조회

**API 엔드포인트**: `GET /api/collections/[id]/status`

**파일**: `src/app/api/collections/[id]/status/route.ts:11`

```typescript
export async function GET(request, { params }) {
  // Collection 소유권 확인
  const { data: collection } = await supabase
    .from('collections')
    .select('id, user_id')
    .eq('id', collectionId)
    .single();

  // Papers 상태 조회
  const { data: collectionPapers } = await supabase
    .from('collection_papers')
    .select(
      `
      paper:papers(
        paper_id,
        vector_status
      )
    `
    )
    .eq('collection_id', collectionId);

  // 통계 계산
  const stats = calculateStats(collectionPapers);

  return NextResponse.json({ data: stats });
}
```

**Database 쿼리**:

```sql
SELECT p.paper_id, p.vector_status
FROM papers p
JOIN collection_papers cp ON p.paper_id = cp.paper_id
WHERE cp.collection_id = $1;
```

**통계 계산** (`status/route.ts:74-87`):

```typescript
function calculateStats(papers) {
  let indexedPapers = 0;
  let failedPapers = 0;
  let downloadingPapers = 0;

  papers.forEach(item => {
    const status = item.paper?.vector_status;
    if (status === 'completed') indexedPapers++;
    else if (status === 'failed') failedPapers++;
    else if (status === 'pending') downloadingPapers++;
  });

  return {
    totalPapers: papers.length,
    indexedPapers,
    failedPapers,
    downloadingPapers,
    allProcessed: indexedPapers + failedPapers === papers.length,
  };
}
```

**응답 예시**:

```json
{
  "data": {
    "totalPapers": 100,
    "indexedPapers": 45,
    "failedPapers": 3,
    "downloadingPapers": 52,
    "allProcessed": false
  }
}
```

**Frontend Polling**:

- 처리 진행 중일 때 (`allProcessed: false`) 5초마다 polling
- 모든 처리 완료 시 (`allProcessed: true`) polling 중지

---

## 7. 전체 데이터 흐름 요약

### 7.1 시퀀스 다이어그램

```
User → Frontend → API Route → External API / Database → Background Jobs
```

### 7.2 Collection 생성부터 RAG 채팅까지 전체 흐름

```
1. Collection 생성 (POST /api/collections)
   ├─ Semantic Scholar API: Paper 검색
   ├─ Database: Collection, Papers, collection_papers INSERT
   ├─ Gemini API: File Search Store 생성
   └─ BullMQ: PDF Download jobs 큐잉 (45개)

2. PDF 다운로드 (Background Worker)
   ├─ Semantic Scholar: PDF 다운로드
   ├─ Supabase Storage: PDF 업로드
   ├─ Database: vector_status = 'processing'
   └─ BullMQ: PDF Indexing jobs 큐잉

3. PDF 인덱싱 (Background Worker)
   ├─ Supabase Storage: PDF 다운로드
   ├─ Gemini API: File Search Store에 업로드
   │  ├─ PDF 청크 분할
   │  ├─ 벡터 임베딩
   │  └─ 벡터 DB 저장
   └─ Database: vector_status = 'completed'

4. Conversation 생성 (POST /api/conversations)
   └─ Database: Conversation INSERT

5. 메시지 전송 (POST /api/conversations/[id]/messages)
   ├─ Database: Conversation history, Collection papers 조회
   ├─ Gemini API: File Search 쿼리
   │  ├─ Query 벡터 임베딩
   │  ├─ 유사도 검색 (semantic search)
   │  ├─ 관련 청크 추출
   │  └─ Grounded response 생성
   ├─ Citations 추출 및 검증
   └─ Database: User message, Assistant message INSERT

6. 상태 조회 (GET /api/collections/[id]/status)
   └─ Database: Papers의 vector_status 집계
```

### 7.3 데이터 상태 전이

**Paper vector_status**:

```
none → processing → completed
  └──────────────────→ failed
```

**Job 상태**:

```
waiting → active → completed
    └───────────────→ failed (retry 후 최종 실패)
```

### 7.4 주요 성능 최적화 포인트

1. **Redis 캐싱**:
   - Semantic Scholar API 응답 (24시간 TTL)
   - Cache key: MD5 hash of search params

2. **Background Jobs**:
   - PDF 다운로드: 5개 동시, 초당 10개 제한
   - PDF 인덱싱: 3개 동시, 초당 5개 제한 (Gemini rate limit)

3. **Retry 전략**:
   - Semantic Scholar: 3회, exponential backoff (1s → 2s → 4s)
   - PDF Download: 3회, exponential backoff (2s → 4s → 8s)
   - PDF Indexing: 3회, exponential backoff (5s → 10s → 20s)
   - Gemini Rate Limit: 3회, exponential backoff (1s → 2s → 4s)

4. **Database 최적화**:
   - Index on: `collections.user_id`, `papers.paper_id`, `collection_papers.(collection_id, paper_id)`
   - Upsert로 중복 방지
   - JOIN으로 N+1 방지

5. **Polling**:
   - Gemini Operation: 5초 간격, 최대 5분 (60회)
   - Collection Status (Frontend): 5초 간격, `allProcessed: true`까지

---

## 부록: API 엔드포인트 전체 목록

### Collections

| Method | Endpoint                       | 설명                      | 주요 함수                                                                                                     |
| ------ | ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/collections`             | Collection 목록 조회      | `getUserCollections()`                                                                                        |
| POST   | `/api/collections`             | Collection 생성           | `createCollection()`, `semanticScholarClient.searchPapers()`, `createFileSearchStore()`, `queuePdfDownload()` |
| GET    | `/api/collections/[id]`        | Collection 상세 조회      | `getCollectionById()`                                                                                         |
| DELETE | `/api/collections/[id]`        | Collection 삭제           | `deleteCollection()`                                                                                          |
| GET    | `/api/collections/[id]/papers` | Collection Papers 조회    | `getCollectionPapers()`                                                                                       |
| GET    | `/api/collections/[id]/status` | Collection 처리 상태 조회 | Supabase query (papers.vector_status)                                                                         |

### Conversations

| Method | Endpoint                           | 설명                            | 주요 함수                                                                  |
| ------ | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/conversations`               | Conversation 생성               | `createConversation()`                                                     |
| GET    | `/api/conversations/[id]/messages` | 메시지 조회 (cursor pagination) | `getMessagesByConversationWithCursor()`                                    |
| POST   | `/api/conversations/[id]/messages` | 메시지 전송 및 AI 응답          | `queryWithFileSearch()`, `validateAndEnrichCitations()`, `createMessage()` |

### Background Workers

| Worker              | Queue          | 처리                                         | 주요 함수                                                   |
| ------------------- | -------------- | -------------------------------------------- | ----------------------------------------------------------- |
| PDF Download Worker | `pdf-download` | PDF 다운로드 → Supabase Storage 업로드       | `downloadPdfFromUrl()`, `uploadPdf()`, `queuePdfIndexing()` |
| PDF Index Worker    | `pdf-indexing` | Supabase Storage → Gemini File Search 업로드 | `downloadPdf()`, `uploadPdfToStore()`                       |

---

**문서 버전**: 1.0
**최종 업데이트**: 2025-11-19
**작성자**: CiteBite Development Team
