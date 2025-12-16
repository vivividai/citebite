# Figure Extraction Debugging Guide

이 문서는 pdffigures2 기반 figure 추출 파이프라인 디버깅 시 유용한 정보를 정리합니다.

## 알려진 pdffigures2 한계

### 1. 감지 실패 (Detection Failures)

pdffigures2가 일부 figure를 감지하지 못하는 경우:

- 복잡한 레이아웃 (multi-column)
- 멀티패널 figure (Figure 2a, 2b 등)
- 비표준 캡션 형식
- 텍스트와 겹치는 figure

**발생 빈도**: 논문당 1-4개 figure 누락 가능

### 2. 잘못된 페이지/좌표 할당 (Wrong Page Assignment)

pdffigures2가 figure를 잘못된 페이지에 할당하고 좌표가 페이지 범위(100%)를 초과하는 경우:

```
예시: Figure 7이 실제로 page 12에 있지만
- pdffigures2 출력: page 11, y: 129%-140%
- 결과: 빈 이미지 또는 잘못된 영역 크롭
```

**발생 빈도**: 테스트 컬렉션 기준 약 30% 논문에서 1-2개 figure 영향

### 3. 캡션 오버플로우 (Caption Overflow)

figure 캡션이 다음 페이지로 넘어가는 경우 y2 좌표가 페이지 높이를 초과:

- 이 케이스는 `d9a69bd` 커밋에서 처리됨
- `convertToNormalizedBoundingBox()`에서 경계 초과 시 조정

## 디버깅 방법

### pdffigures2 원본 출력 확인

```typescript
import { detectFiguresWithPdffigures2 } from '@/lib/pdf/pdffigures2-client';

const figures = await detectFiguresWithPdffigures2(pdfBuffer);
for (const fig of figures) {
  const boundary = fig.imageBoundary || fig.regionBoundary;
  console.log(`${fig.figType} ${fig.name}:`);
  console.log(`  Page: ${fig.page + 1} (0-indexed: ${fig.page})`);
  console.log(
    `  BBox (72dpi): ${boundary.x2 - boundary.x1}w x ${boundary.y2 - boundary.y1}h`
  );
  console.log(`  Caption: ${fig.caption.substring(0, 80)}...`);
}
```

### 좌표 유효성 검증

페이지 좌표가 100%를 초과하는지 확인:

```typescript
import { renderPdfPagesStream } from '@/lib/pdf/renderer';

// 페이지 렌더링 (150 DPI)
const pages = [];
for await (const page of renderPdfPagesStream(pdfBuffer, { dpi: 150 })) {
  pages.push(page);
}

// 좌표 검증
for (const fig of figures) {
  const page = pages[fig.page];
  const pageHeight72dpi = page.height / (150 / 72); // 72 DPI로 변환

  const y1Percent = (fig.regionBoundary.y1 / pageHeight72dpi) * 100;
  const y2Percent = (fig.regionBoundary.y2 / pageHeight72dpi) * 100;

  if (y1Percent > 100 || y2Percent > 100) {
    console.warn(
      `⚠️ ${fig.figType} ${fig.name}: y=${y1Percent.toFixed(0)}%-${y2Percent.toFixed(0)}% EXCEEDS PAGE!`
    );
  }
}
```

### Storage에 저장된 figure 확인

```typescript
const { data: files } = await supabase.storage
  .from('pdfs')
  .list(`figures/${paperId}`, { sortBy: { column: 'name', order: 'asc' } });

console.log(
  'Stored figures:',
  files?.map(f => f.name)
);
```

### DB에 인덱싱된 figure 확인

```typescript
const { data: chunks } = await supabase
  .from('paper_chunks')
  .select('figure_number, page_number, image_storage_path')
  .eq('paper_id', paperId)
  .eq('chunk_type', 'figure')
  .order('chunk_index', { ascending: true });

console.log('Indexed figures:', chunks);
```

## 파이프라인 구조

```
PDF Buffer
    ↓
detectFiguresWithPdffigures2()     ← pdffigures2 Docker API 호출
    ↓
convertToDetectedFigures()         ← 좌표 변환 (72 DPI → normalized)
    ↓
extractFiguresFromPage()           ← Sharp로 이미지 크롭
    ↓
analyzeFigureWithProvidedContext() ← Gemini Vision 분석
    ↓
indexAnalyzedFigures()             ← Storage 업로드 + DB 인덱싱
```

## 주요 파일 위치

| 파일                                           | 역할                            |
| ---------------------------------------------- | ------------------------------- |
| `src/lib/pdf/pdffigures2-client.ts`            | pdffigures2 API 호출, 좌표 변환 |
| `src/lib/pdf/figure-extractor.ts`              | 이미지 크롭 (Sharp)             |
| `src/lib/pdf/figure-pipeline.ts`               | 전체 파이프라인 오케스트레이션  |
| `src/lib/rag/figure-indexer.ts`                | Storage 업로드, DB 인덱싱       |
| `src/lib/jobs/workers/figureAnalysisWorker.ts` | BullMQ 워커                     |

## 좌표계 참고

- **pdffigures2 출력**: 72 DPI 기준 픽셀 좌표, Y축 아래 방향, 0-indexed 페이지
- **렌더링**: 150 DPI (기본값)
- **정규화 좌표**: 0-1 범위 (페이지 비율)
- **변환 공식**: `scaledCoord = coord72dpi * (renderedDpi / 72)`
