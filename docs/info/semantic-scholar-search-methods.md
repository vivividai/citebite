# Semantic Scholar API - 전체 검색 방법 및 엔드포인트

**작성일**: 2025-11-17
**출처**: Semantic Scholar Academic Graph API Official Documentation
**API 버전**: v1
**Base URL**: `https://api.semanticscholar.org/graph/v1`

---

## 목차

1. [Paper 검색 방법 (5가지)](#1-paper-검색-방법)
2. [Author 검색 방법](#2-author-검색-방법)
3. [Direct Lookup 방법 (ID 기반)](#3-direct-lookup-방법-id-기반)
4. [현재 구현 상태](#4-현재-구현-상태)
5. [CiteBite 활용 제안](#5-citebite-활용-제안)

---

## 1. Paper 검색 방법

### 1.1 Paper Relevance Search

**엔드포인트**: `GET /paper/search`

**설명**: AI 기반 관련도 순위로 논문 검색

**현재 상태**: ❌ 미구현

**주요 특징**:

- Semantic Scholar의 custom-trained ranker 사용
- 더 정확한 검색 결과 (관련도 기반 정렬)
- 리소스 집약적 (Bulk Search보다 느림)
- 최대 1,000개 결과 반환

**파라미터**:

- `query` (required): Plain-text 검색 문자열
- `fields`: 반환할 필드 (comma-separated)
- `offset`, `limit`: 페이지네이션 (최대 100개/요청)
- `publicationTypes`: 논문 타입 필터
- `openAccessPdf`: Open Access 여부
- `minCitationCount`: 최소 인용 수
- `publicationDateOrYear`: 출판 날짜/년도
- `year`: 연도 범위
- `venue`: 학회/저널
- `fieldsOfStudy`: 연구 분야

**사용 사례**:

- 가장 관련성 높은 논문을 찾고 싶을 때
- 검색 품질이 중요한 경우

---

### 1.2 Paper Bulk Search ✅ 현재 구현됨

**엔드포인트**: `GET /paper/search/bulk`

**설명**: Boolean 쿼리 문법을 지원하는 대량 논문 검색

**현재 상태**: ✅ 구현됨 (`src/lib/semantic-scholar/client.ts`)

**주요 특징**:

- Boolean 쿼리 연산자 지원: `+`, `|`, `-`, `*`, `~`, quotes, parentheses
- 정렬 옵션: `paperId`, `publicationDate`, `citationCount`
- Continuation token으로 무제한 페이지네이션
- 리소스 효율적 (Relevance Search보다 빠름)
- 최대 1,000개 결과/요청

**파라미터**:

- `query` (required): Boolean 쿼리 문자열
- `token`: Continuation token (다음 페이지)
- `sort`: 정렬 기준
- `fields`, filters: Relevance Search와 동일

**Boolean 쿼리 예시**:

```
machine learning +deep
(neural | deep) network*
"attention mechanism" -BERT
~transformers year:2020-2023
```

**사용 사례**:

- 대량의 논문을 효율적으로 검색
- 복잡한 검색 조건 (AND, OR, NOT)
- 특정 기준으로 정렬된 결과 필요

**CiteBite 구현 위치**: `src/lib/semantic-scholar/client.ts:138` (`searchPapers()`)

---

### 1.3 Paper Title Search/Match ⭐ 추천

**엔드포인트**: `GET /paper/search/match`

**설명**: 정확한 제목 매칭으로 단일 논문 찾기

**현재 상태**: ❌ 미구현

**주요 특징**:

- 제목 유사도 기반 매칭
- 단일 결과 반환 (가장 유사한 논문 1개)
- `matchScore` 반환 (유사도 점수)
- 빠른 응답 속도

**파라미터**:

- `query` (required): 논문 제목
- `fields`: 반환할 필드
- filters: 다른 검색과 동일

**응답 형식**:

```json
{
  "data": [{
    "paperId": "...",
    "title": "...",
    "matchScore": 0.95,
    ...
  }]
}
```

**사용 사례**:

- 사용자가 정확한 논문 제목을 복사-붙여넣기할 때
- 중복 논문 검사 (컬렉션에 이미 존재하는지 확인)
- 논문 존재 여부 빠르게 확인
- DOI/ArXiv ID가 없을 때 제목으로 찾기

**CiteBite 활용 제안**:

- "Add by Title" 기능 구현
- 사용자가 논문 제목을 입력하면 자동으로 논문 찾아서 추가
- 중복 추가 방지

---

### 1.4 Paper Autocomplete

**엔드포인트**: `GET /paper/autocomplete`

**설명**: 실시간 자동완성 제안

**현재 상태**: ❌ 미구현

**주요 특징**:

- 입력 중 실시간 제안
- 최대 입력 길이: 100자
- 빠른 응답 (UX 최적화)

**파라미터**:

- `query` (required, max 100 chars): 입력 중인 텍스트

**사용 사례**:

- 검색창에서 타이핑할 때 실시간 논문 제안
- UX 개선 (Google 검색과 유사한 경험)

**CiteBite 활용 제안**:

- 컬렉션 생성 시 키워드 입력창에 자동완성
- 논문 검색 UI 개선

---

### 1.5 Snippet Search ⭐ 추천

**엔드포인트**: `GET /snippet/search`

**설명**: 논문 본문 텍스트 검색 (제목/초록이 아닌 전체 본문)

**현재 상태**: ❌ 미구현

**주요 특징**:

- 논문 본문에서 검색 (PDF 텍스트 추출)
- ~500단어 발췌문 반환
- 섹션 정보 포함 (Introduction, Methods, Results, etc.)
- 검색어 주변 컨텍스트 제공

**파라미터**:

- `query` (required): Plain-text 검색어
- `fields`: 반환할 필드
- `paperIds`: 특정 논문들로 검색 범위 제한
- `authors`: 특정 저자 논문만 검색
- `minCitationCount`: 최소 인용 수
- `limit` (default 10, max 1,000): 결과 개수

**응답 형식**:

```json
{
  "data": [
    {
      "snippet": "...500 words excerpt...",
      "section": "Methods",
      "paperId": "...",
      "score": 0.85
    }
  ]
}
```

**사용 사례**:

- 특정 방법론이 언급된 논문 찾기
  - 예: "BERT fine-tuning" 방법을 사용한 논문
- 실험 결과나 수식이 포함된 부분 검색
- 특정 데이터셋 사용 논문 찾기
- 제목/초록만으로는 부족할 때 더 정확한 검색

**CiteBite 활용 제안**:

- "Advanced Search" 기능으로 본문 검색 제공
- 컬렉션 내 논문들에서 특정 개념 검색
- RAG 시스템과 결합하여 더 정확한 답변

---

## 2. Author 검색 방법

### 2.1 Author Search

**엔드포인트**: `GET /author/search`

**설명**: 저자 이름으로 검색

**현재 상태**: ❌ 미구현

**주요 특징**:

- Plain-text 이름 검색 (특수 쿼리 문법 미지원)
- 저자 프로필 + 논문 목록 반환
- 최대 1,000개 결과

**파라미터**:

- `query` (required): 저자 이름
- `fields`: 반환할 필드
- `offset`, `limit`: 페이지네이션

**사용 사례**:

- 특정 저자의 모든 논문 찾기
- 연구자 프로필 조회
- 공동 연구자 네트워크 탐색

**CiteBite 활용 제안**:

- "Author Collections" 기능
  - 특정 연구자의 모든 논문을 자동으로 컬렉션에 추가
  - 예: "Andrew Ng의 모든 논문" 컬렉션

---

### 2.2 Author Details

**엔드포인트**: `GET /author/{author_id}`

**설명**: 특정 저자의 상세 프로필 조회

**현재 상태**: ❌ 미구현

**주요 특징**:

- h-index, citation count, paper count
- 최근 논문 목록
- 연구 분야
- 최대 응답 크기: 10MB

**사용 사례**:

- 저자 프로필 페이지 구현
- 연구 영향력 분석

---

### 2.3 Author Papers

**엔드포인트**: `GET /author/{author_id}/papers`

**설명**: 특정 저자의 모든 논문 목록

**현재 상태**: ❌ 미구현

**주요 특징**:

- 최대 1,000개 논문
- 출판 날짜로 필터링 가능
- 논문당 최근 10,000개 citations/references 포함

**파라미터**:

- `fields`: 반환할 필드
- `offset`, `limit`: 페이지네이션
- `publicationDateOrYear`: 날짜 필터

**사용 사례**:

- 저자의 전체 연구 이력 조회
- 특정 기간의 논문만 필터링

---

### 2.4 Author Batch

**엔드포인트**: `POST /author/batch`

**설명**: 여러 저자 정보 한 번에 조회

**현재 상태**: ❌ 미구현

**주요 특징**:

- 최대 1,000명의 저자
- 최대 응답 크기: 10MB

**파라미터**:

- JSON body: `{ "ids": ["author_id1", "author_id2", ...] }`
- `fields`: 반환할 필드

**사용 사례**:

- 여러 저자 프로필 일괄 조회
- 공동 저자 네트워크 분석

---

## 3. Direct Lookup 방법 (ID 기반)

### 3.1 Paper Details ✅ 현재 구현됨

**엔드포인트**: `GET /paper/{paper_id}`

**설명**: 특정 논문의 상세 정보 조회

**현재 상태**: ✅ 구현됨 (`client.getPaper()`)

**지원 ID 형식**:

- **Semantic Scholar Paper ID**: SHA hash (예: `649def34f8be52c8b66281af98ae884c09aef38b`)
- **DOI**: `DOI:10.1093/nar/gkr1047`
- **ArXiv**: `ARXIV:1705.10311`
- **CorpusId**: `CorpusID:37220927`
- **PubMed**: `PMID:19872477`
- **PubMed Central**: `PMCID:PMC2808858`
- **MAG**: `MAG:112218234`
- **ACL**: `ACL:W12-3903`
- **URL**: Semantic Scholar URL

**파라미터**:

- `fields`: 선택적 필드 조회 (응답 크기 최적화)

**사용 사례**:

- DOI/ArXiv ID로 논문 정보 가져오기
- 논문 메타데이터 업데이트
- 논문 상세 팝업 표시

**CiteBite 구현 위치**: `src/lib/semantic-scholar/client.ts:236` (`getPaper()`)

---

### 3.2 Paper Batch ✅ 현재 구현됨

**엔드포인트**: `POST /paper/batch`

**설명**: 여러 논문 정보 한 번에 조회

**현재 상태**: ✅ 구현됨 (`client.getPapers()`)

**주요 특징**:

- 최대 500개 논문
- 최대 응답 크기: 10MB
- API 호출 횟수 최적화

**파라미터**:

- JSON body: `{ "ids": ["paper_id1", "paper_id2", ...] }`
- `fields`: 반환할 필드

**사용 사례**:

- 컬렉션 내 여러 논문 메타데이터 동기화
- 인사이트 생성 시 논문 정보 일괄 조회

**CiteBite 구현 위치**: `src/lib/semantic-scholar/client.ts:275` (`getPapers()`)

---

### 3.3 Paper Citations ⭐ 추천

**엔드포인트**: `GET /paper/{paper_id}/citations`

**설명**: 이 논문을 인용한 논문들 (incoming citations)

**현재 상태**: ❌ 미구현

**주요 특징**:

- Citation context (인용 문맥) 포함
- Citation intents (인용 의도) 포함
- Influence flags (영향력 표시)
- 최대 1,000개 citations

**파라미터**:

- `fields`: 반환할 필드
- `offset`, `limit`: 페이지네이션
- `publicationDateOrYear`: 날짜 필터

**응답 형식**:

```json
{
  "data": [{
    "citingPaper": {
      "paperId": "...",
      "title": "...",
      ...
    },
    "contexts": ["...citation context..."],
    "intents": ["methodology", "background"],
    "isInfluential": true
  }]
}
```

**사용 사례**:

- 논문의 영향력 분석
- 이 논문을 기반으로 한 최신 연구 추적
- "Related Papers" 자동 추천
- 인용 네트워크 시각화

**CiteBite 활용 제안**:

- "Cited By" 탭 추가 (논문 상세 페이지)
- "자동으로 관련 논문 추가" 기능
  - 컬렉션의 핵심 논문을 인용한 최신 논문 자동 추가
- 인용 그래프 시각화

---

### 3.4 Paper References ⭐ 추천

**엔드포인트**: `GET /paper/{paper_id}/references`

**설명**: 이 논문이 인용한 논문들 (outgoing references)

**현재 상태**: ❌ 미구현

**주요 특징**:

- Reference context (참조 문맥) 포함
- Citation intents (인용 의도) 포함
- Influence flags (영향력 표시)
- 최대 1,000개 references

**파라미터**:

- Citations와 동일

**응답 형식**:

- Citations와 동일 구조

**사용 사례**:

- 논문의 배경 지식 탐색
- "References" 섹션 자동 생성
- 선행 연구 네트워크 구축
- 관련 논문 추천

**CiteBite 활용 제안**:

- "References" 탭 추가 (논문 상세 페이지)
- "논문 트리 확장" 기능
  - 컬렉션에 논문 추가 시 자동으로 참고문헌도 제안
- 연구 계보 추적 (어떤 논문이 기반이 되었는지)

---

### 3.5 Paper Authors

**엔드포인트**: `GET /paper/{paper_id}/authors`

**설명**: 논문의 모든 저자 목록

**현재 상태**: ❌ 미구현

**주요 특징**:

- 저자 순서대로 반환
- 저자별 상세 정보 포함
- 최대 1,000명 저자

**파라미터**:

- `fields`: 반환할 필드
- `offset`, `limit`: 페이지네이션

**사용 사례**:

- 공동 저자 네트워크 분석
- 저자별 기여도 표시

---

## 4. 현재 구현 상태

### ✅ 구현된 기능 (3개)

| 기능              | 엔드포인트               | 구현 위치                                |
| ----------------- | ------------------------ | ---------------------------------------- |
| Paper Bulk Search | `GET /paper/search/bulk` | `src/lib/semantic-scholar/client.ts:138` |
| Paper Details     | `GET /paper/{id}`        | `src/lib/semantic-scholar/client.ts:236` |
| Paper Batch       | `POST /paper/batch`      | `src/lib/semantic-scholar/client.ts:275` |

### ❌ 미구현 기능 (11개)

| 기능                   | 엔드포인트                   | 우선순위    | 이유                                   |
| ---------------------- | ---------------------------- | ----------- | -------------------------------------- |
| **Paper Title Match**  | `GET /paper/search/match`    | ⭐⭐⭐ 높음 | 정확한 제목으로 논문 찾기, 중복 방지   |
| **Paper Citations**    | `GET /paper/{id}/citations`  | ⭐⭐⭐ 높음 | 관련 논문 자동 탐색, 영향력 분석       |
| **Paper References**   | `GET /paper/{id}/references` | ⭐⭐⭐ 높음 | 관련 논문 자동 탐색, 참고문헌 네트워크 |
| Snippet Search         | `GET /snippet/search`        | ⭐⭐ 중간   | 본문 검색으로 더 정확한 결과           |
| Author Search          | `GET /author/search`         | ⭐⭐ 중간   | 저자 기반 컬렉션 생성                  |
| Author Details         | `GET /author/{id}`           | ⭐⭐ 중간   | 저자 프로필 페이지                     |
| Author Papers          | `GET /author/{id}/papers`    | ⭐⭐ 중간   | 저자의 모든 논문 조회                  |
| Paper Relevance Search | `GET /paper/search`          | ⭐ 낮음     | Bulk Search로 충분 (리소스 집약적)     |
| Paper Autocomplete     | `GET /paper/autocomplete`    | ⭐ 낮음     | UX 개선용 (필수 아님)                  |
| Paper Authors          | `GET /paper/{id}/authors`    | ⭐ 낮음     | 현재 Paper Details에 포함 가능         |
| Author Batch           | `POST /author/batch`         | ⭐ 낮음     | 현재 필요성 낮음                       |

---

## 5. CiteBite 활용 제안

### 🎯 Phase 2 (단기) - 핵심 기능 추가

#### 1. Paper Title Match 구현

```typescript
// src/lib/semantic-scholar/client.ts
async matchPaperByTitle(title: string): Promise<Paper | null> {
  const response = await this.client.get('/paper/search/match', {
    params: { query: title, fields: 'paperId,title,authors,year,abstract,citationCount,openAccessPdf' }
  });
  return response.data.data[0] || null;
}
```

**활용**:

- "Add Paper by Title" UI 추가
- 중복 논문 검사 로직 개선

#### 2. Paper Citations/References 구현

```typescript
// src/lib/semantic-scholar/client.ts
async getPaperCitations(paperId: string, limit = 100): Promise<Citation[]> {
  const response = await this.client.get(`/paper/${paperId}/citations`, {
    params: { fields: 'citingPaper.paperId,citingPaper.title,citingPaper.year,contexts,intents,isInfluential', limit }
  });
  return response.data.data;
}

async getPaperReferences(paperId: string, limit = 100): Promise<Reference[]> {
  const response = await this.client.get(`/paper/${paperId}/references`, {
    params: { fields: 'citedPaper.paperId,citedPaper.title,citedPaper.year,contexts,intents,isInfluential', limit }
  });
  return response.data.data;
}
```

**활용**:

- 논문 상세 페이지에 "Citations" / "References" 탭 추가
- "Expand Collection" 버튼 (인용/참조 논문 자동 추가)
- 인용 네트워크 시각화 (D3.js 등)

### 🚀 Phase 3 (중기) - 고급 기능

#### 3. Snippet Search 구현

```typescript
// src/lib/semantic-scholar/client.ts
async searchSnippets(query: string, paperIds?: string[]): Promise<Snippet[]> {
  const response = await this.client.get('/snippet/search', {
    params: { query, paperIds: paperIds?.join(','), limit: 100 }
  });
  return response.data.data;
}
```

**활용**:

- "Advanced Search" 탭 추가
- 컬렉션 내 논문에서 특정 개념 검색
- RAG 시스템과 결합 (더 정확한 컨텍스트 제공)

#### 4. Author Search 구현

```typescript
// src/lib/semantic-scholar/client.ts
async searchAuthors(name: string): Promise<Author[]> {
  const response = await this.client.get('/author/search', {
    params: { query: name, fields: 'authorId,name,hIndex,citationCount,paperCount', limit: 20 }
  });
  return response.data.data;
}

async getAuthorPapers(authorId: string): Promise<Paper[]> {
  const response = await this.client.get(`/author/${authorId}/papers`, {
    params: { fields: 'paperId,title,year,citationCount,openAccessPdf', limit: 1000 }
  });
  return response.data.data;
}
```

**활용**:

- "Create Collection by Author" 기능
  - 예: "Yoshua Bengio의 모든 논문" 컬렉션
- 저자 추천 시스템

### 💡 Phase 4 (장기) - UX 개선

#### 5. Paper Autocomplete 구현

```typescript
// src/lib/semantic-scholar/client.ts
async autocompletePapers(query: string): Promise<PaperSuggestion[]> {
  const response = await this.client.get('/paper/autocomplete', {
    params: { query: query.substring(0, 100) }
  });
  return response.data.data;
}
```

**활용**:

- 검색창 자동완성 (실시간 제안)
- 타이핑 중 관련 논문 미리보기

---

## 6. 구현 예시 코드

### Client 확장 (`src/lib/semantic-scholar/client.ts`)

```typescript
export class SemanticScholarClient {
  // ... existing methods ...

  /**
   * Find paper by exact title match
   */
  async matchPaperByTitle(
    title: string,
    fields?: string[]
  ): Promise<Paper | null> {
    const cacheKey = `${CACHE_PREFIX}match:${title}`;

    try {
      // Check cache
      const cached = await getCache<Paper>(cacheKey);
      if (cached) return cached;

      // API call
      const response = await this.executeWithRetry(() =>
        this.client.get('/paper/search/match', {
          params: {
            query: title,
            fields: fields?.join(',') || DEFAULT_FIELDS,
          },
        })
      );

      const paper = response.data.data[0] || null;

      // Cache result
      if (paper) {
        await setCache(cacheKey, paper, CACHE_TTL);
      }

      return paper;
    } catch (error) {
      console.error('Error matching paper by title:', error);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get papers citing this paper
   */
  async getPaperCitations(
    paperId: string,
    options?: {
      fields?: string[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ data: Citation[]; total: number }> {
    try {
      const response = await this.executeWithRetry(() =>
        this.client.get(`/paper/${paperId}/citations`, {
          params: {
            fields:
              options?.fields?.join(',') ||
              'citingPaper.paperId,citingPaper.title,citingPaper.year,contexts,intents,isInfluential',
            limit: options?.limit || 100,
            offset: options?.offset || 0,
          },
        })
      );

      return {
        data: response.data.data,
        total: response.data.total || response.data.data.length,
      };
    } catch (error) {
      console.error('Error getting paper citations:', error);
      throw this.handleApiError(error);
    }
  }

  /**
   * Get papers referenced by this paper
   */
  async getPaperReferences(
    paperId: string,
    options?: {
      fields?: string[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ data: Reference[]; total: number }> {
    try {
      const response = await this.executeWithRetry(() =>
        this.client.get(`/paper/${paperId}/references`, {
          params: {
            fields:
              options?.fields?.join(',') ||
              'citedPaper.paperId,citedPaper.title,citedPaper.year,contexts,intents,isInfluential',
            limit: options?.limit || 100,
            offset: options?.offset || 0,
          },
        })
      );

      return {
        data: response.data.data,
        total: response.data.total || response.data.data.length,
      };
    } catch (error) {
      console.error('Error getting paper references:', error);
      throw this.handleApiError(error);
    }
  }
}
```

### Types 추가 (`src/lib/semantic-scholar/types.ts`)

```typescript
export interface Citation {
  citingPaper: Paper;
  contexts: string[];
  intents: string[];
  isInfluential: boolean;
}

export interface Reference {
  citedPaper: Paper;
  contexts: string[];
  intents: string[];
  isInfluential: boolean;
}

export interface Snippet {
  snippet: string;
  section: string;
  paperId: string;
  score: number;
}

export interface Author {
  authorId: string;
  name: string;
  hIndex?: number;
  citationCount?: number;
  paperCount?: number;
}

export interface PaperSuggestion {
  paperId: string;
  title: string;
  year?: number;
}
```

---

## 7. 참고 자료

- **Official API Documentation**: https://api.semanticscholar.org/api-docs/
- **API Tutorial**: https://www.semanticscholar.org/product/api/tutorial
- **Swagger/OpenAPI Spec**: https://api.semanticscholar.org/graph/v1/swagger.json
- **FAQ**: https://www.semanticscholar.org/faq

---

## 8. Rate Limits & Best Practices

### Rate Limits

- **API Key 없이**: 1,000 requests/sec (shared)
- **API Key 있음**: 1 req/sec (기본), 검토 후 증가 가능

### Best Practices

1. **필드 선택적 요청**: `fields` 파라미터로 필요한 필드만 요청 (응답 크기 최적화)
2. **Batch 엔드포인트 활용**: 여러 논문 조회 시 `/paper/batch` 사용
3. **캐싱**: Redis로 24시간 캐싱 (현재 구현됨)
4. **Continuation Token**: Bulk Search에서 대량 데이터 조회 시 사용
5. **에러 핸들링**: 429 에러 시 exponential backoff (현재 구현됨)

---

**마지막 업데이트**: 2025-11-17
