# Embedding 기반 논문 Re-ranking 계획

## 목표

Collection 생성 시 keyword matching으로 가져온 논문 리스트를 사용자 질문/주제의 embedding과 비교하여 더 관련성 높은 논문을 선별한다.

---

## 현재 흐름

```
1. 사용자 입력 (주제/질문)
2. AI가 검색 키워드 생성
3. Semantic Scholar에서 keyword matching으로 논문 검색
4. 결과 반환 (최대 100개)
```

## 개선된 흐름

```
1. 사용자 입력 (주제/질문)
2. AI가 검색 키워드 생성
3. Semantic Scholar에서 keyword matching으로 논문 검색 (더 많이, 예: 200-500개)
4. [NEW] 사용자 질문의 embedding 생성
5. [NEW] 각 논문의 embedding과 cosine similarity 계산
6. [NEW] 유사도 기준으로 re-ranking 후 상위 N개 선별
7. 결과 반환 (예: 상위 50-100개)
```

---

## API 선택 전략

### Option A: Academic Graph API의 `embedding` 필드 사용

**장점:**

- 기존 검색 API와 통합 가능 (한 번의 요청으로 embedding까지)
- 별도의 API 호출 불필요
- Pre-computed embedding이므로 빠름

**단점:**

- 사용자 질문의 embedding은 생성 불가 (논문 데이터만 제공)
- 사용자 질문은 별도 SPECTER API로 생성 필요

**요청 예시:**

```typescript
// /paper/search/bulk 또는 /paper/batch에서
const response = await client.get('/paper/search/bulk', {
  params: {
    query: 'quantum computing',
    fields: 'paperId,title,abstract,embedding.specter_v2',
    limit: 200,
  },
});
```

### Option B: SPECTER Embedding API 직접 사용

**엔드포인트:** `https://model-apis.semanticscholar.org/specter/v1/invoke`

**장점:**

- 사용자 질문도 동일한 임베딩 공간에서 생성 가능
- title + abstract 외의 텍스트도 임베딩 가능

**단점:**

- 배치 크기 제한 (16개)
- 200개 논문 = 13번의 API 호출 필요
- Rate limit 불명확

### 권장: Hybrid 접근법

```
1. 논문 검색 시 `embedding.specter_v2` 필드 포함하여 요청
2. 사용자 질문은 SPECTER API로 별도 임베딩 생성
3. Cosine similarity로 re-ranking
```

---

## 구현 태스크

### Phase 1: 타입 및 클라이언트 확장

#### Task 1.1: Embedding 타입 정의

```typescript
// src/lib/semantic-scholar/types.ts

export interface Embedding {
  model: string; // e.g., "specter@v0.1.1", "specter2@..."
  vector: number[]; // 768-dimensional float array
}

export interface PaperWithEmbedding extends Paper {
  embedding?: Embedding;
}
```

#### Task 1.2: SemanticScholarClient에 embedding 지원 추가

```typescript
// searchPapers() 에서 fields에 embedding.specter_v2 추가 옵션
// getPapersBatch() 에서 embedding 지원
```

#### Task 1.3: SPECTER Embedding API 클라이언트 생성

```typescript
// src/lib/semantic-scholar/specter-client.ts

const SPECTER_API_URL =
  'https://model-apis.semanticscholar.org/specter/v1/invoke';
const MAX_BATCH_SIZE = 16;

interface SpecterInput {
  paper_id: string;
  title: string;
  abstract: string;
}

interface SpecterResponse {
  preds: Array<{
    paper_id: string;
    embedding: number[]; // 768-dim
  }>;
}

export async function generateEmbedding(
  title: string,
  abstract: string
): Promise<number[]>;

export async function generateEmbeddingsBatch(
  papers: SpecterInput[]
): Promise<Map<string, number[]>>;
```

### Phase 2: Similarity 계산 유틸리티

#### Task 2.1: Cosine Similarity 함수

```typescript
// src/lib/utils/vector.ts

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimensions must match');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankBySimilarity<T extends { embedding: number[] }>(
  items: T[],
  queryEmbedding: number[],
  topK?: number
): Array<T & { similarity: number }>;
```

### Phase 3: Collection 생성 파이프라인 수정

#### Task 3.1: 검색 + Re-ranking 통합

