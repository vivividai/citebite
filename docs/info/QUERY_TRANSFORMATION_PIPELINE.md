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
│  • Latency: ~5-8 seconds                                           │
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
│  • Latency: ~10-30 seconds (parallel, limited by slowest)          │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [Step 3] Response Synthesis WITH File Search (synthesis.ts)        │
│  ─────────────────────────────────────────────────────────────────  │
│  • Input: Original question + Sub-query results + fileSearchStoreId│
│  • Process: Single LLM call WITH File Search tool enabled          │
│  • Generates FRESH grounding metadata for synthesized text         │
│  • Output: Synthesized answer + fresh grounding data               │
│  • Latency: ~10-15 seconds                                         │
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
├── synthesis.ts            # Step 3: Response synthesis WITH File Search
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

## Step 3: Response Synthesis (WITH File Search)

### Purpose

여러 sub-query 답변을 하나의 coherent한 응답으로 통합하고, **합성된 텍스트에 맞는 새로운 grounding metadata를 생성**합니다.

### ⚠️ 중요: Grounding Index 불일치 문제

#### 문제 상황 (기존 방식)

기존에는 sub-query들의 grounding 데이터를 단순히 병합했습니다:

```
Step 2 결과:
  서브쿼리 1 응답: "Memristor arrays face variability issues..."
                   ↑ groundingSupport: startIndex=0, endIndex=45
                   (이 인덱스는 서브쿼리 1 응답 텍스트 기준)

Step 3 결과:
  합성된 응답: "The fabrication of memristor crossbar arrays presents..."
               ↑ 완전히 새로운 텍스트
```

**문제점:**

- `groundingSupports`의 `startIndex/endIndex`는 **원본 서브쿼리 응답 텍스트**의 위치를 가리킴
- 합성 후 텍스트는 **완전히 새로운 텍스트**
- UI에서 `content.slice(startIndex, endIndex)` 호출 시 **잘못된 텍스트 조각**이 하이라이트됨
- 결과: 깨진/중복된 텍스트 조각이 화면에 표시됨

#### 해결 방식 (현재 구현)

Synthesis 단계에서 File Search를 다시 호출하여 **합성된 텍스트에 맞는 새로운 grounding**을 생성:

```typescript
// synthesis.ts - synthesizeResponses 함수
export async function synthesizeResponses(
  originalQuestion: string,
  subQueryResults: SubQueryResult[],
  fileSearchStoreId: string // 새로 추가된 파라미터
): Promise<ChatResponse> {
  // ...

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ],
    config: {
      systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
      temperature: 0.3,
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [`fileSearchStores/${fileSearchStoreId}`],
          },
        },
      ],
    },
  });

  // 합성 응답에서 직접 grounding 추출 (서브쿼리 병합 X)
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const { chunks, supports } = extractGroundingData(groundingMetadata);

  return {
    answer: answerText,
    groundingChunks: chunks, // 합성된 텍스트 기준의 새 grounding
    groundingSupports: supports, // 합성된 텍스트 기준의 올바른 인덱스
  };
}
```

### Synthesis System Prompt

```typescript
const SYNTHESIS_SYSTEM_PROMPT = `You are CiteBite, an AI research assistant synthesizing research information into a coherent answer.

You will receive preliminary information gathered from search queries. However, you MUST NOT simply restate this information.

CRITICAL: You MUST search the papers using File Search to:
1. Verify each claim against the actual paper content
2. Find specific quotes and evidence to support your synthesis
3. Discover additional relevant details not in the preliminary information

Your response will be grounded with citations from the papers. The quality of your answer depends on how well you search and cite the actual papers.

## Guidelines
- Structure: overview → details → implications
- Integrate information without redundancy
- If sources conflict, present both perspectives
- Be comprehensive but concise
- Focus on directly answering the original question`;
```

### Synthesis User Prompt

```typescript
function buildSynthesisPrompt(
  originalQuestion: string,
  subQueryResults: SubQueryResult[]
): string {
  const subQuerySection = subQueryResults
    .filter(r => r.success && r.answer.trim().length > 0)
    .map(
      (r, i) => `### Sub-Query ${i + 1}: ${r.subQuery}
${r.answer}`
    )
    .join('\n\n');

  return `## Original Question
"${originalQuestion}"

## Preliminary Information (from initial searches)
${subQuerySection}

## Your Task
1. SEARCH the papers using File Search to verify and expand on the above information
2. Synthesize findings into a coherent, well-structured answer
3. Ensure your response is grounded in the actual paper content

