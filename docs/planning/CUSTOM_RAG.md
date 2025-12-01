# Custom RAG Implementation Plan

Gemini File Search API 기반 RAG를 Supabase pgvector 기반 커스텀 RAG로 완전 교체하는 구현 계획서입니다.

---

## 1. 기술 스택 선정

| Component           | Choice                    | Rationale                                                  |
| ------------------- | ------------------------- | ---------------------------------------------------------- |
| **Vector DB**       | Supabase pgvector         | 기존 Supabase 인프라 활용, 추가 비용 없음, PostgreSQL 통합 |
| **Index Type**      | HNSW                      | 높은 recall(99%+), 빠른 쿼리, 연구 논문 검색에 적합        |
| **Embedding Model** | Gemini text-embedding-004 | 기존 Gemini API 사용 중, 768 dimensions, 한국어 지원       |
| **Chunking**        | 고정 크기 + 오버랩        | 간단한 구현, 일관된 결과, 문장 경계 존중                   |
| **Search Strategy** | 하이브리드 (RRF)          | 벡터(70%) + 키워드(30%) 결합, 정확도 향상                  |
| **PDF Parser**      | pdf-parse                 | 이미 설치됨, 추가 의존성 없음, 충분한 성능                 |
| **Query Cache**     | 없음 (MVP)                | 단순화 우선, 나중에 Redis로 추가 가능                      |

---

## 2. 아키텍처 개요

### 2.1 현재 아키텍처 (Gemini File Search)

```
PDF → Supabase Storage → Gemini File Search Store → Query with File Search Tool → Grounding Metadata
```

### 2.2 새로운 아키텍처 (Custom pgvector RAG)

```
PDF → Supabase Storage → pdf-parse → Chunking → Gemini Embeddings → pgvector → Hybrid Search → LLM with Context
```

### 2.3 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PDF INDEXING PIPELINE                                        │
├─────────────────────────────────────────────────────────────────┤
│ PDF Download Worker                                             │
│   └─→ Download from Semantic Scholar                            │
│   └─→ Store in Supabase Storage                                 │
│   └─→ Queue PDF Index Job                                       │
│                                                                 │
│ PDF Index Worker (NEW)                                          │
│   └─→ Download from Supabase Storage                            │
│   └─→ Extract text (pdf-parse)                                  │
│   └─→ Chunk text (1000 chars, 200 overlap)                      │
│   └─→ Generate embeddings (Gemini batch API)                    │
│   └─→ Insert into paper_chunks (pgvector)                       │
│   └─→ Update paper.vector_status = 'completed'                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. RAG QUERY PIPELINE                                           │
├─────────────────────────────────────────────────────────────────┤
│ User Query                                                      │
│   └─→ Generate query embedding                                  │
│   └─→ Hybrid search (vector + keyword via RRF)                  │
│   └─→ Retrieve top-k chunks with paper metadata                 │
│   └─→ Build context with [CITE:N] markers                       │
│   └─→ Generate response with Gemini                             │
│   └─→ Parse citations, map to papers                            │
│   └─→ Return answer + groundingChunks + groundingSupports       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 pgvector Extension 활성화

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3.2 paper_chunks 테이블

```sql
CREATE TABLE paper_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id VARCHAR(255) NOT NULL REFERENCES papers(paper_id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,

  -- Chunk content
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  token_count INT NOT NULL,

  -- Vector embedding (Gemini text-embedding-004: 768 dimensions)
  embedding vector(768) NOT NULL,

  -- Full-text search (자동 생성)
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_chunk UNIQUE (paper_id, collection_id, chunk_index)
);
```

### 3.3 인덱스

```sql
-- HNSW index for vector similarity (높은 recall, 빠른 쿼리)
CREATE INDEX idx_chunks_embedding_hnsw ON paper_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Collection filtering
CREATE INDEX idx_chunks_collection ON paper_chunks(collection_id);

-- Paper filtering (삭제 시 성능)
CREATE INDEX idx_chunks_paper ON paper_chunks(paper_id);

-- GIN index for full-text search
CREATE INDEX idx_chunks_content_tsv ON paper_chunks USING gin(content_tsv);
```

