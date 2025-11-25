# CiteBite 외부 API 가이드

**문서 버전**: v1.1
**작성일**: 2025-11-15
**최종 수정**: 2025-11-21 (SPECTER2 API 업데이트)
**목적**: Semantic Scholar API, HuggingFace API, Gemini File Search API 통합을 위한 상세 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[프론트엔드 스택](./FRONTEND.md)** - Next.js, React, UI 라이브러리
- **[백엔드 스택](./BACKEND.md)** - Node.js, API Routes, 인증
- **[데이터베이스 설계](./DATABASE.md)** - PostgreSQL, Supabase Client, Supabase Storage
- **[인프라 및 운영](./INFRASTRUCTURE.md)** - 배포, 백그라운드 작업, 보안

---

## 1. Semantic Scholar API

**역할**: 학술 논문 메타데이터 검색 및 Open Access PDF 수집

### 1.1 주요 기능

**Academic Graph API**

```
Base URL: https://api.semanticscholar.org/graph/v1
```

**사용할 엔드포인트:**

#### 1.1.1 Paper Bulk Search (`/paper/search/bulk`)

- **용도**: 키워드 기반 논문 검색
- **기능**:
  - 고급 쿼리 문법 지원 (phrase matching, wildcards, fuzzy search)
  - 필터링: 출판 연도, 인용 수, 연구 분야, 학회/저널
  - 정렬: 관련도, 인용 수, 최신순
- **사용 시나리오**:
  - 컬렉션 생성 시 초기 논문 검색
  - 컬렉션 업데이트 시 신규 논문 발견

#### 1.1.2 Paper Details Endpoint (`/paper/{paper_id}`)

- **용도**: 특정 논문의 상세 정보 조회
- **반환 데이터**: 제목, 저자, 초록, 인용 수, Open Access PDF URL
- **사용 시나리오**:
  - 논문 상세 팝업 표시
  - 메타데이터 업데이트

#### 1.1.3 Paper Batch Endpoint (`/paper/batch`)

- **용도**: 여러 논문의 정보를 한 번에 조회
- **최적화**: API 호출 횟수 감소
- **사용 시나리오**:
  - 컬렉션 내 여러 논문의 메타데이터 동기화
  - 인사이트 생성 시 논문 정보 일괄 조회

---

### 1.2 반환 데이터 구조 (주요 필드)

```json
{
  "paperId": "649def34f8be52c8b66281af98ae884c09aef38b",
  "title": "Attention Is All You Need",
  "abstract": "The dominant sequence transduction models...",
  "authors": [{ "authorId": "...", "name": "Ashish Vaswani" }],
  "year": 2017,
  "citationCount": 12450,
  "venue": "NIPS",
  "publicationTypes": ["Conference"],
  "openAccessPdf": {
    "url": "https://arxiv.org/pdf/1706.03762.pdf",
    "status": "GOLD"
  },
  "externalIds": {
    "ArXiv": "1706.03762",
    "DOI": "10.1234/example"
  }
}
```

---

### 1.3 Rate Limits 및 최적화

- **무료 사용**: 공유 대역폭, 성능 불안정
- **API Key 발급 후**: 1 req/sec (검토 후 증가 가능)
- **최적화 전략**:
  - `fields` 파라미터로 필요한 데이터만 요청
  - Bulk/Batch 엔드포인트 활용
  - 응답 캐싱 (24시간)
  - 대량 작업 시 Datasets API 활용

---

### 1.4 구현 필요 기능

#### 1.4.1 검색 쿼리 빌더 및 Query Syntax

