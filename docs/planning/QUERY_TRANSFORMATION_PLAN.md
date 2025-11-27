# Query Transformation for RAG Chat

## Overview

Implement query rewriting and sub-query decomposition to improve RAG retrieval quality. Based on techniques from [RAG_TECHNIQUES](https://github.com/NirDiamant/RAG_TECHNIQUES/blob/main/all_rag_techniques/query_transformations.ipynb).

### Pipeline Flow

```
User Message
    ↓
[Step 1] Query Rewrite + Decomposition (single LLM call) ~1.5s
    ↓
[Step 2] 5 Parallel RAG Queries (Promise.all) ~3-5s
    ↓
[Step 3] Response Synthesis (single LLM call) ~1.5s
    ↓
Final Response (only this is shown to user)
```

**Total latency**: ~6-8 seconds (vs ~3-5s baseline)

### User Requirements

- Apply to every message
- Show final synthesis only
- Run 5 sub-queries in parallel
- Keep all grounding chunks (no deduplication)
- No caching for now

---

## Implementation Plan

### Phase 1: Create Query Transform Module

**New file**: `/src/lib/gemini/query-transform.ts`

```typescript
interface QueryTransformResult {
  rewrittenQuery: string;
  subQueries: string[]; // exactly 5
  reasoning?: string;
}

export async function transformQuery(
  userQuestion: string,
  conversationHistory: ConversationMessage[]
): Promise<QueryTransformResult>;
```

**Key decisions:**

- Combine rewrite + decomposition in single LLM call (saves ~1.5s latency)
- Use Gemini 2.5 Flash with low temperature (0.2)
- Output JSON format, parse with existing pattern from `keyword-extraction.ts`

**Prompt design** - Generate 5 sub-queries covering:

1. Core concepts/definitions
2. Methodology/approaches
3. Results/findings
4. Comparisons/alternatives
5. Applications/implications

---

### Phase 2: Create Parallel RAG Execution

**New file**: `/src/lib/gemini/parallel-rag.ts`

```typescript
interface SubQueryResult {
  subQuery: string;
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
  success: boolean;
}

export async function executeParallelQueries(
  fileSearchStoreId: string,
  subQueries: string[],
  conversationHistory: ConversationMessage[]
): Promise<SubQueryResult[]>;
```

**Key decisions:**

- Use `Promise.allSettled()` for resilient parallel execution
- Create simplified variant of `queryWithRetry()` for sub-queries (single attempt)
- Require minimum 2 successful sub-queries to proceed
- Fallback to original `queryWithFileSearch()` if <2 succeed

---

### Phase 3: Create Response Synthesis

**New file**: `/src/lib/gemini/synthesis.ts`

```typescript
interface SynthesisResult {
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
}

export async function synthesizeResponses(
  originalQuestion: string,
  subQueryResults: SubQueryResult[]
): Promise<SynthesisResult>;
```

**Key decisions:**

- Use regular Gemini call (no File Search) for synthesis
- Pass all sub-query answers as context
- Merge all grounding chunks from sub-queries (keep all, no dedup)
- Adjust `groundingChunkIndices` with offset when merging

**Chunk merging logic:**

```typescript
function mergeGroundingData(results: SubQueryResult[]) {
  const allChunks: GroundingChunk[] = [];
  const allSupports: GroundingSupport[] = [];
  let chunkOffset = 0;

  for (const result of results) {
    if (!result.success) continue;
    allChunks.push(...result.groundingChunks);

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

---

### Phase 4: Create Unified Entry Point

**New file**: `/src/lib/gemini/query-with-transform.ts`

```typescript
export async function queryWithTransform(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[]
): Promise<ChatResponse> {
  try {
    // Step 1: Transform
    const { subQueries } = await transformQuery(
      userQuestion,
      conversationHistory
    );

    // Step 2: Parallel RAG
    const results = await executeParallelQueries(
      fileSearchStoreId,
      subQueries,
      conversationHistory
    );
    const successful = results.filter(r => r.success);

    if (successful.length < 2) {
      // Fallback
      return queryWithFileSearch(
        fileSearchStoreId,
        userQuestion,
        conversationHistory
      );
    }

    // Step 3: Synthesize
    return synthesizeResponses(userQuestion, successful);
  } catch (error) {
    // Fallback to original
    return queryWithFileSearch(
      fileSearchStoreId,
      userQuestion,
      conversationHistory
    );
  }
}
```

---

### Phase 5: Integrate into API Route

**Modify**: `/src/app/api/conversations/[id]/messages/route.ts`

**Changes (minimal):**

1. Add import: `import { queryWithTransform } from '@/lib/gemini/query-with-transform';`
2. Replace function call at ~line 220:

   ```typescript
   // Before
   aiResponse = await queryWithFileSearch(...)

   // After
   aiResponse = await queryWithTransform(...)
   ```

**No other changes needed** - response format (`ChatResponse`) stays the same, so UI works unchanged.

---

## Prompts

### Transform + Decomposition Prompt

```typescript
export const QUERY_TRANSFORM_PROMPT = `You are an expert at reformulating questions for academic paper search.

Given a user's question and conversation context, create:
1. A rewritten query optimized for semantic search in academic papers
2. Five specific sub-queries that explore different aspects

## Sub-query Categories
Generate exactly 5 sub-queries covering:
1. **Definition/Background**: Core concepts and foundations
2. **Methodology**: Technical approaches, algorithms, methods
3. **Results/Findings**: Key discoveries, performance, outcomes
4. **Comparison**: Alternative approaches, trade-offs, limitations
5. **Applications**: Use cases, implementations, future directions

## Output Format (JSON only)
{
  "rewrittenQuery": "semantically rich version of the question",
  "subQueries": [
    "Sub-query about definitions and background",
    "Sub-query about methodology and approaches",
    "Sub-query about results and findings",
    "Sub-query about comparisons and alternatives",
    "Sub-query about applications and implications"
  ],
  "reasoning": "Brief explanation of transformation"
}`;
```

### Synthesis Prompt

```typescript
export const SYNTHESIS_PROMPT = `You are CiteBite, synthesizing research information into a coherent answer.

You will receive answers from 5 sub-queries about the user's question. Your task:
1. Integrate all relevant information without redundancy
2. Structure logically (overview -> details -> implications)
3. Preserve citation-worthy content
4. Be comprehensive but concise

Do NOT add information beyond what was found in the sub-query answers.`;
```

---

## Error Handling

| Scenario               | Action                                    |
| ---------------------- | ----------------------------------------- |
| Transform LLM fails    | Fallback to `queryWithFileSearch()`       |
| <2 sub-queries succeed | Fallback to `queryWithFileSearch()`       |
| Synthesis fails        | Return best sub-query answer directly     |
| All steps fail         | Original error handling from current code |

---

## Files Summary

### New Files (4)

| File                                      | Purpose                         |
| ----------------------------------------- | ------------------------------- |
| `/src/lib/gemini/query-transform.ts`      | Query rewriting + decomposition |
| `/src/lib/gemini/parallel-rag.ts`         | Parallel sub-query execution    |
| `/src/lib/gemini/synthesis.ts`            | Response aggregation            |
| `/src/lib/gemini/query-with-transform.ts` | Unified entry point             |

### Modified Files (2)

| File                                                | Change                                    |
| --------------------------------------------------- | ----------------------------------------- |
| `/src/app/api/conversations/[id]/messages/route.ts` | Replace function call (1 import + 1 line) |
| `/src/lib/gemini/index.ts`                          | Add exports                               |

### Critical Files to Read Before Implementation

1. `/src/lib/gemini/chat.ts` - Pattern for Gemini File Search calls
2. `/src/lib/gemini/keyword-extraction.ts` - JSON parsing pattern from LLM
3. `/src/lib/gemini/prompts.ts` - Prompt structure patterns
4. `/src/lib/db/messages.ts` - GroundingChunk/GroundingSupport types
5. `/src/app/api/conversations/[id]/messages/route.ts` - Integration point

---

## Implementation Order

1. Create `query-transform.ts` with transform prompt and JSON parsing
2. Create `parallel-rag.ts` with Promise.allSettled execution
3. Create `synthesis.ts` with chunk merging and synthesis prompt
4. Create `query-with-transform.ts` as unified entry point
5. Update API route to use new function
6. Test end-to-end flow

---

## Performance Notes

| Metric           | Current | With Transform                        |
| ---------------- | ------- | ------------------------------------- |
| Gemini API Calls | 1       | 7 (1 transform + 5 RAG + 1 synthesis) |
| Latency          | ~3-5s   | ~6-8s                                 |
| Token Usage      | Low     | ~3-4x higher                          |

**Future optimizations** (not in scope):

- Query caching for repeated questions
- Reduce to 3 sub-queries for simpler questions
- Skip transform for follow-up questions