### 3.4 HNSW 파라미터 설명

| Parameter         | Value         | Description                                        |
| ----------------- | ------------- | -------------------------------------------------- |
| `m`               | 16            | 각 노드의 최대 연결 수. 높을수록 recall↑, 메모리↑  |
| `ef_construction` | 128           | 인덱스 빌드 시 탐색 폭. 높을수록 품질↑, 빌드 시간↑ |
| `ef_search`       | 100 (runtime) | 쿼리 시 탐색 폭. 높을수록 recall↑, 속도↓           |

### 3.5 RLS Policies

```sql
ALTER TABLE paper_chunks ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 컬렉션 청크만 조회 가능
CREATE POLICY "Users can read own collection chunks"
ON paper_chunks FOR SELECT TO authenticated
USING (collection_id IN (SELECT id FROM collections WHERE user_id = auth.uid()));

-- Service role은 모든 작업 가능 (워커용)
CREATE POLICY "Service role full access"
ON paper_chunks FOR ALL TO service_role
USING (true) WITH CHECK (true);
```

---

## 4. Hybrid Search Function

RRF (Reciprocal Rank Fusion)를 사용한 하이브리드 검색:

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  p_collection_id UUID,
  p_query_embedding vector(768),
  p_query_text TEXT,
  p_limit INT DEFAULT 20,
  p_semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id UUID,
  paper_id VARCHAR(255),
  content TEXT,
  chunk_index INT,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
WITH semantic AS (
  SELECT id, paper_id, content, chunk_index,
    1 - (embedding <=> p_query_embedding) AS score,
    ROW_NUMBER() OVER (ORDER BY embedding <=> p_query_embedding) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit * 2
),
keyword AS (
  SELECT id, paper_id, content, chunk_index,
    ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) AS score,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) DESC) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
    AND content_tsv @@ plainto_tsquery('english', p_query_text)
  LIMIT p_limit * 2
)
SELECT
  COALESCE(s.id, k.id) AS chunk_id,
  COALESCE(s.paper_id, k.paper_id) AS paper_id,
  COALESCE(s.content, k.content) AS content,
  COALESCE(s.chunk_index, k.chunk_index) AS chunk_index,
  COALESCE(s.score, 0)::FLOAT AS semantic_score,
  COALESCE(k.score, 0)::FLOAT AS keyword_score,
  -- RRF: 1/(k + rank) where k=60 is a constant
  (p_semantic_weight * COALESCE(1.0 / (60 + s.rank), 0) +
   (1 - p_semantic_weight) * COALESCE(1.0 / (60 + k.rank), 0))::FLOAT AS combined_score
FROM semantic s
FULL OUTER JOIN keyword k ON s.id = k.id
ORDER BY combined_score DESC
LIMIT p_limit;
$$ LANGUAGE SQL;
```

### RRF 알고리즘 설명

- **목적**: 서로 다른 검색 결과의 순위를 통합
- **공식**: `score = Σ (weight_i / (k + rank_i))`
- **k=60**: 상위 순위에 더 높은 가중치 부여
- **가중치**: semantic 70%, keyword 30%

---

## 5. 파일 구조

### 5.1 새로 생성할 파일

```
src/
├── lib/
│   ├── pdf/
│   │   └── extractor.ts          # PDF 텍스트 추출
│   ├── rag/
│   │   ├── index.ts              # RAG 쿼리 오케스트레이션
│   │   ├── chunker.ts            # 텍스트 청킹
│   │   ├── embeddings.ts         # Gemini 임베딩 래퍼
│   │   └── search.ts             # pgvector 하이브리드 검색
│   └── db/
│       └── chunks.ts             # paper_chunks CRUD

supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_add_pgvector_custom_rag.sql
```

### 5.2 수정할 파일

| File                                               | Changes                                  |
| -------------------------------------------------- | ---------------------------------------- |
| `src/lib/jobs/workers/pdfIndexWorker.ts`           | Gemini File Search → pgvector 파이프라인 |
| `src/lib/gemini/chat.ts`                           | `queryWithFileSearch` → `queryRAG`       |
| `src/lib/gemini/query-with-transform.ts`           | 커스텀 RAG 호출로 변경                   |
| `src/app/api/conversations/[id]/messages/route.ts` | 새 RAG 함수 import                       |

### 5.3 삭제할 파일/코드

| Item                               | Action    |
| ---------------------------------- | --------- |
| `src/lib/gemini/fileSearch.ts`     | 삭제      |
| `collections.file_search_store_id` | 컬럼 제거 |
| `createFileSearchStore()` 호출     | 제거      |
| `uploadPdfToStore()` 호출          | 제거      |

---

## 6. 핵심 구현 코드

### 6.1 PDF Text Extractor

```typescript
// src/lib/pdf/extractor.ts
import pdfParse from 'pdf-parse';

interface ExtractedPdf {
  text: string;
  numPages: number;
  metadata: Record<string, unknown>;
}

export async function extractTextFromPdf(
  buffer: Buffer
): Promise<ExtractedPdf> {
  try {
    const result = await pdfParse(buffer);
    return {
      text: cleanText(result.text),
      numPages: result.numpages,
      metadata: result.info || {},
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // 다중 공백 제거
    .replace(/\n{3,}/g, '\n\n') // 과도한 줄바꿈 정리
    .trim();
}
```

### 6.2 Text Chunker

```typescript
// src/lib/rag/chunker.ts
interface ChunkConfig {
  maxChars: number;
  overlapChars: number;
  minChars: number;
}

interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

const DEFAULT_CONFIG: ChunkConfig = {
  maxChars: 1000,
  overlapChars: 200,
  minChars: 100,
};

export function chunkText(text: string, config = DEFAULT_CONFIG): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    let end = Math.min(start + config.maxChars, text.length);

    // 문장 경계에서 자르기 시도
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastQuestion = text.lastIndexOf('?', end);
      const lastExclaim = text.lastIndexOf('!', end);
      const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim);

      if (lastSentenceEnd > start + config.minChars) {
        end = lastSentenceEnd + 1;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length >= config.minChars) {
      chunks.push({
        content,
        chunkIndex,
        tokenCount: estimateTokens(content),
      });
      chunkIndex++;
    }

    // 다음 청크 시작점 (오버랩 적용)
    start = end - config.overlapChars;
  }

  return chunks;
}

function estimateTokens(text: string): number {
  // 대략적 추정: 영어 기준 4자 = 1토큰
  return Math.ceil(text.length / 4);
}
```

### 6.3 Gemini Embeddings

```typescript
// src/lib/rag/embeddings.ts
import { getGeminiClient } from '@/lib/gemini/client';

const EMBEDDING_MODEL = 'text-embedding-004';
const BATCH_SIZE = 100; // Gemini 배치 최대 크기
const EMBEDDING_DIMENSIONS = 768;

// 단일 쿼리 임베딩 (검색용)
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();
  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text }] }],
    taskType: 'RETRIEVAL_QUERY',
  });
  return result.embedding.values;
}

// 배치 임베딩 (문서 인덱싱용)
export async function generateDocumentEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const client = getGeminiClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const results = await client.models.batchEmbedContents({
      model: EMBEDDING_MODEL,
      requests: batch.map(text => ({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      })),
    });

    embeddings.push(...results.embeddings.map(e => e.values));
  }

  return embeddings;
}

export { EMBEDDING_DIMENSIONS };
```

### 6.4 Hybrid Search

```typescript
// src/lib/rag/search.ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from './embeddings';

export interface SearchResult {
  chunkId: string;
  paperId: string;
  content: string;
  chunkIndex: number;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}

