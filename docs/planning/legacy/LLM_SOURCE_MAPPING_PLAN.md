# LLM 기반 Source Mapping 구현 계획

## 개요

현재 synthesis 파이프라인에서 `[CITE:N]` marker + `findSentenceStart()` 방식의 문제를 해결하기 위해, **Two-call 방식**으로 LLM 기반 source mapping을 구현합니다.

**문제점:**

- Citations이 응답 초반부에 집중됨
- `findSentenceStart()`가 sentence boundary를 찾지 못하면 startIndex=0 반환
- 실제 source가 해당 텍스트를 정확히 지원하는지 불명확

**해결책:**

1. **Phase 1**: Clean synthesis (citation marker 없이 자연스러운 응답 생성)
2. **Phase 2**: 별도 LLM 호출로 정확한 source mapping 수행 (sub-query의 원본 grounding metadata 활용)

---

## 아키텍처

```
[기존 파이프라인]
Query Transform → Parallel RAG (5 sub-queries) → Synthesis with [CITE:N] → Regex Parse

[새로운 파이프라인]
Query Transform → Parallel RAG (5 sub-queries) → Clean Synthesis → LLM Source Mapping
                                                        ↓                    ↓
                                              (marker 없는 응답)    (sub-query grounding 참조)
```

---

## 구현 단계

### Step 1: 새 파일 생성 - `src/lib/gemini/source-mapping.ts`

```typescript
import { getGeminiClient, withGeminiErrorHandling } from './client';
import { SubQueryResult } from './parallel-rag';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

// ============================================
// Types
// ============================================

interface SourceMappingContext {
  subQueryIndex: number;
  subQuery: string;
  answer: string;
  groundedSegments: Array<{
    text: string;
    sourceIndices: number[]; // Aggregated chunk indices
  }>;
}

interface SourceMappingOutput {
  mappings: Array<{
    synthesizedText: string;
    startOffset: number;
    endOffset: number;
    sourceChunkIndices: number[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  unmappedSegments: Array<{
    text: string;
    startOffset: number;
    endOffset: number;
    reason: string;
  }>;
}

// ============================================
// System Prompt
// ============================================

const SOURCE_MAPPING_SYSTEM_PROMPT = `You are a precise citation mapping assistant. Your task is to identify which parts of a synthesized research response correspond to specific source passages.

## Your Task
Map each substantive claim in the synthesized response to its source(s) by:
1. Finding text that matches or paraphrases the original sub-query answers
2. Preserving the source mappings from the gold-standard reference
3. Marking transitional phrases and pure synthesis as unmapped

## Rules
1. **Be Precise**: Map the EXACT text span, not entire sentences
2. **Preserve Original Mappings**: If text appears in a sub-query answer, use its verified sources
3. **Handle Paraphrasing**: Map paraphrased content to the same sources as the original
4. **Mark Unmapped**: Connectors like "However," "Additionally," are unmapped
5. **No Hallucination**: Only use sources that actually support the claim

## Confidence Levels
- "high": Text directly matches sub-query answer with verified sources
- "medium": Paraphrased but clearly from specific source(s)
- "low": Inferred connection, possibly combining multiple sources

## Output Format
Return valid JSON:
{
  "mappings": [{
    "synthesizedText": "exact text from response",
    "startOffset": 0,
    "endOffset": 50,
    "sourceChunkIndices": [0, 2],
    "confidence": "high"
  }],
  "unmappedSegments": [{
    "text": "However, ",
    "startOffset": 50,
    "endOffset": 59,
    "reason": "transitional phrase"
  }]
}`;

// ============================================
// Main Functions
// ============================================

export async function mapSourcesToSynthesis(
  synthesizedResponse: string,
  contexts: SourceMappingContext[],
  aggregatedChunks: GroundingChunk[]
): Promise<GroundingSupport[]>;

export function buildSourceMappingContexts(
  subQueryResults: SubQueryResult[],
  chunkIndexMap: Map<string, number>
): SourceMappingContext[];

export function aggregateChunksWithMapping(subQueryResults: SubQueryResult[]): {
  chunks: GroundingChunk[];
  chunkIndexMap: Map<string, number>;
};

// Validation
function validateSourceMappings(
  synthesizedResponse: string,
  llmOutput: SourceMappingOutput,
  maxChunkIndex: number
): ValidatedMapping[];

// Fallback
function findDirectTextMatches(
  synthesizedResponse: string,
  subQueryResults: SubQueryResult[],
  chunkIndexMap: Map<string, number>
): GroundingSupport[];
```

