# src/lib/ 코드 정리 분석

> 분석 날짜: 2025-12-15
> 분석 대상: `src/lib/` 폴더 내 모든 파일

## 요약

| 카테고리           | 파일/폴더 수 | 상태                 |
| ------------------ | ------------ | -------------------- |
| 삭제 가능          | 4개          | 사용되지 않음        |
| 정리 필요 (export) | 2개          | 사용되지 않는 export |
| 유지               | 나머지 전체  | 사용 중              |

---

## 삭제 가능한 파일/폴더

### 1. `src/lib/citations/` (폴더 전체)

**파일**: `validator.ts`

**원래 기능**: Gemini 응답에서 인용(citation)을 검증하고 enrichment하는 유틸리티

- `validateAndEnrichCitations()`: LLM이 인용한 논문들이 실제로 컬렉션에 존재하는지 검증하고, hallucination을 필터링
- `isPaperInCollection()`: 특정 논문이 컬렉션에 있는지 확인
- `getCitationMetadata()`: 인용된 논문들의 메타데이터 조회

**사용되지 않는 이유**: 현재 RAG 시스템(`src/lib/rag/index.ts`)에서 인용 검증 로직을 직접 처리하고 있음. 이 모듈은 초기 설계 단계에서 만들어졌으나 실제 구현에서는 사용되지 않음.

**삭제 명령**:

```bash
rm -rf src/lib/citations/
```

---

### 2. `src/lib/gemini/keyword-extraction.ts`

**원래 기능**: 자연어 연구 쿼리를 Semantic Scholar 검색 키워드로 변환

- `extractKeywords()`: Gemini를 사용해 "hardware neural network 전반에 대해 알고 싶어" 같은 자연어를 `("hardware neural network" | "neuromorphic computing") +(survey | review)` 형식의 검색 쿼리로 변환
- 한국어/영어 혼합 쿼리도 처리 가능

**사용되지 않는 이유**: 현재 `query-expand.ts`가 이 역할을 대신하고 있음. 두 모듈의 기능이 유사하여 query-expand만 사용 중.

**삭제 명령**:

```bash
rm src/lib/gemini/keyword-extraction.ts
```

**추가 작업**: `src/lib/gemini/index.ts`에서 `extractKeywords` export 제거 필요

---

### 3. `src/lib/pdf/figure-pipeline.ts`

**원래 기능**: PDF에서 Figure/Table 추출 및 분석을 위한 전체 파이프라인 오케스트레이션

- `processPdfFigures()`: PDF → 페이지 렌더링 → pdffigures2로 Figure 감지 → 이미지 크롭 → Gemini Vision으로 분석
- 진행률 콜백, 동시 처리 제어, 분석 스킵 옵션 등 제공

**사용되지 않는 이유**: `figureAnalysisWorker.ts`에서 파이프라인 로직을 직접 구현하여 사용 중. 이 파일의 개별 함수들(`renderer.ts`, `figure-extractor.ts`, `figure-analyzer.ts` 등)은 사용되지만, 이 오케스트레이션 레이어는 사용되지 않음.

**삭제 명령**:

```bash
rm src/lib/pdf/figure-pipeline.ts
```

---

### 4. `src/lib/search/` (폴더 전체)

**파일**: `index.ts`, `search-with-reranking.ts`, `types.ts`

**원래 기능**: Semantic Scholar 검색 결과를 SPECTER 임베딩으로 재순위화(re-ranking)

- `searchWithReranking()`:
  1. Semantic Scholar에서 논문 검색 (최대 10,000개)
  2. SPECTER API로 사용자 쿼리 임베딩 생성
  3. 배치 API로 논문 임베딩 가져오기
  4. 코사인 유사도로 재순위화하여 상위 N개 반환

**사용되지 않는 이유**: 현재 expand/auto-expand 기능에서 `specter-client.ts`를 직접 사용하여 유사도 계산을 수행 중. 이 재순위화 파이프라인은 초기 설계 단계에서 만들어졌으나 실제 구현에서는 다른 방식 채택.

**삭제 명령**:

```bash
rm -rf src/lib/search/
```

**주의**: `src/lib/search/types.ts`의 타입들이 다른 곳에서 import되고 있음. 삭제 전 다음 파일들의 import 수정 필요:

- `src/hooks/useAutoExpandPreview.ts`
- `src/hooks/useExpandPreview.ts`
- `src/components/graph/PaperGraph.tsx`
- `src/components/collections/PaperPreviewDialog.tsx`
- `src/components/collections/PaperPreviewCard.tsx`
- `src/components/collections/AutoExpandDialog.tsx`
- `src/app/api/collections/[id]/expand/preview/route.ts`
- `src/app/api/collections/[id]/auto-expand/preview/route.ts`

---

## 정리 필요한 export

### 1. `src/lib/gemini/index.ts`

`extractKeywords` re-export 제거 필요 (keyword-extraction.ts 삭제 후)

**수정 전**:

```typescript
export { extractKeywords } from './keyword-extraction';
```

**수정 후**: 해당 라인 삭제

---

### 2. `src/lib/rag/index.ts`

`vectorSearch` re-export 제거 가능 (내부에서만 사용, 외부 사용처 없음)

**현재 코드** (549행):

```typescript
export { hybridSearch, vectorSearch } from './search';
```

**수정 후**:

```typescript
export { hybridSearch } from './search';
```

---

## 유지해야 할 폴더 (모두 사용 중)

| 폴더                | 파일 수 | 상태                                     |
| ------------------- | ------- | ---------------------------------------- |
| `utils/`            | 2       | 모두 사용 중                             |
| `utils.ts`          | 1       | shadcn/ui cn() 함수 - 26개 파일에서 사용 |
| `db/`               | 5       | 모두 사용 중                             |
| `gemini/`           | 4       | keyword-extraction 제외 모두 사용 중     |
| `jobs/`             | 5       | 모두 사용 중                             |
| `pdf/`              | 10      | figure-pipeline 제외 모두 사용 중        |
| `rag/`              | 5       | 모두 사용 중                             |
| `redis/`            | 1       | 사용 중                                  |
| `semantic-scholar/` | 3       | 모두 사용 중                             |
| `storage/`          | 2       | 모두 사용 중                             |
| `supabase/`         | 2       | 모두 사용 중                             |
| `validations/`      | 4       | 모두 사용 중                             |

---

## 삭제 전 체크리스트

- [ ] `src/lib/search/types.ts`에서 사용되는 타입들을 다른 위치로 이동하거나 inline 처리
- [ ] `src/lib/gemini/index.ts`에서 `extractKeywords` export 제거
- [ ] `src/lib/rag/index.ts`에서 `vectorSearch` export 제거 (선택)
- [ ] 삭제 후 `npm run build`로 빌드 확인
- [ ] 삭제 후 `npm run dev`로 개발 서버 정상 동작 확인

---

## 일괄 삭제 스크립트

```bash
# 1. citations 폴더 삭제
rm -rf src/lib/citations/

# 2. keyword-extraction.ts 삭제
rm src/lib/gemini/keyword-extraction.ts

# 3. figure-pipeline.ts 삭제
rm src/lib/pdf/figure-pipeline.ts

# 4. search 폴더 삭제 (types.ts 이동 후)
rm -rf src/lib/search/

# 5. 빌드 확인
npm run build
```