export async function hybridSearch(
  collectionId: string,
  query: string,
  options: {
    limit?: number;
    semanticWeight?: number;
  } = {}
): Promise<SearchResult[]> {
  const { limit = 20, semanticWeight = 0.7 } = options;

  // 1. 쿼리 임베딩 생성
  const queryEmbedding = await generateQueryEmbedding(query);

  // 2. 하이브리드 검색 실행
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc('hybrid_search', {
    p_collection_id: collectionId,
    p_query_embedding: queryEmbedding,
    p_query_text: query,
    p_limit: limit,
    p_semantic_weight: semanticWeight,
  });

  if (error) {
    throw new Error(`Hybrid search failed: ${error.message}`);
  }

  return data.map((row: any) => ({
    chunkId: row.chunk_id,
    paperId: row.paper_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    semanticScore: row.semantic_score,
    keywordScore: row.keyword_score,
    combinedScore: row.combined_score,
  }));
}
```

### 6.5 RAG Query Orchestration

```typescript
// src/lib/rag/index.ts
import { hybridSearch, SearchResult } from './search';
import { getGeminiClient } from '@/lib/gemini/client';
import { CITATION_SYSTEM_PROMPT } from '@/lib/gemini/prompts';
import type { Message, GroundingChunk, GroundingSupport } from '@/types';

export interface RAGResponse {
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
}

export async function queryRAG(
  collectionId: string,
  query: string,
  conversationHistory: Message[]
): Promise<RAGResponse> {
  // 1. Hybrid search for relevant chunks
  const chunks = await hybridSearch(collectionId, query, { limit: 20 });

  if (chunks.length === 0) {
    return {
      answer: 'No relevant information found in the collection.',
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  // 2. Build context from chunks
  const context = buildContext(chunks);

  // 3. Generate response with LLM
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    systemInstruction: CITATION_SYSTEM_PROMPT,
    contents: [
      ...formatHistory(conversationHistory),
      { role: 'user', parts: [{ text: buildPrompt(query, context) }] },
    ],
    generationConfig: {
      temperature: 0.2, // 낮은 온도로 일관된 응답
      maxOutputTokens: 4096,
    },
  });

  const rawAnswer = response.text || '';

  // 4. Parse citations and map to chunks
  const { answer, citedIndices } = parseCitations(rawAnswer);

  // 5. Build grounding data (프론트엔드 호환)
  const groundingChunks: GroundingChunk[] = citedIndices.map(idx => ({
    retrievedContext: {
      text: chunks[idx]?.content || '',
      paper_id: chunks[idx]?.paperId || '',
    },
  }));

  return {
    answer,
    groundingChunks,
    groundingSupports: [],
  };
}

function buildContext(chunks: SearchResult[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (Paper ID: ${c.paperId})\n${c.content}`)
    .join('\n\n---\n\n');
}

function buildPrompt(query: string, context: string): string {
  return `Based on the following research paper excerpts, answer the question.
Use [CITE:N] markers to cite specific sources (e.g., [CITE:1], [CITE:2]).

Context:
${context}

Question: ${query}

Important: Always cite your sources using the [CITE:N] format.`;
}

function parseCitations(text: string): {
  answer: string;
  citedIndices: number[];
} {
  const citedIndices: number[] = [];
  const citeRegex = /\[CITE:(\d+)\]/g;

  let match;
  while ((match = citeRegex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1; // 1-indexed to 0-indexed
    if (!citedIndices.includes(idx)) {
      citedIndices.push(idx);
    }
  }

  // [CITE:N] 마커 제거 또는 변환 (프론트엔드에서 처리 가능)
  const answer = text;

  return { answer, citedIndices };
}

function formatHistory(
  messages: Message[]
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.slice(-10).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}
```

### 6.6 Chunks Database Operations

```typescript
// src/lib/db/chunks.ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';

type ChunkInsert = {
  paperId: string;
  collectionId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding: number[];
};

export async function insertChunks(chunks: ChunkInsert[]): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const records = chunks.map(c => ({
    paper_id: c.paperId,
    collection_id: c.collectionId,
    content: c.content,
    chunk_index: c.chunkIndex,
    token_count: c.tokenCount,
    embedding: c.embedding,
  }));

  const { error } = await supabase
    .from('paper_chunks')
    .upsert(records, { onConflict: 'paper_id,collection_id,chunk_index' });

  if (error) {
    throw new Error(`Failed to insert chunks: ${error.message}`);
  }
}

export async function deleteChunksForPaper(
  paperId: string,
  collectionId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from('paper_chunks')
    .delete()
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }
}

export async function getChunkCountForCollection(
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  const { count, error } = await supabase
    .from('paper_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to count chunks: ${error.message}`);
  }

  return count || 0;
}
```

---

## 7. Worker Migration

### 7.1 pdfIndexWorker.ts 수정

```typescript
// src/lib/jobs/workers/pdfIndexWorker.ts
import { Job } from 'bullmq';
import { extractTextFromPdf } from '@/lib/pdf/extractor';
import { chunkText } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';
import { insertChunks } from '@/lib/db/chunks';
import { updatePaperVectorStatus } from '@/lib/db/papers';
import { downloadPdfFromStorage } from '@/lib/storage';

