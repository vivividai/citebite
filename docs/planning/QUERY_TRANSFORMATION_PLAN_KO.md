# RAG 채팅을 위한 쿼리 변환 계획

## 개요

RAG 검색 품질 향상을 위해 쿼리 재작성(Query Rewriting)과 하위 쿼리 분해(Sub-query Decomposition)를 구현합니다. [RAG_TECHNIQUES](https://github.com/NirDiamant/RAG_TECHNIQUES/blob/main/all_rag_techniques/query_transformations.ipynb) 문서의 기술을 기반으로 합니다.

### 파이프라인 흐름

```
사용자 메시지
    ↓
[1단계] 쿼리 재작성 + 분해 (단일 LLM 호출) ~1.5초
    ↓
[2단계] 5개 병렬 RAG 쿼리 (Promise.all) ~3-5초
    ↓
[3단계] 응답 종합 (단일 LLM 호출) ~1.5초
    ↓
최종 응답 (사용자에게는 이것만 표시)
```

**총 예상 지연 시간**: ~6-8초 (기존 ~3-5초 대비)

### 요구사항

- 모든 메시지에 적용
- 최종 종합 응답만 표시 (중간 결과 숨김)
- 5개 하위 쿼리를 병렬로 실행
- 모든 grounding chunk 유지 (중복 제거 없음)
- 현재는 캐싱 없음

---

## 구현 계획

### 1단계: 쿼리 변환 모듈 생성

**새 파일**: `/src/lib/gemini/query-transform.ts`

```typescript
interface QueryTransformResult {
  rewrittenQuery: string;
  subQueries: string[]; // 정확히 5개
  reasoning?: string;
}

export async function transformQuery(
  userQuestion: string,
  conversationHistory: ConversationMessage[]
): Promise<QueryTransformResult>;
```

**주요 결정사항:**

- 재작성 + 분해를 단일 LLM 호출로 결합 (~1.5초 지연 시간 절약)
- Gemini 2.5 Flash 사용, 낮은 temperature (0.2)
- JSON 형식 출력, `keyword-extraction.ts`의 기존 패턴으로 파싱

**프롬프트 설계** - 5개 하위 쿼리 생성 범위:

1. 핵심 개념/정의
2. 방법론/접근법
3. 결과/발견
4. 비교/대안
5. 응용/시사점

---

### 2단계: 병렬 RAG 실행 모듈 생성

**새 파일**: `/src/lib/gemini/parallel-rag.ts`

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

**주요 결정사항:**

- 안정적인 병렬 실행을 위해 `Promise.allSettled()` 사용
- 하위 쿼리용 `queryWithRetry()` 단순화 버전 생성 (단일 시도)
- 진행을 위해 최소 2개의 성공한 하위 쿼리 필요
- 2개 미만 성공 시 기존 `queryWithFileSearch()`로 폴백

---

### 3단계: 응답 종합 모듈 생성

**새 파일**: `/src/lib/gemini/synthesis.ts`

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

**주요 결정사항:**

- 종합을 위해 일반 Gemini 호출 사용 (File Search 없음)
- 모든 하위 쿼리 답변을 컨텍스트로 전달
- 모든 grounding chunk 병합 (중복 제거 없이 전체 유지)
- 병합 시 `groundingChunkIndices`에 오프셋 적용

**Chunk 병합 로직:**

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

### 4단계: 통합 진입점 생성

**새 파일**: `/src/lib/gemini/query-with-transform.ts`

```typescript
export async function queryWithTransform(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[]
): Promise<ChatResponse> {
  try {
    // 1단계: 변환
    const { subQueries } = await transformQuery(
      userQuestion,
      conversationHistory
    );

    // 2단계: 병렬 RAG
    const results = await executeParallelQueries(
      fileSearchStoreId,
      subQueries,
      conversationHistory
    );
    const successful = results.filter(r => r.success);

    if (successful.length < 2) {
      // 폴백
      return queryWithFileSearch(
        fileSearchStoreId,
        userQuestion,
        conversationHistory
      );
    }

    // 3단계: 종합
    return synthesizeResponses(userQuestion, successful);
  } catch (error) {
    // 기존 방식으로 폴백
    return queryWithFileSearch(
      fileSearchStoreId,
      userQuestion,
      conversationHistory
    );
  }
}
```

---

### 5단계: API 라우트 통합

**수정 대상**: `/src/app/api/conversations/[id]/messages/route.ts`

**변경사항 (최소한):**

1. import 추가: `import { queryWithTransform } from '@/lib/gemini/query-with-transform';`
2. ~220번째 줄의 함수 호출 교체:

   ```typescript
   // 변경 전
   aiResponse = await queryWithFileSearch(...)

   // 변경 후
   aiResponse = await queryWithTransform(...)
   ```

**추가 변경 불필요** - 응답 형식(`ChatResponse`)이 동일하므로 UI는 변경 없이 동작합니다.

---

## 프롬프트

### 변환 + 분해 프롬프트

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

### 종합 프롬프트

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

## 오류 처리

| 시나리오                | 조치                                 |
| ----------------------- | ------------------------------------ |
| 변환 LLM 실패           | `queryWithFileSearch()`로 폴백       |
| 2개 미만 하위 쿼리 성공 | `queryWithFileSearch()`로 폴백       |
| 종합 실패               | 가장 좋은 하위 쿼리 답변을 직접 반환 |
| 모든 단계 실패          | 기존 코드의 오류 처리 사용           |

---

## 파일 요약

### 새 파일 (4개)

| 파일                                      | 목적                |
| ----------------------------------------- | ------------------- |
| `/src/lib/gemini/query-transform.ts`      | 쿼리 재작성 + 분해  |
| `/src/lib/gemini/parallel-rag.ts`         | 병렬 하위 쿼리 실행 |
| `/src/lib/gemini/synthesis.ts`            | 응답 집계           |
| `/src/lib/gemini/query-with-transform.ts` | 통합 진입점         |

### 수정 파일 (2개)

| 파일                                                | 변경사항                               |
| --------------------------------------------------- | -------------------------------------- |
| `/src/app/api/conversations/[id]/messages/route.ts` | 함수 호출 교체 (import 1줄 + 코드 1줄) |
| `/src/lib/gemini/index.ts`                          | export 추가                            |

### 구현 전 읽어야 할 핵심 파일

1. `/src/lib/gemini/chat.ts` - Gemini File Search 호출 패턴
2. `/src/lib/gemini/keyword-extraction.ts` - LLM에서 JSON 파싱 패턴
3. `/src/lib/gemini/prompts.ts` - 프롬프트 구조 패턴
4. `/src/lib/db/messages.ts` - GroundingChunk/GroundingSupport 타입
5. `/src/app/api/conversations/[id]/messages/route.ts` - 통합 지점

---

## 구현 순서

1. `query-transform.ts` 생성 (변환 프롬프트 및 JSON 파싱)
2. `parallel-rag.ts` 생성 (Promise.allSettled 실행)
3. `synthesis.ts` 생성 (chunk 병합 및 종합 프롬프트)
4. `query-with-transform.ts` 생성 (통합 진입점)
5. API 라우트 업데이트하여 새 함수 사용
6. 전체 흐름 테스트

---

## 성능 참고사항

| 지표            | 현재   | 변환 적용 후                  |
| --------------- | ------ | ----------------------------- |
| Gemini API 호출 | 1회    | 7회 (변환 1 + RAG 5 + 종합 1) |
| 지연 시간       | ~3-5초 | ~6-8초                        |
| 토큰 사용량     | 낮음   | ~3-4배 증가                   |

**향후 최적화** (현재 범위 외):

- 반복 질문에 대한 쿼리 캐싱
- 단순한 질문에 대해 3개 하위 쿼리로 축소
- 후속 질문에 대해 변환 건너뛰기