**Semantic Scholar API Query Syntax** (공식 문서: https://www.semanticscholar.org/product/api/tutorial)

Semantic Scholar는 표준 boolean operator(AND, OR, NOT)가 아닌 자체 문법을 사용합니다:

| 기능            | Operator      | 예시                  | 설명                        |
| --------------- | ------------- | --------------------- | --------------------------- |
| 필수 포함 (AND) | `+`           | `+security`           | 반드시 포함되어야 하는 단어 |
| 택1 (OR)        | `\|`          | `(review \| survey)`  | 둘 중 하나 이상 포함        |
| 제외 (NOT)      | `-`           | `-privacy`            | 제외할 단어                 |
| 그룹핑          | `( )`         | `+(review \| survey)` | 연산자 그룹화               |
| 구절 검색       | `" "`         | `"deep learning"`     | 정확한 구절 매칭            |
| 와일드카드      | `*`           | `fish*`               | fish로 시작하는 모든 단어   |
| 퍼지 매칭       | `~N`          | `bugs~3`              | N글자 이내 유사 단어        |
| 근접 검색       | `"phrase" ~N` | `"blue lake" ~3`      | N단어 이내 거리             |

**Examples:**

```typescript
// ❌ 작동 안 함 (표준 boolean)
'quantum computing AND (review OR survey)';

// ✅ 올바른 문법
"\"quantum computing\" +(review | survey | roadmap)";
"transformer +\"computer vision\"";
'((cloud computing) | virtualization) +security -privacy';
```

**Implementation:**

```typescript
function buildSemanticScholarQuery(params: {
  keywords: string; // Already formatted with Semantic Scholar syntax by AI
  yearFrom?: number; // Passed as separate 'year' HTTP parameter
  yearTo?: number; // Passed as separate 'year' HTTP parameter
  minCitations?: number; // Passed as 'minCitationCount' HTTP parameter
  openAccessOnly?: boolean; // Passed as 'openAccessPdf' HTTP parameter
}): string {
  // Just return keywords as-is - filters are handled as HTTP params
  return params.keywords;
}
```

**Note:** Year, citation count, and Open Access filters are NOT part of the query string.
They are passed as separate HTTP parameters (see client.ts implementation).

#### 1.4.2 페이지네이션 처리

- Bulk Search는 최대 1000개 결과 반환
- `offset`과 `limit` 파라미터로 페이지 처리

#### 1.4.3 에러 핸들링

- Rate limit 초과 시 exponential backoff
- 네트워크 오류 시 재시도 (최대 3회)
- 논문 메타데이터 누락 시 기본값 처리

---

## 2. HuggingFace Inference API (SPECTER2)

⚠️ **NOT IMPLEMENTED** - This feature was attempted but abandoned due to technical limitations.

**Reason for abandonment**:

- SPECTER2 model is **not deployed** on HuggingFace Inference API
- Alternative models (e.g., all-MiniLM-L6-v2) have dimension mismatch (384 vs 768)
- Cannot compute cosine similarity between query embeddings (384-dim) and paper embeddings from Semantic Scholar (768-dim)
- Would require custom infrastructure (Python FastAPI server) to run SPECTER2 directly

**Current implementation**: Using **keyword search only** via Semantic Scholar API (relevance-based ranking is sufficient for most use cases)

**역할**: ~~검색 쿼리를 768차원 임베딩 벡터로 변환하여 semantic similarity 계산~~ (deprecated)

**Last verified**: 2025-11-21

### 2.1 주요 기능

**SPECTER2 Model Inference**

```
Base URL: https://api-inference.huggingface.co/models/allenai/specter2
```

- **용도**: 논문 제목/초록 텍스트를 semantic embedding으로 변환
- **모델**: SPECTER2 (SciBERT 기반, 학술 논문 특화)
- **출력**: 768차원 벡터
- **사용 시나리오**:
  - Hybrid Search: 키워드 검색 후 semantic re-ranking
  - Similarity Analysis: 유사도 분포 분석으로 threshold 추천

### 2.2 API 토큰 발급

1. HuggingFace 가입 (무료): https://huggingface.co/join
2. Access Token 생성: https://huggingface.co/settings/tokens
   - Token name: `citebite-specter2`
   - Token type: **Read** (inference only)
3. `.env.local`에 추가:
   ```bash
   HUGGINGFACE_API_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2.3 Rate Limits 및 비용

- **무료 Tier**: 30,000 requests/month
- **Rate Limit**: ~10 requests/sec
- **응답 속도**: 1-2초 (모델 로딩 시 첫 요청은 느릴 수 있음)
- **업그레이드**: PRO ($9/월) → 무제한 요청

### 2.4 API 사용 예시

```typescript
import axios from 'axios';

const HUGGINGFACE_API_URL =
  'https://api-inference.huggingface.co/models/allenai/specter2';
const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

async function embedQuery(text: string): Promise<number[]> {
  const response = await axios.post(
    HUGGINGFACE_API_URL,
    {
      inputs: text,
      options: {
        wait_for_model: true, // 모델 로딩 대기
      },
    },
    {
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data; // number[] (768 dimensions)
}
```

### 2.5 에러 핸들링

- **401 Unauthorized**: API 토큰 유효하지 않음 → 토큰 재발급
- **503 Service Unavailable**: 모델 로딩 중 → `wait_for_model: true` 사용 또는 재시도
- **429 Too Many Requests**: Rate limit 초과 → 무료 tier 한도 확인

### 2.6 SPECTER2 vs 기존 SPECTER API

| 항목           | SPECTER2 (HuggingFace)       | Legacy SPECTER API                       |
| -------------- | ---------------------------- | ---------------------------------------- |
| API 엔드포인트 | api-inference.huggingface.co | model-apis.semanticscholar.org           |
| 상태           | ✅ 활성화 (2025년 현재)      | ❌ 작동 불가 (2021년 이후 업데이트 없음) |
| 무료 tier      | ✅ 30,000 requests/month     | ❓ 불명 (문서화 안됨)                    |
| 인증           | ✅ Read token 필요           | ❓ 불명                                  |
| Rate limit     | ~10 req/sec                  | 불명                                     |
| 응답 속도      | 1-2초                        | N/A                                      |
| 문서화         | ✅ 공식 문서 존재            | ❌ GitHub README만 존재                  |
| **추천 여부**  | ✅ **강력 추천**             | ❌ 사용 불가                             |

### 2.7 대안: Semantic Scholar API의 `embedding.specter_v2`

Semantic Scholar API는 **논문 임베딩만 제공** (쿼리 임베딩은 불가):

```typescript
GET https://api.semanticscholar.org/graph/v1/paper/batch
fields=paperId,embedding.specter_v2

// 응답:
{
  "paperId": "abc123",
  "embedding": {
    "specter_v2": [0.123, -0.456, ...] // 768 dimensions
  }
}
```

**사용 방법**:

- Hybrid Search의 **Step 3: 논문 임베딩 가져오기**에서 사용
- HuggingFace API로 쿼리 임베딩 생성 + Semantic Scholar API로 논문 임베딩 가져오기

---

## 3. Gemini File Search API

⚠️ **CRITICAL: This section may be outdated**

**Before implementing any Gemini File Search feature:**

1. **Fetch the latest official documentation**: https://ai.google.dev/gemini-api/docs/file-search
   - Use WebFetch tool to verify API endpoints, parameters, and methods
   - Gemini File Search is a recently added API with frequent updates
2. **Verify API changes**
   - Check if method signatures, parameters, or return types have changed
   - Look for new features or deprecations
   - Validate rate limits and pricing information
3. **Official documentation is the source of truth**
   - If there's a discrepancy between this document and official docs, follow official docs
   - This document serves as a quick reference, but may lag behind latest changes

**Last verified**: 2025-11-17
**Next review**: Every 2 weeks or before major feature implementation

---

**역할**: PDF 문서 벡터화, 저장, 시맨틱 검색 기반 RAG 구현

### 2.1 핵심 개념

Gemini File Search는 **완전 관리형 RAG 시스템**으로, 다음 기능을 자동화합니다:

- PDF 파일 업로드 및 텍스트 추출
- 문서 청킹 (chunking)
- 임베딩 생성 및 벡터 인덱싱
- 시맨틱 검색 및 컨텍스트 추출

---

### 2.2 아키텍처

**File Search Store (벡터 저장소)**

- 영구 저장소로 수동 삭제 전까지 유지
- 여러 Store로 컬렉션별 분리 가능
- 각 Store는 최대 20GB 권장 (성능 최적화)

**처리 파이프라인:**

```
PDF 업로드 → 텍스트 추출 → 청킹 → 임베딩 생성 → 벡터 인덱싱 → Store 저장
```

**쿼리 파이프라인:**

```
사용자 질문 → 임베딩 생성 → 시맨틱 검색 → Top-K 청크 추출 → LLM 프롬프트 구성 → 답변 생성
```

---

### 2.3 주요 기능 및 제한사항

#### 2.3.1 파일 업로드

- **최대 파일 크기**: 100MB/파일
- **지원 형식**: PDF, DOCX, PPTX, JSON, HTML, Markdown 등 150+ MIME types
- **업로드 방식**:
  1. `uploadToFileSearchStore`: 직접 Store에 업로드 (권장)
  2. Files API → `importFile`: 2단계 업로드 (프로그래밍 방식 생성 시)

#### 2.3.2 저장 용량 (사용자 tier별)

- Free: 1GB
- Tier 1: 10GB
- Tier 2: 100GB
- Tier 3: 1TB

**참고**: Store 크기는 원본 데이터의 약 3배 (임베딩 포함)

#### 2.3.3 청킹 설정

```typescript
chunking_config: {
  max_tokens_per_chunk: 1024,      // 청크당 최대 토큰 수
  overlap_tokens: 200              // 청크 간 오버랩 토큰
}
```

- **기본값**: 자동 청킹 (권장)
- **커스터마이징**: 논문 섹션 경계 유지 등 특수 케이스

#### 2.3.4 임베딩 모델

- **모델**: `gemini-embedding-001`
- **자동 생성**: 별도 구현 불필요
- **비용**: $0.15 per 1M tokens (인덱싱 시)

---

### 2.4 검색 기능

#### 2.4.1 시맨틱 검색

- 질문 임베딩 자동 생성 (무료)
- Top-K 유사 청크 반환
- 검색 결과는 LLM 컨텍스트로 자동 전달

#### 2.4.2 메타데이터 필터링

```typescript
// 특정 논문만 검색
metadata_filters: [
  { key: 'paper_id', value: '649def34f8be52c8b66281af98ae884c09aef38b' },
];
```

- **표준**: google.aip.dev/160 필터 문법
- **사용 시나리오**:
  - 특정 저자 논문만 검색
  - 특정 연도 논문 필터링
  - 사용자 업로드 논문 구분

#### 2.4.3 인용 메타데이터 (Grounding Metadata)

```json
{
  "grounding_metadata": {
    "grounding_chunks": [
      {
        "document_id": "file_123",
        "chunk_id": "chunk_456",
        "relevance_score": 0.92
      }
    ]
  }
}
```

- **용도**: 답변에 사용된 논문 출처 표시
- **구현**: 답변 하단에 "📚 참조 논문" 리스트 생성

---

### 2.5 지원 모델

- `gemini-2.5-pro`: 고품질 답변 (느림, 비쌈)
- `gemini-2.5-flash`: 빠른 응답 (권장)

---

### 2.6 비용 구조

| 항목                             | 비용                                                   |
| -------------------------------- | ------------------------------------------------------ |
| 임베딩 생성 (인덱싱)             | $0.15 / 1M tokens                                      |
| 저장 공간                        | 무료                                                   |
| 검색 시 쿼리 임베딩              | 무료                                                   |
| LLM 답변 생성 (gemini-2.5-flash) | Input: $0.075 / 1M tokens<br>Output: $0.30 / 1M tokens |

**예상 비용 (컬렉션당)**:

- 논문 50개 × 평균 20페이지 = 약 500,000 토큰
- 인덱싱 비용: $0.075
- 대화 100회 × 평균 2,000 토큰 컨텍스트 = $0.015

→ **컬렉션당 총 비용: ~$0.10**

---

### 2.7 구현 필요 기능

#### 2.7.1 File Search Store 관리

```typescript
// 컬렉션별 Store 생성
async function createFileSearchStore(collectionId: string) {
  const store = await genai.fileSearchStores.create({
    displayName: `collection_${collectionId}`,
    metadata: { collection_id: collectionId },
  });
}
```

#### 2.7.2 PDF 업로드 및 인덱싱

```typescript
async function uploadPdfToStore(
  storeId: string,
  pdfBuffer: Buffer,
  metadata: { paper_id: string; title: string }
) {
  await genai.fileSearchStores.uploadToFileSearchStore(storeId, {
    file: pdfBuffer,
    mimeType: 'application/pdf',
    metadata: metadata,
  });
}
```

#### 2.7.3 RAG 쿼리 실행

```typescript
async function queryWithFileSearch(
  storeId: string,
  question: string,
  conversationHistory: Message[]
) {
  const response = await genai.generateContent({
    model: 'gemini-2.5-flash',
    tools: [{ fileSearch: { fileSearchStoreId: storeId } }],
    contents: [
      ...conversationHistory,
      { role: 'user', parts: [{ text: question }] },
    ],
  });

  return {
    answer: response.text,
    citedChunks: response.groundingMetadata.groundingChunks,
  };
}
```

#### 2.7.4 Store 삭제 (컬렉션 삭제 시)

```typescript
async function deleteFileSearchStore(storeId: string) {
  await genai.fileSearchStores.delete(storeId);
}
```

---

### 2.8 Gemini vs 자체 구축 RAG 비교

| 항목         | Gemini File Search     | 자체 구축 (Pinecone + LangChain) |
| ------------ | ---------------------- | -------------------------------- |
| 구현 복잡도  | 매우 낮음 (API 호출만) | 높음 (청킹, 임베딩, 검색 로직)   |
| 초기 비용    | 무료 (1GB 저장)        | Pinecone: $70/월 (최소 요금제)   |
| 확장성       | Tier 3까지 1TB         | 무제한 (비용 증가)               |
| 커스터마이징 | 제한적                 | 완전 제어 가능                   |
| 유지보수     | Google 관리            | 직접 관리 필요                   |

**MVP 선택**: Gemini File Search (빠른 출시, 낮은 초기 비용)