### Step 2: `synthesis.ts` 수정

**변경 사항:**

1. 기존 `[CITE:N]` marker 로직 제거 (또는 fallback으로 유지)
2. Clean synthesis prompt 추가
3. Two-phase 로직 구현

```typescript
// 새로운 system prompt (citation marker 없음)
const SYNTHESIS_SYSTEM_PROMPT_CLEAN = `You are CiteBite, an AI research assistant.

## Guidelines
- Synthesize information from multiple research queries into a coherent answer
- Structure: overview → details → implications
- Integrate without redundancy
- Present conflicting perspectives when sources disagree
- Be comprehensive but concise
- Write naturally WITHOUT any citation markers

## Important
Do NOT include [CITE:N], [1], or any citation notation.
Write clean prose - citations will be added automatically.`;

// 수정된 메인 함수
export async function synthesizeResponses(
  originalQuestion: string,
  subQueryResults: SubQueryResult[],
  fileSearchStoreId: string
): Promise<ChatResponse> {
  // Step 1: Aggregate chunks WITH index mapping
  const { chunks, chunkIndexMap } = aggregateChunksWithMapping(
    subQueryResults.filter(r => r.success)
  );

  if (chunks.length === 0) {
    return getBestSubQueryAnswer(subQueryResults);
  }

  // Step 2: Generate clean synthesis (no markers)
  const synthesizedText = await generateCleanSynthesis(
    originalQuestion,
    subQueryResults,
    chunks
  );

  // Step 3: LLM-based source mapping
  const contexts = buildSourceMappingContexts(subQueryResults, chunkIndexMap);
  const groundingSupports = await mapSourcesToSynthesisWithFallback(
    synthesizedText,
    contexts,
    subQueryResults,
    chunks,
    chunkIndexMap
  );

  return {
    answer: synthesizedText,
    groundingChunks: chunks,
    groundingSupports,
  };
}
```

### Step 3: Source Mapping Prompt 구성

```typescript
function buildSourceMappingPrompt(
  synthesizedResponse: string,
  contexts: SourceMappingContext[],
  chunks: GroundingChunk[]
): string {
  // Sub-query별 원본 grounding 정보 (gold standard reference)
  const referenceSection = contexts
    .map((ctx, i) => {
      const groundedText = ctx.groundedSegments
        .map(
          seg =>
            `  - "${seg.text.slice(0, 150)}..." → Sources: [${seg.sourceIndices.join(', ')}]`
        )
        .join('\n');

      return `### Sub-Query ${i + 1}: ${ctx.subQuery}
Answer: "${ctx.answer.slice(0, 300)}..."

Verified Grounding (Gold Standard):
${groundedText || '  (no grounded segments)'}`;
    })
    .join('\n\n');

  // Chunk reference (최대 30개)
  const chunkSection = chunks
    .slice(0, 30)
    .map((chunk, idx) => {
      const preview = chunk.retrievedContext?.text?.slice(0, 200) || '';
      return `[Chunk ${idx}] ${preview}...`;
    })
    .join('\n\n');

  return `## Synthesized Response
"""
${synthesizedResponse}
"""

## Reference: Sub-Query Answers with VERIFIED Source Mappings
${referenceSection}

## Available Source Chunks
${chunkSection}

