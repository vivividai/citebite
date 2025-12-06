# Collection Creation Flow 리팩토링 계획

> 작성일: 2025-12-02
> 상태: 계획 완료, 구현 대기

## 목차

1. [분석 배경](#1-분석-배경)
2. [현재 Collection 생성 플로우](#2-현재-collection-생성-플로우)
3. [발견된 문제점](#3-발견된-문제점)
4. [리팩토링 계획](#4-리팩토링-계획)
5. [구현 세부사항](#5-구현-세부사항)
6. [테스트 전략](#6-테스트-전략)
7. [영향 범위](#7-영향-범위)

---

## 1. 분석 배경

Semantic Scholar API를 사용한 Collection 생성 플로우를 분석하여:

- Dead code 및 미사용 코드 식별
- 구조적 개선이 필요한 부분 파악
- 코드 가독성 및 유지보수성 향상 방안 수립

---

## 2. 현재 Collection 생성 플로우

### 2.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    COLLECTION CREATION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. USER REQUEST
   POST /api/collections
   {
     name: "Transformers Research",
     keywords: "transformer attention",
     useAiAssistant: true,
     naturalLanguageQuery: "Self-attention mechanisms in deep learning",
     filters: { yearFrom: 2020, yearTo: 2024 }
   }

2. VALIDATION (createCollectionSchema)
   ✓ Zod schema validation
   ✓ Requires keywords OR naturalLanguageQuery

3. AUTHENTICATION
   ✓ Supabase auth.getUser()

4. QUERY EXPANSION (if needed)
   Original: "transformer attention"
   ↓ expandQueryForReranking()
   Expanded: "Self-attention mechanisms in transformer neural networks..."

5. PAPER SEARCH PATH A: New Search with Re-ranking
   ↓ searchWithReranking({
       userQuery: expandedQuery,
       searchKeywords: keywords,
       initialLimit: 10000,
       finalLimit: 100
     })

   5.1. Parallel execution:
        ├─ client.searchAllPapers() → fetch up to 10,000 papers
        └─ generateQueryEmbedding() → 768-d SPECTER embedding (cached)

   5.2. Fetch embeddings in parallel:
        └─ client.getPapersBatchParallel() with includeEmbedding: true

   5.3. Cosine similarity re-ranking:
        └─ rerankBySimilarity() → top 100 papers by similarity

   PAPER SEARCH PATH B: User-Selected Papers
   ↓ client.getPapersBatchParallel(selectedPaperIds)

6. DATABASE OPERATIONS
   6.1. createCollection() → collections table
   6.2. upsertPapers() → papers table (with vector_status='pending')
   6.3. linkPapersToCollection() → collection_papers junction table

7. BACKGROUND JOB QUEUING (for Open Access papers only)
   for each paper with openAccessPdf.url:
     └─ queuePdfDownload({ collectionId, paperId, pdfUrl })
        → Added to 'pdf-download' queue in Redis

8. RESPONSE
   {
     success: true,
     data: {
       collection: { id, name, searchQuery, filters, createdAt },
       stats: { totalPapers, openAccessPapers, queuedDownloads, ... }
     }
   }
```

### 2.2 Background Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              BACKGROUND PDF PROCESSING (Workers)                 │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: PDF DOWNLOAD (pdfDownloadWorker)
   Job: { collectionId, paperId, pdfUrl }

   ├─ downloadPdfFromUrl(pdfUrl)
   │  ├─ axios GET with browser headers
   │  ├─ 30s timeout, 100MB max
   │  └─ Validate content-type
   │
   ├─ uploadPdf(collectionId, paperId, buffer)
   │  └─ Supabase Storage 'pdfs' bucket
   │
   ├─ updatePaperStatus(paperId, 'processing')
   │
   └─ queuePdfIndexing({ collectionId, paperId, storageKey })

PHASE 2: PDF INDEXING (pdfIndexWorker)
   Job: { collectionId, paperId, storageKey }

   ├─ downloadPdf(collectionId, paperId)
   │
   ├─ extractTextFromPdf(buffer)
   │  └─ pdf-parse library
   │
   ├─ chunkText(text)
   │  └─ Returns Chunk[] { content, chunkIndex, tokenCount }
   │
   ├─ generateDocumentEmbeddings(chunkContents)
   │  └─ Batch to Gemini API
   │
   ├─ insertChunks(chunks with embeddings)
   │  └─ paper_chunks table (pgvector)
   │
   └─ updatePaperStatus(paperId, 'completed')
```

### 2.3 핵심 파일 목록

| 파일 경로                                    | 역할                            |
| -------------------------------------------- | ------------------------------- |
| `src/app/api/collections/route.ts`           | Collection CRUD API             |
| `src/app/api/collections/preview/route.ts`   | Paper preview API               |
| `src/lib/validations/collections.ts`         | Input validation (Zod)          |
| `src/lib/semantic-scholar/client.ts`         | Semantic Scholar API 클라이언트 |
| `src/lib/semantic-scholar/specter-client.ts` | SPECTER embedding API           |
| `src/lib/search/search-with-reranking.ts`    | Re-ranking 파이프라인           |
| `src/lib/gemini/query-expand.ts`             | Query expansion                 |
| `src/lib/utils/vector.ts`                    | Cosine similarity 계산          |
| `src/lib/db/collections.ts`                  | Collection DB 헬퍼              |
| `src/lib/db/papers.ts`                       | Paper DB 헬퍼                   |
| `src/lib/jobs/queues.ts`                     | BullMQ 큐 관리                  |
| `src/lib/jobs/workers/pdfDownloadWorker.ts`  | PDF 다운로드 워커               |
| `src/lib/jobs/workers/pdfIndexWorker.ts`     | PDF 인덱싱 워커                 |

---

## 3. 발견된 문제점

### 3.1 Dead Code

| 파일                                | 상태                 | 문제                                             |
| ----------------------------------- | -------------------- | ------------------------------------------------ |
| `src/lib/gemini/query-transform.ts` | DELETED (git status) | 삭제되었으나 `query-expand.ts`에서 주석으로 참조 |
| `vectorSearch()` export             | UNUSED               | `hybridSearch()`로 대체됨, export만 존재         |

### 3.2 구조적 문제점

#### 3.2.1 RAG 모듈 과대화 (CRITICAL)

**파일:** `src/lib/rag/index.ts` - **516줄**

현재 다음 기능이 한 파일에 혼재:

- Debug trace 로직 (라인 15-53) - 39줄
- 타입 정의 (라인 58-70) - 13줄
- RAG query 로직 (라인 125-274) - 150줄
- Context 빌딩 (라인 294-344) - 51줄
- Citation 파싱 (라인 412-512) - 101줄

**문제점:**

- 단일 책임 원칙(SRP) 위반
- 코드 가독성 저하
- 테스트 작성 어려움
- Debug 로직이 production 코드와 혼재

#### 3.2.2 중복된 Paper 타입 정의

| 파일                                | Interface             | 네이밍 컨벤션         |
| ----------------------------------- | --------------------- | --------------------- |
| `src/lib/pdf/matcher.ts`            | `Paper`               | snake_case (paper_id) |
| `src/lib/semantic-scholar/types.ts` | `Paper`               | camelCase (paperId)   |
| `src/lib/search/types.ts`           | `PaperWithSimilarity` | extends Paper         |

**분석:**

- Semantic Scholar Paper (camelCase): 외부 API 응답용 - 의도된 설계
- Database Paper (snake_case): PostgreSQL 컨벤션 - 의도된 설계
- `src/lib/pdf/matcher.ts`의 `Paper`: 명확한 이름 필요

#### 3.2.3 db/ 모듈 barrel export 부재

`src/lib/db/` 디렉토리에 `index.ts`가 없어 개별 파일에서 직접 import 필요:

```typescript
// 현재
import { createCollection } from '@/lib/db/collections';
import { upsertPapers } from '@/lib/db/papers';
import { insertChunks } from '@/lib/db/chunks';

// 개선 후
import { createCollection, upsertPapers, insertChunks } from '@/lib/db';
```

### 3.3 레거시 필드

**파일:** `src/lib/db/messages.ts`

```typescript
export interface CitedPaper {
  // 현재 사용
  chunks?: GroundingChunk[];
  supports?: GroundingSupport[];

  // Legacy fields (deprecated - Gemini File Search 시절 잔재)
  paperId?: string;
  title?: string;
  relevanceScore?: number;
  citedInContext?: string;
}

export interface GroundingChunk {
  retrievedContext?: {
    text: string;
    paper_id?: string;
    fileSearchStore?: string; // deprecated
  };
}
```

---

## 4. 리팩토링 계획

### Phase 1: Dead Code 제거 (즉시)

| 작업 | 파일                             | 변경 내용                                |
| ---- | -------------------------------- | ---------------------------------------- |
| 1.1  | `src/lib/gemini/query-expand.ts` | 삭제된 query-transform.ts 참조 주석 수정 |
| 1.2  | `src/lib/rag/index.ts`           | vectorSearch export 제거                 |

### Phase 2: 타입 정리 (권장)

| 작업 | 파일                     | 변경 내용                   |
| ---- | ------------------------ | --------------------------- |
| 2.1  | `src/lib/pdf/matcher.ts` | Paper → MatcherPaper rename |
| 2.2  | `src/lib/db/index.ts`    | 신규 생성 (barrel export)   |

### Phase 3: RAG 모듈 분할 (권장)

| 작업 | 파일                      | 변경 내용                        |
| ---- | ------------------------- | -------------------------------- |
| 3.1  | `src/lib/debug/trace.ts`  | 신규 생성 (trace 로직 추출)      |
| 3.2  | `src/lib/rag/types.ts`    | 신규 생성 (타입 정의 추출)       |
| 3.3  | `src/lib/rag/context.ts`  | 신규 생성 (context 빌딩 추출)    |
| 3.4  | `src/lib/rag/citation.ts` | 신규 생성 (citation 파싱 추출)   |
| 3.5  | `src/lib/rag/query.ts`    | 신규 생성 (핵심 query 로직 추출) |
| 3.6  | `src/lib/rag/index.ts`    | Barrel export로 정리             |

### Phase 4: 레거시 정리 (선택적)

| 작업 | 파일                     | 변경 내용                                 |
| ---- | ------------------------ | ----------------------------------------- |
| 4.1  | `src/lib/db/messages.ts` | CitedPaper legacy 필드에 @deprecated 추가 |
| 4.2  | `src/lib/db/messages.ts` | fileSearchStore에 @deprecated 추가        |

---

## 5. 구현 세부사항

### 5.1 Phase 1: Dead Code 제거

#### 5.1.1 query-expand.ts 주석 수정

**파일:** `src/lib/gemini/query-expand.ts`

```diff
 /**
  * Query Expansion for Re-ranking
  *
  * Expands short user queries/keywords into richer descriptions
  * optimized for SPECTER embedding generation.
- *
- * This is separate from query-transform.ts which handles chat queries
- * with conversation context and sub-query decomposition.
+ * Used during collection creation to improve re-ranking accuracy
+ * with SPECTER embeddings.
  */
```

#### 5.1.2 vectorSearch export 제거

**파일:** `src/lib/rag/index.ts` (라인 515)

```diff
- export { hybridSearch, vectorSearch } from './search';
+ export { hybridSearch } from './search';
```

**참고:** `search.ts`에서 `vectorSearch` 함수 자체는 유지 (hybridSearch 내부 fallback으로 사용)

---

### 5.2 Phase 2: 타입 정리

#### 5.2.1 MatcherPaper rename

**파일:** `src/lib/pdf/matcher.ts`

```diff
- interface Paper {
+ interface MatcherPaper {
    paper_id: string;
    title: string;
    doi: string | null;
    external_ids: { DOI?: string } | null;
    vector_status: string;
  }
```

파일 내 모든 `Paper` 참조를 `MatcherPaper`로 변경

#### 5.2.2 db/index.ts 생성

**파일:** `src/lib/db/index.ts` (신규)

```typescript
/**
 * Database utilities barrel export
 *
 * Provides unified access to all database helper functions.
 */

// Collection operations
export * from './collections';

// Conversation operations
export * from './conversations';

// Message operations
export * from './messages';

// Paper operations
export * from './papers';

// Chunk operations (pgvector)
export * from './chunks';
```

---

### 5.3 Phase 3: RAG 모듈 분할

#### 5.3.1 debug/trace.ts 생성

**파일:** `src/lib/debug/trace.ts` (신규)

```typescript
/**
 * API Trace Logging for Debugging
 *
 * Provides trace functionality for debugging RAG API calls.
 * Enable by setting X-Debug-RAG-Trace header to "true".
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const TRACE_DIR = join(process.cwd(), 'docs', 'info');
const TRACE_FILE = join(TRACE_DIR, 'rag-api-trace.md');

let traceEnabled = false;
let traceContent = '';

/**
 * Start API trace session
 * Creates a new trace file with header
 */
export function startAPITrace(): void {
  traceEnabled = true;
  traceContent = '';
  if (!existsSync(TRACE_DIR)) {
    mkdirSync(TRACE_DIR, { recursive: true });
  }
  const header = `# RAG API Trace Log
Generated: ${new Date().toISOString()}

---

`;
  traceContent = header;
  writeFileSync(TRACE_FILE, traceContent);
  console.log('[TRACE] API trace started');
}

/**
 * Append content to current trace
 */
export function appendTrace(section: string, content: unknown): void {
  if (!traceEnabled) return;
  const text =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const entry = `\n## ${section}\n\`\`\`json\n${text}\n\`\`\`\n`;
  traceContent += entry;
  appendFileSync(TRACE_FILE, entry);
}

/**
 * End API trace session
 */
export function endAPITrace(): void {
  if (!traceEnabled) return;
  const footer = `\n---\n\n# End of Trace\n`;
  appendFileSync(TRACE_FILE, footer);
  traceEnabled = false;
  console.log(`[TRACE] API trace saved to ${TRACE_FILE}`);
}

/**
 * Check if trace is currently enabled
 */
export function isTraceEnabled(): boolean {
  return traceEnabled;
}
```

#### 5.3.2 rag/types.ts 생성

**파일:** `src/lib/rag/types.ts` (신규)

```typescript
/**
 * RAG Module Types
 *
 * Type definitions for the RAG (Retrieval-Augmented Generation) system.
 */

import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

/**
 * Conversation message format for RAG context
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * RAG response with answer and citation metadata
 */
export interface RAGResponse {
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
}
```

#### 5.3.3 rag/context.ts 생성

**파일:** `src/lib/rag/context.ts` (신규)

```typescript
/**
 * RAG Context Building
 *
 * Functions for building context from search results for LLM prompts.
 */

import { SearchResult } from './search';

/**
 * Remove paper reference markers from chunk content
 *
 * Academic papers contain inline references like [12], [1,2,3], [1-5], etc.
 * These cause noise when LLM parses citations since our system uses [CITE:N].
 *
 * Patterns removed:
 * - [12] - single reference
 * - [1,2,3] or [1, 2, 3] - comma-separated references
 * - [1-5] - range references
 * - [12][13][14] - consecutive references
 * - [1,2-5,7] - mixed references
 *
 * NOT removed (to preserve readability):
 * - [Figure 1], [Table 2] - figure/table references
 * - [a], [b], [c] - alphabetic references
 * - [2024] - years (4 digits)
 */
export function removeReferences(content: string): string {
  const referencePattern = /\[\d{1,3}(?:[,\s-]+\d{1,3})*\]/g;
  return content.replace(referencePattern, '');
}

/**
 * Build context string from search results
 *
 * Note: Paper metadata (title, authors, year) is NOT included in context.
 * Frontend can look up paper details via paper_id in groundingChunks.
 * This reduces token usage significantly.
 */
export function buildContext(chunks: SearchResult[]): string {
  return chunks
    .map((chunk, idx) => {
      const cleanedContent = removeReferences(chunk.content);
      return `[${idx + 1}]
${cleanedContent}`;
    })
    .join('\n\n');
}

/**
 * Build prompt for LLM
 */
export function buildPrompt(query: string, context: string): string {
  return `Based on the following research paper excerpts, answer the question.
Use [CITE:N] markers to cite specific sources (e.g., [CITE:1], [CITE:2]).

## Context from Papers:

${context}

## Question: ${query}

## Instructions:
- Answer based ONLY on the provided context
- Use [CITE:N] format to cite sources (N is the source number)
- If information isn't in the context, say so
- Be specific and cite multiple sources when applicable`;
}
```

#### 5.3.4 rag/citation.ts 생성

**파일:** `src/lib/rag/citation.ts` (신규)

```typescript
/**
 * RAG Citation Parsing
 *
 * Functions for parsing and processing citations from LLM responses.
 */

import { GroundingSupport } from '@/lib/db/messages';

/**
 * Parse citations from response text
 * Supports both [CITE:N] and [N] formats (Gemini 3 Pro Preview uses [N])
 *
 * Also normalizes the response to use [CITE:N] format for consistent frontend rendering
 */
export function parseCitations(
  text: string,
  maxChunks: number
): { answer: string; citedIndices: number[] } {
  const citedIndices: number[] = [];

  // Match both [CITE:N] and [N] formats
  const citeRegex = /\[CITE:(\d+)\]|\[(\d{1,2})\](?!\d)/g;

  let match;
  while ((match = citeRegex.exec(text)) !== null) {
    const numStr = match[1] || match[2];
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < maxChunks && !citedIndices.includes(idx)) {
      citedIndices.push(idx);
    }
  }

  // Normalize [N] format to [CITE:N] for consistent frontend rendering
  const answer = text.replace(/\[(\d{1,2})\](?!\d)/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < maxChunks) {
      return `[CITE:${num}]`;
    }
    return match;
  });

  return { answer, citedIndices };
}

/**
 * Renumber citations in the answer to match groundingChunks indices
 *
 * After filtering to only cited chunks, we need to renumber the citations
 * so that [CITE:N] correctly refers to groundingChunks[N-1].
 *
 * Example:
 * - Original answer has [CITE:6], [CITE:15], [CITE:18]
 * - citedIndices = [5, 14, 17] (0-based original indices)
 * - indexMap: 5→0, 14→1, 17→2
 * - Renumbered answer: [CITE:1], [CITE:2], [CITE:3]
 */
export function renumberCitations(
  answer: string,
  indexMap: Map<number, number>
): string {
  return answer.replace(/\[CITE:(\d+)\]/g, (match, num) => {
    const originalIdx = parseInt(num, 10) - 1;
    const newIdx = indexMap.get(originalIdx);

    if (newIdx !== undefined) {
      return `[CITE:${newIdx + 1}]`;
    }

    return match;
  });
}

/**
 * Build grounding supports (text segment → chunk mapping)
 *
 * Creates a simplified mapping where each [CITE:N] marker
 * is linked to its corresponding chunk index in the groundingChunks array.
 *
 * NOTE: This function expects the answer to have ALREADY been renumbered
 * by renumberCitations(), so [CITE:N] directly maps to groundingChunks[N-1].
 */
export function buildGroundingSupports(answer: string): GroundingSupport[] {
  const supports: GroundingSupport[] = [];
  const citeRegex = /\[CITE:(\d+)\]/g;

  let match;
  while ((match = citeRegex.exec(answer)) !== null) {
    const groundingIdx = parseInt(match[1], 10) - 1;

    supports.push({
      segment: {
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        text: match[0],
      },
      groundingChunkIndices: [groundingIdx],
    });
  }

  return supports;
}
```

#### 5.3.5 rag/query.ts 생성

**파일:** `src/lib/rag/query.ts` (신규)

```typescript
/**
 * RAG Query Orchestration
 *
 * Main entry point for RAG-based chat with papers.
 * Combines hybrid search with LLM generation and citation tracking.
 */

import { hybridSearch, SearchResult } from './search';
import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';
import { GroundingChunk } from '@/lib/db/messages';
import { GeminiModel } from '@/lib/validations/conversations';
import { startAPITrace, appendTrace, endAPITrace } from '@/lib/debug/trace';
import { ConversationMessage, RAGResponse } from './types';
import { buildContext, buildPrompt } from './context';
import {
  parseCitations,
  renumberCitations,
  buildGroundingSupports,
} from './citation';

/**
 * Custom RAG system prompt optimized for citation
 */
const CUSTOM_RAG_SYSTEM_PROMPT = `You are CiteBite, an AI research assistant specialized in analyzing academic papers.

## YOUR ROLE
You help researchers understand and synthesize findings from their paper collection. You will be provided with relevant excerpts from research papers as context.

## CITATION FORMAT (CRITICAL)
- Use [CITE:N] markers to cite sources (e.g., [CITE:1], [CITE:2])
- Each number corresponds to the source excerpt provided in the context
- You MUST cite sources for every factual claim you make
- If multiple sources support a claim, cite all of them (e.g., [CITE:1][CITE:3])

## RESPONSE STRUCTURE
1. Lead with the most relevant findings
2. Support each claim with [CITE:N] citations
3. When synthesizing across sources, cite all relevant ones
4. Be specific - include numbers, methods, or conclusions that can be traced to sources

## HANDLING LIMITATIONS
- If context doesn't contain relevant information: "Based on the available excerpts, I couldn't find specific information about [topic]."
- If only one source is relevant: Acknowledge this and provide what you can
- If information conflicts: Present both perspectives with their citations

Remember: Every statement must be supported by the provided context using [CITE:N] format.`;

/**
 * Query the RAG system with a user question
 */
export async function queryRAG(
  collectionId: string,
  query: string,
  conversationHistory: ConversationMessage[] = [],
  enableTrace: boolean = false,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<RAGResponse> {
  if (enableTrace) {
    startAPITrace();
    appendTrace('1. RAG Query Input', {
      collectionId,
      query,
      conversationHistoryLength: conversationHistory.length,
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`[RAG] Starting query for collection ${collectionId}`);
  console.log(`[RAG] Query: "${query.substring(0, 100)}..."`);

  // 1. Hybrid search for relevant chunks
  const chunks = await hybridSearch(collectionId, query, { limit: 20 });

  if (enableTrace) {
    appendTrace('2. Hybrid Search Results', {
      totalChunks: chunks.length,
      chunks: chunks.map((c, i) => ({
        index: i,
        paperId: c.paperId,
        combinedScore: c.combinedScore,
        contentPreview: c.content.substring(0, 300) + '...',
      })),
    });
  }

  if (chunks.length === 0) {
    console.log('[RAG] No relevant chunks found');
    if (enableTrace) {
      appendTrace('ERROR', { message: 'No relevant chunks found' });
      endAPITrace();
    }
    return {
      answer:
        "I couldn't find relevant information in the papers for your question. This might mean the topic isn't covered in this collection, or try rephrasing your question.",
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  console.log(`[RAG] Found ${chunks.length} relevant chunks`);

  // 2. Build context from chunks
  const context = buildContext(chunks);

  // 3. Generate response with LLM
  const rawAnswer = await generateResponse(
    query,
    context,
    conversationHistory,
    enableTrace,
    model
  );

  // 4. Parse citations and map to chunks
  const { answer: parsedAnswer, citedIndices } = parseCitations(
    rawAnswer,
    chunks.length
  );

  // 5. Build grounding data for frontend
  const indexMap = new Map<number, number>();
  citedIndices.forEach((originalIdx, groundingIdx) => {
    indexMap.set(originalIdx, groundingIdx);
  });

  // 6. Renumber citations to match groundingChunks indices
  const answer = renumberCitations(parsedAnswer, indexMap);

  const groundingChunks: GroundingChunk[] = citedIndices.map(idx => ({
    retrievedContext: {
      text: chunks[idx]?.content || '',
      paper_id: chunks[idx]?.paperId || '',
    },
  }));

  const groundingSupports = buildGroundingSupports(answer);

  console.log(`[RAG] Generated answer with ${citedIndices.length} citations`);

  if (enableTrace) {
    appendTrace('8. Final Response', {
      answerLength: answer.length,
      groundingChunksCount: groundingChunks.length,
    });
    endAPITrace();
  }

  return {
    answer,
    groundingChunks,
    groundingSupports,
  };
}

/**
 * Generate response using Gemini
 */
async function generateResponse(
  query: string,
  context: string,
  conversationHistory: ConversationMessage[],
  enableTrace: boolean = false,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    const prompt = buildPrompt(query, context);

    const contents = [
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ];

    const requestConfig = {
      model,
      contents,
      config: {
        systemInstruction: CUSTOM_RAG_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 16384,
      },
    };

    if (enableTrace) {
      appendTrace('5. Gemini API Request', {
        model: requestConfig.model,
        temperature: 0.2,
        contentsCount: contents.length,
      });
    }

    const response = await client.models.generateContent(requestConfig);

    return response.text || 'No response generated.';
  });
}
```

#### 5.3.6 rag/index.ts 정리

**파일:** `src/lib/rag/index.ts` (수정)

```typescript
/**
 * Custom RAG Module
 *
 * Main entry point for RAG (Retrieval-Augmented Generation) functionality.
 * Re-exports all public APIs from submodules.
 */

// Query orchestration
export { queryRAG } from './query';

// Types
export type { ConversationMessage, RAGResponse } from './types';

// Search
export { hybridSearch } from './search';
export type { SearchResult, SearchOptions } from './search';

// Chunking
export { chunkText, estimateTokens, getTotalTokenCount } from './chunker';
export type { Chunk, ChunkConfig } from './chunker';

// Embeddings
export {
  generateQueryEmbedding,
  generateDocumentEmbeddings,
  isValidEmbedding,
  EMBEDDING_DIMENSIONS,
} from './embeddings';
```

#### 최종 디렉토리 구조

```
src/lib/rag/
├── index.ts        # Barrel exports (~30줄)
├── types.ts        # ConversationMessage, RAGResponse (~20줄)
├── query.ts        # queryRAG, generateResponse (~150줄)
├── context.ts      # buildContext, buildPrompt, removeReferences (~60줄)
├── citation.ts     # parseCitations, renumberCitations, buildGroundingSupports (~100줄)
├── search.ts       # (기존) hybridSearch, vectorSearch - 변경 없음
├── embeddings.ts   # (기존) 변경 없음
└── chunker.ts      # (기존) 변경 없음

src/lib/debug/
└── trace.ts        # startAPITrace, appendTrace, endAPITrace (~60줄)
```

---

### 5.4 Phase 4: 레거시 정리

#### 5.4.1 CitedPaper deprecated 표시

**파일:** `src/lib/db/messages.ts`

```typescript
export interface CitedPaper {
  // Current grounding data format
  chunks?: GroundingChunk[];
  supports?: GroundingSupport[];

  /**
   * @deprecated Legacy field from Gemini File Search era.
   * Use chunks[].retrievedContext.paper_id instead.
   */
  paperId?: string;

  /**
   * @deprecated Legacy field. Paper title should be fetched via paper_id.
   */
  title?: string;

  /**
   * @deprecated Legacy field. No longer populated.
   */
  relevanceScore?: number;

  /**
   * @deprecated Legacy field. No longer populated.
   */
  citedInContext?: string;
}
```

#### 5.4.2 fileSearchStore deprecated 표시

**파일:** `src/lib/db/messages.ts`

```typescript
export interface GroundingChunk {
  retrievedContext?: {
    text: string;
    /** Paper ID for looking up paper metadata (custom RAG) */
    paper_id?: string;
    /**
     * @deprecated Gemini File Search store reference.
     * No longer used after migration to custom RAG.
     */
    fileSearchStore?: string;
  };
}
```

---

## 6. 테스트 전략

### 6.1 각 Phase별 테스트

| Phase   | 테스트 명령     | 수동 검증  |
| ------- | --------------- | ---------- |
| Phase 1 | `npm run build` | -          |
| Phase 2 | `npm run build` | -          |
| Phase 3 | `npm run build` | E2E 테스트 |
| Phase 4 | `npm run build` | -          |

### 6.2 E2E 테스트 체크리스트 (Phase 3 완료 후)

1. [ ] `npm run build` 성공
2. [ ] Collection 생성 테스트
   - Semantic Scholar 검색으로 새 Collection 생성
   - 선택된 논문으로 Collection 생성
3. [ ] Chat 테스트
   - 새 Conversation 시작
   - 질문 전송 및 응답 확인
   - Citation 링크 동작 확인
4. [ ] Debug Trace 테스트
   - `X-Debug-RAG-Trace: true` 헤더로 요청
   - `docs/info/rag-api-trace.md` 파일 생성 확인

### 6.3 Git 커밋 전략

각 Phase를 별도 커밋으로 분리:

```bash
git commit -m "refactor(phase-1): remove dead code and fix stale comments"
git commit -m "refactor(phase-2): consolidate types and add db barrel export"
git commit -m "refactor(phase-3): extract debug trace and split RAG module"
git commit -m "refactor(phase-4): add @deprecated to legacy interfaces"
```

롤백 시:

```bash
git revert HEAD~N..HEAD  # 마지막 N개 커밋 되돌리기
```

---

## 7. 영향 범위

### 7.1 수정 대상 파일

| 파일                             | 작업                 | Phase |
| -------------------------------- | -------------------- | ----- |
| `src/lib/gemini/query-expand.ts` | 주석 수정            | 1     |
| `src/lib/rag/index.ts`           | export 제거 → 분할   | 1, 3  |
| `src/lib/pdf/matcher.ts`         | Paper → MatcherPaper | 2     |
| `src/lib/db/index.ts`            | 신규 생성            | 2     |
| `src/lib/debug/trace.ts`         | 신규 생성            | 3     |
| `src/lib/rag/types.ts`           | 신규 생성            | 3     |
| `src/lib/rag/context.ts`         | 신규 생성            | 3     |
| `src/lib/rag/citation.ts`        | 신규 생성            | 3     |
| `src/lib/rag/query.ts`           | 신규 생성            | 3     |
| `src/lib/db/messages.ts`         | @deprecated 추가     | 4     |

### 7.2 변경하지 않는 파일 (핵심 플로우)

Collection 생성 및 Chat 플로우의 핵심 파일들은 변경하지 않음:

| 파일                                               | 역할                        |
| -------------------------------------------------- | --------------------------- |
| `src/app/api/collections/route.ts`                 | Collection 생성 API         |
| `src/app/api/collections/preview/route.ts`         | Preview API                 |
| `src/app/api/conversations/[id]/messages/route.ts` | Chat API                    |
| `src/lib/semantic-scholar/client.ts`               | Semantic Scholar 클라이언트 |
| `src/lib/semantic-scholar/specter-client.ts`       | SPECTER 클라이언트          |
| `src/lib/search/search-with-reranking.ts`          | Re-ranking 파이프라인       |
| `src/lib/jobs/queues.ts`                           | BullMQ 큐                   |
| `src/lib/jobs/workers/*`                           | Background workers          |

### 7.3 예상 소요 시간

| Phase    | 예상 시간    | 복잡도 |
| -------- | ------------ | ------ |
| Phase 1  | 15분         | Low    |
| Phase 2  | 30분         | Low    |
| Phase 3  | 2시간        | Medium |
| Phase 4  | 30분         | Low    |
| **총합** | **~3.5시간** |        |

---

## 부록: 모듈 의존성 그래프

```
API Routes
├─ /api/collections/route.ts
│  ├─ createCollectionSchema (validation)
│  ├─ searchWithReranking (search)
│  ├─ expandQueryForReranking (query expansion)
│  ├─ getSemanticScholarClient (API client)
│  ├─ createCollection, linkPapersToCollection (DB)
│  └─ queuePdfDownload (job queueing)
│
└─ /api/conversations/[id]/messages/route.ts
   └─ queryRAG (RAG query orchestration)
      ├─ hybridSearch (search)
      ├─ buildContext (context building)
      ├─ generateResponse (LLM call)
      ├─ parseCitations (citation parsing)
      └─ renumberCitations (citation renumbering)

Search Pipeline (Collection Creation)
├─ searchWithReranking
│  ├─ getSemanticScholarClient().searchAllPapers()
│  ├─ generateQueryEmbedding() (SPECTER API)
│  ├─ getSemanticScholarClient().getPapersBatchParallel()
│  └─ rerankBySimilarity (cosine similarity)
│
└─ expandQueryForReranking
   └─ getGeminiClient() (query expansion)

RAG Pipeline (Chat) - 리팩토링 후
├─ queryRAG (query.ts)
│  ├─ hybridSearch (search.ts)
│  ├─ buildContext (context.ts)
│  ├─ generateResponse (query.ts)
│  ├─ parseCitations (citation.ts)
│  ├─ renumberCitations (citation.ts)
│  └─ buildGroundingSupports (citation.ts)
│
├─ startAPITrace, appendTrace, endAPITrace (debug/trace.ts)
│
└─ ConversationMessage, RAGResponse (types.ts)
```