interface PdfIndexJobData {
  collectionId: string;
  paperId: string;
  storagePath: string;
}

export async function processPdfIndexJob(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId, storagePath } = job.data;

  try {
    // 1. Download PDF from Supabase Storage
    await job.updateProgress(10);
    const pdfBuffer = await downloadPdfFromStorage(storagePath);

    // 2. Extract text
    await job.updateProgress(20);
    const { text, numPages } = await extractTextFromPdf(pdfBuffer);

    if (!text || text.length < 100) {
      throw new Error('PDF text extraction failed or content too short');
    }

    // 3. Chunk text
    await job.updateProgress(40);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('No chunks generated from PDF');
    }

    // 4. Generate embeddings (batched)
    await job.updateProgress(60);
    const embeddings = await generateDocumentEmbeddings(
      chunks.map(c => c.content)
    );

    // 5. Insert into pgvector
    await job.updateProgress(80);
    await insertChunks(
      chunks.map((chunk, i) => ({
        paperId,
        collectionId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i],
      }))
    );

    // 6. Update paper status
    await job.updateProgress(100);
    await updatePaperVectorStatus(paperId, collectionId, 'completed');

    return {
      success: true,
      chunksCreated: chunks.length,
      pagesProcessed: numPages,
    };
  } catch (error) {
    // 실패 시 상태 업데이트
    await updatePaperVectorStatus(paperId, collectionId, 'failed');
    throw error;
  }
}
```

---

## 8. 구현 순서

### Phase 1: Database Setup (1-2일)

1. pgvector migration 파일 작성
2. `npx supabase migration new add_pgvector_custom_rag`
3. `npx supabase db reset` (로컬 적용)
4. 타입 재생성: `npx supabase gen types typescript --local > src/types/database.types.ts`
5. Supabase Studio에서 테스트 쿼리 실행

### Phase 2: Core Library (2-3일)

6. `src/lib/pdf/extractor.ts` 구현
7. `src/lib/rag/chunker.ts` 구현
8. `src/lib/rag/embeddings.ts` 구현
9. `src/lib/db/chunks.ts` 구현
10. `src/lib/rag/search.ts` 구현
11. 단위 테스트 작성

### Phase 3: RAG Query (2-3일)

12. `src/lib/rag/index.ts` 구현
13. 단일 PDF로 수동 테스트
14. `src/lib/gemini/chat.ts` 수정
15. `src/lib/gemini/query-with-transform.ts` 수정

### Phase 4: Worker Integration (2일)

16. `pdfIndexWorker.ts` 수정
17. 워커 테스트
18. E2E 테스트 (collection 생성 → PDF 추가 → chat)

### Phase 5: Cleanup (1일)

19. Gemini File Search 관련 코드 제거
20. `file_search_store_id` 컬럼 제거 migration
21. 문서 업데이트

---

## 9. 테스트 계획

### 9.1 단위 테스트

```typescript
// PDF Extractor
- [ ] 정상 PDF 텍스트 추출
- [ ] 빈 PDF 처리
- [ ] 손상된 PDF 에러 처리

