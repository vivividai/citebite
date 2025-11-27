# Query Transformation Pipeline

## Overview

Query Transformation은 RAG 검색 품질을 향상시키기 위해 사용자 질문을 재작성하고 여러 관점의 sub-query로 분해하는 파이프라인입니다.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Message                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [Step 1] Query Transform (query-transform.ts)                      │
│  ─────────────────────────────────────────────────────────────────  │
│  • Input: User question + Conversation history                      │
│  • Process: Single LLM call (Gemini 2.5 Flash, temp=0.2)           │
│  • Output: Rewritten query + 5 sub-queries                         │
│  • Latency: ~1-2 seconds                                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [Step 2] Parallel RAG Execution (parallel-rag.ts)                  │
│  ─────────────────────────────────────────────────────────────────  │
│  • Input: 5 sub-queries + File Search Store ID                     │
│  • Process: Promise.allSettled() - 5 parallel Gemini calls         │
│  • Each call uses File Search tool for RAG                         │
│  • Output: 5 SubQueryResults (answer + grounding data)             │
│  • Latency: ~3-5 seconds (parallel, so limited by slowest)         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [Step 3] Response Synthesis (synthesis.ts)                         │
│  ─────────────────────────────────────────────────────────────────  │
│  • Input: Original question + Successful sub-query results         │
│  • Process: Single LLM call (no File Search)                       │
│  • Merges all grounding chunks with index offset adjustment        │
│  • Output: Synthesized answer + merged grounding data              │
│  • Latency: ~1-2 seconds                                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Final Response to User                         │
│  ─────────────────────────────────────────────────────────────────  │
│  • ChatResponse { answer, groundingChunks, groundingSupports }     │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/lib/gemini/
├── query-transform.ts      # Step 1: Query decomposition
├── parallel-rag.ts         # Step 2: Parallel sub-query execution
├── synthesis.ts            # Step 3: Response aggregation
├── query-with-transform.ts # Entry point (orchestrator)
├── chat.ts                 # Original single-query function (fallback)
└── index.ts                # Exports
```

## Step 1: Query Transform

### Purpose

사용자의 단일 질문을 5개의 다양한 관점으로 분해하여 검색 커버리지를 높입니다.

### Sub-query Categories

| #   | Category              | Description             | Example                                                    |
| --- | --------------------- | ----------------------- | ---------------------------------------------------------- |
| 1   | Definition/Background | 핵심 개념과 기초        | "What are the core concepts of transformers?"              |
| 2   | Methodology           | 기술적 접근법, 알고리즘 | "What methods are used in transformer architectures?"      |
| 3   | Results/Findings      | 주요 발견, 성능         | "What are the key findings about transformer performance?" |
| 4   | Comparison            | 대안, 트레이드오프      | "How do transformers compare to RNNs?"                     |
| 5   | Applications          | 사용 사례, 미래 방향    | "What are the applications of transformers?"               |

### Interface

```typescript
interface QueryTransformResult {
  rewrittenQuery: string; // 의미적으로 풍부한 재작성 쿼리
  subQueries: string[]; // 정확히 5개
  reasoning?: string; // 변환 이유 (디버깅용)
}
```

## Step 2: Parallel RAG Execution

### Purpose

5개의 sub-query를 병렬로 실행하여 latency를 최소화합니다.

### Execution Strategy

```typescript
// Promise.allSettled 사용 - 일부 실패해도 나머지 결과 활용
const settled = await Promise.allSettled(
  subQueries.map(q => executeSingleQuery(storeId, q, history))
);
```

### SubQueryResult Interface

```typescript
interface SubQueryResult {
  subQuery: string;
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
  success: boolean;
  error?: string;
}
```

### Why No Retry for Sub-queries

- 병렬 실행 시 retry는 latency를 급격히 증가시킴
- 5개 중 2개 이상 성공하면 synthesis 진행 가능
- 실패한 sub-query는 단순히 건너뜀

## Step 3: Response Synthesis

### Purpose

여러 sub-query 답변을 하나의 coherent한 응답으로 통합합니다.

### Grounding Data Merge Logic

```typescript
function mergeGroundingData(results: SubQueryResult[]) {
  const allChunks: GroundingChunk[] = [];
  const allSupports: GroundingSupport[] = [];
  let chunkOffset = 0;

  for (const result of results) {
    if (!result.success) continue;

    // 모든 chunk 추가
    allChunks.push(...result.groundingChunks);

    // support의 chunk index를 offset 적용하여 조정
    for (const support of result.groundingSupports) {
      allSupports.push({
        segment: support.segment,
        groundingChunkIndices: support.groundingChunkIndices.map(
          idx => idx + chunkOffset
        ),
      });
    }

    chunkOffset += result.groundingChunks.length;
  }

  return { allChunks, allSupports };
}
```

### Why Merge All Chunks (No Deduplication)

- 같은 chunk가 여러 sub-query에서 발견되면 그만큼 중요한 정보
- Deduplication은 citation mapping을 복잡하게 만듦
- UI에서 필요시 중복 표시 줄일 수 있음

## Fallback Strategy

파이프라인의 어느 단계에서든 실패하면 기존 `queryWithFileSearch()`로 fallback합니다.

| Scenario               | Action                                               |
| ---------------------- | ---------------------------------------------------- |
| Transform LLM fails    | Fallback to `queryWithFileSearch()`                  |
| <2 sub-queries succeed | Fallback to `queryWithFileSearch()`                  |
| Synthesis fails        | Return best sub-query answer directly                |
| All steps fail         | Original error handling from `queryWithFileSearch()` |

## Performance Characteristics

| Metric             | Standard Query     | With Transform |
| ------------------ | ------------------ | -------------- |
| Gemini API Calls   | 1                  | 7 (1 + 5 + 1)  |
| Latency            | ~3-5s              | ~6-10s         |
| Token Usage        | Low                | ~3-4x higher   |
| Retrieval Coverage | Single perspective | 5 perspectives |

## Logging Format

터미널에서 다음과 같은 로그를 확인할 수 있습니다:

```
[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] Starting pipeline for: "transformer attention 메커니즘에 대해 설명해줘"
[QueryWithTransform] ──────────────────────────────────────────────────