IMPORTANT: Do not just summarize the preliminary information. Use File Search to find supporting evidence and additional details from the papers.`;
}
```

### extractGroundingData 함수 (parallel-rag.ts에서 export)

```typescript
export function extractGroundingData(groundingMetadata: unknown): {
  chunks: GroundingChunk[];
  supports: GroundingSupport[];
} {
  if (!groundingMetadata) {
    return { chunks: [], supports: [] };
  }

  const metadata = groundingMetadata as Record<string, unknown>;
  const rawChunks =
    (metadata.groundingChunks as unknown[]) ||
    (metadata.grounding_chunks as unknown[]) ||
    [];
  const rawSupports =
    (metadata.groundingSupports as unknown[]) ||
    (metadata.grounding_supports as unknown[]) ||
    [];

  // ... chunk 및 support 파싱 로직 ...

  return { chunks, supports };
}
```

### 현재 알려진 제한사항

Gemini가 프롬프트에 이미 충분한 정보가 있다고 판단하면 File Search를 호출하지 않아 **0 chunks, 0 supports**가 반환될 수 있습니다.

- ✅ 장점: 깨진/중복 텍스트 렌더링 문제 해결
- ❌ 단점: citation 하이라이트가 표시되지 않을 수 있음

## Fallback Strategy

파이프라인의 어느 단계에서든 실패하면 기존 `queryWithFileSearch()`로 fallback합니다.

| Scenario               | Action                                               |
| ---------------------- | ---------------------------------------------------- |
| Transform LLM fails    | Fallback to `queryWithFileSearch()`                  |
| <2 sub-queries succeed | Fallback to `queryWithFileSearch()`                  |
| Synthesis fails        | Return best sub-query answer directly                |
| All steps fail         | Original error handling from `queryWithFileSearch()` |

### getBestSubQueryAnswer (Synthesis 실패 시 Fallback)

```typescript
export function getBestSubQueryAnswer(results: SubQueryResult[]): ChatResponse {
  // grounding chunks가 많고, 답변이 긴 것을 우선 선택
  const sorted = [...results]
    .filter(r => r.success)
    .sort((a, b) => {
      const chunkDiff = b.groundingChunks.length - a.groundingChunks.length;
      if (chunkDiff !== 0) return chunkDiff;
      return b.answer.length - a.answer.length;
    });

  if (sorted.length === 0) {
    return {
      answer: 'I was unable to find relevant information in the papers.',
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  const best = sorted[0];
  return {
    answer: best.answer,
    groundingChunks: best.groundingChunks,
    groundingSupports: best.groundingSupports,
  };
}
```

## Performance Characteristics

| Metric             | Standard Query     | With Transform      |
| ------------------ | ------------------ | ------------------- |
| Gemini API Calls   | 1                  | 7 (1 + 5 + 1)       |
| Latency            | ~3-5s              | ~25-50s             |
| Token Usage        | Low                | ~5-7x higher        |
| Retrieval Coverage | Single perspective | 5 perspectives      |
| Grounding Accuracy | Direct             | Fresh (re-grounded) |

## Logging Format

터미널에서 다음과 같은 로그를 확인할 수 있습니다:

```
[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] 🚀 Query Transformation Pipeline Started
[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] 📝 Question: "What are the key device variability issues in memristor arrays?"
[QueryWithTransform] 📚 Context: 0 previous messages
[QueryWithTransform] 📦 File Search Store: hardware-neural-network-7ec-4i2sdoktqlrw

[QueryTransform] ──────────────────────────────────────────
[QueryTransform] Step 1: Query Decomposition
[QueryTransform] ──────────────────────────────────────────
[QueryTransform] 📝 Original question: "What are the key device variability issues..."
[QueryTransform] 📚 Conversation context: 0 messages
[QueryTransform] 🔄 Calling Gemini to generate sub-queries...
[QueryTransform] ✓ Gemini response received
[QueryTransform] ✓ Transformation complete
[QueryTransform] 📝 Rewritten query: "Comprehensive analysis of device-to-device..."
[QueryTransform] 📋 Generated 5 sub-queries:
[QueryTransform]   [1] Definition: "Physical origins, fundamental mechanisms..."
[QueryTransform]   [2] Methodology: "Experimental characterization techniques..."
[QueryTransform]   [3] Results: "Impact of memristor device variability..."
[QueryTransform]   [4] Comparison: "Comparative analysis of variability..."
[QueryTransform]   [5] Applications: "Variability-aware design principles..."
[QueryTransform] ⏱️ Step 1 completed in 6971ms
[QueryWithTransform] ✓ Step 1 complete: 5 sub-queries in 6971ms

[ParallelRAG] ──────────────────────────────────────────
[ParallelRAG] Step 2: Parallel RAG Execution
[ParallelRAG] ──────────────────────────────────────────
[ParallelRAG] 🚀 Launching 5 parallel queries...
[ParallelRAG] 📦 File Search Store: hardware-neural-network-7ec-4i2sdoktqlrw
[ParallelRAG]   ├─ [1/5] Starting: "Physical origins, fundamental mechanisms..."
[ParallelRAG]   ├─ [2/5] Starting: "Experimental characterization techniques..."
[ParallelRAG]   ├─ [3/5] Starting: "Impact of memristor device variability..."
[ParallelRAG]   ├─ [4/5] Starting: "Comparative analysis of variability..."
[ParallelRAG]   ├─ [5/5] Starting: "Variability-aware design principles..."
[ParallelRAG]   ├─ [3/5] ✓ Completed in 7580ms (5 chunks, 16 supports)
[ParallelRAG]   ├─ [2/5] ✓ Completed in 7758ms (5 chunks, 17 supports)
[ParallelRAG]   ├─ [1/5] ✓ Completed in 9242ms (5 chunks, 25 supports)
[ParallelRAG]   ├─ [5/5] ✓ Completed in 25059ms (20 chunks, 20 supports)
[ParallelRAG]   ├─ [4/5] ✓ Completed in 29873ms (25 chunks, 22 supports)
[ParallelRAG] ──────────────────────────────────────────
[ParallelRAG] ✓ Step 2 completed: 5/5 successful
[ParallelRAG] 📊 Total grounding: 60 chunks, 100 supports
[ParallelRAG] ⏱️ Step 2 completed in 29873ms
[QueryWithTransform] ✓ Step 2 complete: 5/5 queries, 60 chunks in 29874ms

[Synthesis] ──────────────────────────────────────────
[Synthesis] Step 3: Response Synthesis
[Synthesis] ──────────────────────────────────────────
[Synthesis] 📥 Input: 5 successful sub-query answers
[Synthesis]   ├─ [1] 5 chunks, 4560 chars: "Variability in resistive switching..."
[Synthesis]   ├─ [2] 5 chunks, 3766 chars: "Memristor device variability is..."
[Synthesis]   ├─ [3] 5 chunks, 3222 chars: "Memristor device variability significantly..."
[Synthesis]   ├─ [4] 25 chunks, 6417 chars: "## Comparative Analysis..."
[Synthesis]   ├─ [5] 20 chunks, 4164 chars: "Memristor-based neural networks..."
[Synthesis] 📝 Synthesis prompt length: 23545 chars
[Synthesis] 📦 File Search Store: hardware-neural-network-7ec-4i2sdoktqlrw
[Synthesis] 🔄 Calling Gemini for synthesis WITH File Search...
[Synthesis] ✓ Synthesis complete
[Synthesis] 📊 Output: 8189 chars
[Synthesis] 🔗 Fresh grounding: 0 chunks, 0 supports
[Synthesis] ⏱️ Step 3 completed in 11406ms
[QueryWithTransform] ✓ Step 3 complete: synthesis in 11406ms

[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] ✅ Pipeline Completed Successfully
[QueryWithTransform] ══════════════════════════════════════════════════
[QueryWithTransform] 📊 Final: 0 chunks, 0 supports
[QueryWithTransform] ⏱️ Total time: 48251ms
[QueryWithTransform]    ├─ Step 1 (Transform):  6971ms
[QueryWithTransform]    ├─ Step 2 (Parallel):   29874ms
[QueryWithTransform]    └─ Step 3 (Synthesis):  11406ms
[QueryWithTransform] 📝 Answer preview: "Memristor arrays, particularly those used in emerging..."
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

### query-with-transform.ts에서 synthesizeResponses 호출

```typescript
// Step 3: Synthesis - fileSearchStoreId를 전달
response = await synthesizeResponses(
  userQuestion,
  subQueryResults,
  fileSearchStoreId // 새로 추가된 인자
);
```

## Future Optimizations (Not Implemented)

1. **Query Caching**: 반복 질문에 대한 캐싱
2. **Adaptive Sub-queries**: 간단한 질문은 3개로 줄임
3. **Skip Transform for Follow-ups**: 후속 질문은 transform 건너뜀
4. **Streaming**: 각 단계 완료 시 부분 결과 스트리밍
5. **Improved Grounding**: 프롬프트 최적화로 File Search 호출률 향상