// Chunker
- [ ] 정상 텍스트 청킹
- [ ] 짧은 텍스트 처리 (minChars 미만)
- [ ] 문장 경계 존중 확인
- [ ] 오버랩 확인

// Embeddings
- [ ] 단일 임베딩 생성
- [ ] 배치 임베딩 생성
- [ ] 768 차원 확인

// Search
- [ ] 벡터 검색 결과
- [ ] 키워드 검색 결과
- [ ] 하이브리드 점수 계산
```

### 9.2 통합 테스트

```typescript
- [ ] PDF → 청킹 → 임베딩 → 저장 파이프라인
- [ ] 검색 → LLM → 응답 파이프라인
- [ ] Citation 매핑 정확성
```

### 9.3 E2E 테스트

```typescript
- [ ] 새 컬렉션 생성
- [ ] 논문 추가 (auto PDF download)
- [ ] 인덱싱 완료 대기
- [ ] 채팅 질문
- [ ] Citation 포함 응답 확인
```

---

## 10. 성능 최적화

### 10.1 임베딩 배치 처리

- Gemini API는 최대 100개 텍스트 배치 지원
- 논문당 평균 50-100개 청크 예상
- 대부분 1-2회 API 호출로 완료

### 10.2 HNSW 인덱스 튜닝

```sql
-- 쿼리 시 ef_search 조정 (recall vs speed)
SET hnsw.ef_search = 100;  -- 기본값

-- 더 높은 recall이 필요한 경우
SET hnsw.ef_search = 200;
```

### 10.3 연결 풀링

```typescript
// 벡터 쿼리용 별도 연결 설정
const poolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
};
```

---

## 11. 비용 분석

### 11.1 Gemini Embedding 비용

| Item               | Cost                 |
| ------------------ | -------------------- |
| text-embedding-004 | $0.00001 / 1K tokens |
| 논문당 평균 토큰   | ~20,000 tokens       |
| 논문당 임베딩 비용 | ~$0.0002             |
| 100개 논문         | ~$0.02               |

### 11.2 pgvector 스토리지

| Item             | Size           |
| ---------------- | -------------- |
| 768-dim vector   | ~3KB per chunk |
| 논문당 평균 청크 | 50-100개       |
| 논문당 벡터 용량 | ~150-300KB     |
| 100개 논문       | ~15-30MB       |

→ Supabase Free tier (500MB) 내에서 충분히 운영 가능

---

## 12. 위험 요소 및 대응

| Risk             | Impact | Mitigation                                  |
| ---------------- | ------ | ------------------------------------------- |
| PDF 추출 실패    | Medium | `vector_status: 'failed'` 표시, 재시도 버튼 |
| 임베딩 API 장애  | High   | 지수 백오프 재시도, 워커 큐 유지            |
| HNSW 메모리 부족 | Low    | IVFFlat으로 폴백 가능                       |
| 검색 품질 저하   | Medium | 가중치 조정, 청크 크기 튜닝                 |
| Citation 부정확  | Medium | 모든 citation 검증, 없으면 제거             |

---

## 13. 성공 기준

- [ ] PDF 인덱싱 성공률 > 90%
- [ ] 쿼리 응답 시간 < 3초 (P95)
- [ ] Citation 정확도 > 95% (실제 존재하는 논문 참조)
- [ ] 기존 프론트엔드 완전 호환
- [ ] Gemini File Search 코드 완전 제거

---

## 14. 참고 자료

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Supabase Vector](https://supabase.com/docs/guides/ai/vector-columns)
- [Gemini Embedding API](https://ai.google.dev/gemini-api/docs/embeddings)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [RRF (Reciprocal Rank Fusion)](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