[QueryTransform] Step 1: Transforming query...
[QueryTransform] Input: "transformer attention 메커니즘에 대해 설명해줘"
[QueryTransform] Generated 5 sub-queries:
  [1] What are the core concepts of attention mechanisms in transformers?
  [2] How do attention mechanisms work in transformer architectures?
  [3] What are the key findings about attention mechanism performance?
  [4] How do attention mechanisms compare to other approaches?
  [5] What are the applications of attention mechanisms?
[QueryTransform] Step 1 completed in 1,234ms

[ParallelRAG] Step 2: Executing 5 sub-queries in parallel...
[ParallelRAG] ├─ [1/5] Starting: "What are the core concepts..."
[ParallelRAG] ├─ [2/5] Starting: "How do attention mechanisms..."
[ParallelRAG] ├─ [3/5] Starting: "What are the key findings..."
[ParallelRAG] ├─ [4/5] Starting: "How do attention mechanisms compare..."
[ParallelRAG] ├─ [5/5] Starting: "What are the applications..."
[ParallelRAG] ├─ [1/5] ✓ Completed (3 chunks, 2 supports)
[ParallelRAG] ├─ [3/5] ✓ Completed (5 chunks, 4 supports)
[ParallelRAG] ├─ [2/5] ✓ Completed (4 chunks, 3 supports)
[ParallelRAG] ├─ [5/5] ✓ Completed (2 chunks, 1 support)
[ParallelRAG] ├─ [4/5] ✓ Completed (6 chunks, 5 supports)
[ParallelRAG] Step 2 completed in 4,567ms (5/5 successful)

[Synthesis] Step 3: Synthesizing responses...
[Synthesis] Input: 5 successful sub-query answers
[Synthesis] Merged grounding: 20 chunks, 15 supports
[Synthesis] Step 3 completed in 1,890ms

[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] Pipeline completed successfully
[QueryWithTransform] Total time: 7,691ms
[QueryWithTransform] Final: 20 chunks, 15 supports
[QueryWithTransform] ══════════════════════════════════════════════════
```

## API Usage

### Entry Point

```typescript
import { queryWithTransform } from '@/lib/gemini';

const response = await queryWithTransform(
  fileSearchStoreId,
  userQuestion,
  conversationHistory
);

// Response type is same as queryWithFileSearch
// { answer: string, groundingChunks: [], groundingSupports: [] }
```

### Integration Point

`/src/app/api/conversations/[id]/messages/route.ts`:

```typescript
// Line ~220
aiResponse = await queryWithTransform(
  collection.file_search_store_id,
  userMessage,
  formattedHistory
);
```

## Future Optimizations (Not Implemented)

1. **Query Caching**: 반복 질문에 대한 캐싱
2. **Adaptive Sub-queries**: 간단한 질문은 3개로 줄임
3. **Skip Transform for Follow-ups**: 후속 질문은 transform 건너뜀
4. **Streaming**: 각 단계 완료 시 부분 결과 스트리밍