Map the synthesized response to sources. Return JSON.`;
}
```

### Step 4: Validation & Fallback

```typescript
// Text position 검증 및 보정
function validateSourceMappings(
  synthesizedResponse: string,
  llmOutput: SourceMappingOutput,
  maxChunkIndex: number
): ValidatedMapping[] {
  const validated: ValidatedMapping[] = [];

  for (const mapping of llmOutput.mappings) {
    if (!mapping.sourceChunkIndices?.length) continue;

    // Text가 실제로 존재하는지 확인
    let startIndex = mapping.startOffset;
    let endIndex = mapping.endOffset;
    const claimedText = synthesizedResponse.slice(startIndex, endIndex);

    // 위치가 맞지 않으면 텍스트 검색으로 보정
    if (claimedText !== mapping.synthesizedText) {
      const foundIndex = synthesizedResponse.indexOf(mapping.synthesizedText);
      if (foundIndex !== -1) {
        startIndex = foundIndex;
        endIndex = foundIndex + mapping.synthesizedText.length;
      } else {
        continue; // 찾을 수 없으면 skip
      }
    }

    // Invalid chunk indices 필터링
    const validIndices = mapping.sourceChunkIndices.filter(
      idx => idx >= 0 && idx < maxChunkIndex
    );

    if (validIndices.length > 0) {
      validated.push({
        segment: { startIndex, endIndex, text: mapping.synthesizedText },
        groundingChunkIndices: validIndices,
        confidence: mapping.confidence,
      });
    }
  }

  return validated;
}

// Fallback: 직접 텍스트 매칭
function findDirectTextMatches(
  synthesizedResponse: string,
  subQueryResults: SubQueryResult[],
  chunkIndexMap: Map<string, number>
): GroundingSupport[] {
  const matches: GroundingSupport[] = [];

  for (const result of subQueryResults) {
    if (!result.success) continue;

    for (const support of result.groundingSupports) {
      const text = support.segment.text;
      if (text.length < 30) continue;

      const foundIndex = synthesizedResponse.indexOf(text);
      if (foundIndex !== -1) {
        // Chunk indices 재매핑
        const remappedIndices = support.groundingChunkIndices
          .map(i => {
            const chunk = result.groundingChunks[i];
            if (!chunk?.retrievedContext?.text) return -1;
            const fp = chunk.retrievedContext.text.slice(0, 200).trim();
            return chunkIndexMap.get(fp) ?? -1;
          })
          .filter(i => i >= 0);

        if (remappedIndices.length > 0) {
          matches.push({
            segment: {
              startIndex: foundIndex,
              endIndex: foundIndex + text.length,
              text,
            },
            groundingChunkIndices: remappedIndices,
          });
        }
      }
    }
  }

  return mergeAdjacentMappings(matches);
}
```

---

## 수정할 파일

| 파일                               | 작업                                              |
| ---------------------------------- | ------------------------------------------------- |
| `src/lib/gemini/source-mapping.ts` | **신규 생성** - source mapping 전담 모듈          |
| `src/lib/gemini/synthesis.ts`      | **수정** - two-phase 로직, clean synthesis prompt |
| `src/lib/gemini/index.ts`          | **수정** - export 추가                            |

---

## LLM 설정

- **Clean Synthesis**: `gemini-2.5-flash` (기존 유지)
- **Source Mapping**: `gemini-2.5-flash` (비용 무관, 정확도 우선)
- **Temperature**: 0.1~0.2 (deterministic output)
- **Response format**: JSON mode (`responseMimeType: 'application/json'`)

---

## 예상 결과

**Before:**

- Citations이 응답 초반부에 집중
- Source 버튼 25개가 있지만 대부분 첫 문장에 매핑

**After:**

- 각 claim이 해당 source에 정확히 매핑
- Sub-query의 원본 grounding metadata를 gold standard로 활용
- Hover 시 실제로 관련 있는 source chunk preview 표시