```typescript
// src/lib/semantic-scholar/search-with-reranking.ts

interface SearchWithRerankingParams {
  userQuery: string; // 사용자의 원본 질문
  searchKeywords: string; // AI가 생성한 검색 키워드
  initialLimit: number; // 초기 검색 결과 수 (예: 300)
  finalLimit: number; // 최종 선별 수 (예: 100)
  yearFrom?: number;
  yearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
}

export async function searchWithReranking(
  params: SearchWithRerankingParams
): Promise<PaperWithSimilarity[]>;
```

**알고리즘:**

1. Semantic Scholar에서 `initialLimit`개 논문 검색 (embedding 포함)
2. SPECTER API로 `userQuery` 임베딩 생성
3. 각 논문과 cosine similarity 계산
4. similarity 기준 내림차순 정렬
5. 상위 `finalLimit`개 반환

#### Task 3.2: API Route 수정

```typescript
// src/app/api/collections/route.ts

// 기존: searchPapers() 직접 호출
// 변경: searchWithReranking() 호출로 대체
```

### Phase 4: 캐싱 전략

#### Task 4.1: Query Embedding 캐싱

```typescript
// Redis 캐시 키: `specter:query:{hash(query)}`
// TTL: 7일 (자주 사용되는 쿼리 재사용)
```

#### Task 4.2: Paper Embedding 캐싱

```typescript
// Paper embedding은 Semantic Scholar API에서 제공하므로
// 별도 캐싱 불필요 (검색 결과에 포함됨)
```

---

## 데이터베이스 스키마 변경 (선택사항)

논문의 embedding을 저장할지 여부:

### Option A: 저장하지 않음 (권장)

- Semantic Scholar API에서 매번 가져옴
- 스토리지 절약 (768 floats × 100 papers = ~300KB/collection)
- API에서 최신 embedding 제공

### Option B: papers 테이블에 저장

```sql
ALTER TABLE papers ADD COLUMN embedding float8[] NULL;
CREATE INDEX papers_embedding_idx ON papers USING ivfflat (embedding vector_cosine_ops);
```

- pgvector 확장 필요
- 향후 collection 내 유사 논문 검색에 활용 가능

---

## 에러 핸들링

### SPECTER API 실패 시

1. 3회 재시도 with exponential backoff
2. 실패 시 embedding 없이 keyword 검색 결과만 반환 (fallback)
3. 사용자에게 "semantic ranking unavailable" 알림

### Embedding 필드 누락 시

일부 논문은 embedding이 없을 수 있음:

```typescript
// embedding이 없는 논문은 similarity 계산에서 제외
// 또는 SPECTER API로 직접 생성 (title + abstract 있으면)
```

---

## 예상 성능

| 단계                              | 예상 시간 |
| --------------------------------- | --------- |
| 논문 검색 (300개, embedding 포함) | 2-5초     |
| 사용자 쿼리 embedding 생성        | 0.5-1초   |
| Cosine similarity 계산 (300개)    | <10ms     |
| **총합**                          | **3-6초** |

---

## 구현 우선순위

```
1. [HIGH] SPECTER API 클라이언트 (사용자 쿼리 임베딩)
2. [HIGH] Cosine similarity 유틸리티
3. [HIGH] searchPapers에 embedding 필드 옵션 추가
4. [MEDIUM] searchWithReranking 통합 함수
5. [MEDIUM] Collection 생성 API 수정
6. [LOW] Redis 캐싱
7. [LOW] DB에 embedding 저장 (pgvector)
```

---

## 테스트 계획

### Unit Tests

- [ ] cosineSimilarity 정확도 테스트
- [ ] SPECTER API 요청/응답 파싱
- [ ] re-ranking 순서 검증

### Integration Tests

- [ ] 실제 Semantic Scholar API로 embedding 필드 반환 확인
- [ ] SPECTER API로 임베딩 생성 확인
- [ ] 전체 파이프라인 E2E 테스트

### Manual Testing

- [ ] 다양한 주제로 검색하여 re-ranking 품질 확인
- [ ] keyword-only vs embedding re-ranking 비교

---

## 참고 자료

- [Semantic Scholar API Docs](https://api.semanticscholar.org/api-docs)
- [SPECTER Embedding API](https://github.com/allenai/paper-embedding-public-apis)
- [SPECTER2 Paper](https://arxiv.org/abs/2211.13308)
- [Hugging Face SPECTER2](https://huggingface.co/allenai/specter2)
