# Multimodal RAG Implementation Plan

> **Implementation Status: COMPLETED (Phase 1-7)**
>
> All core phases have been implemented:
>
> - Phase 1: Dependencies installed (pdfjs-dist, canvas, sharp), DB migration applied
> - Phase 2: Figure reference extractor, chunker with figure refs, PDF renderer
> - Phase 3: Figure detector (Gemini Vision), figure image extractor/cropper
> - Phase 4: Figure context finder, figure analyzer with text context, figure pipeline, storage, indexer
> - Phase 5: Updated hybrid_search SQL function, search postprocessor, RAG context builder
> - Phase 6: Extended pdfIndexWorker for multimodal processing
> - Phase 7: FigureInline UI component, updated message rendering for figure display
>
> Enable multimodal processing by setting `ENABLE_MULTIMODAL_RAG=true` in `.env.local`.

기존 텍스트 기반 RAG를 멀티모달 RAG로 확장하여 PDF 논문의 Figure, Chart, Diagram을 이해하고 질문에 답변할 수 있도록 합니다.

---

## 1. 개요

### 1.1 현재 상태

| 항목          | 현재 구현                        |
| ------------- | -------------------------------- |
| PDF 파싱      | `pdf-parse`로 순수 텍스트만 추출 |
| 청킹          | 4096자 고정 크기, 600자 overlap  |
| 이미지/그래프 | **완전 무시** (caption 포함)     |
| 테이블        | 구조 없이 텍스트로만 추출        |
| 임베딩        | Gemini embedding-001 (768차원)   |

### 1.2 목표

- **Figure/Chart/Diagram 이해**: 논문 내 시각적 요소의 내용을 AI가 이해하고 질문에 답변
- **인덱싱 시점 처리**: PDF 업로드 시 이미지 분석 → 텍스트 설명 생성 → 저장
- **품질 우선**: 모든 Figure를 상세히 분석, 비용 증가 감수
- **이미지 인라인 표시**: 채팅 응답에서 Figure 이미지를 직접 렌더링
- **텍스트-Figure 연결**: 텍스트 청크에서 Figure 언급 시 자동으로 해당 이미지 제공

### 1.3 핵심 결정사항

| 항목                     | 선택                      | 이유                                       |
| ------------------------ | ------------------------- | ------------------------------------------ |
| 추출 방식                | 페이지 렌더링 + Vision AI | 정확도 높음, 임베디드 이미지 누락 방지     |
| 저장 방식                | paper_chunks 통합         | 검색 통합 용이, 스키마 단순화              |
| Caption 활용             | Vision 분석 시 포함       | 맥락 파악 향상                             |
| 검색 전략                | 통합 검색 (RRF)           | 텍스트와 Figure를 함께 검색                |
| **텍스트-Figure 연결**   | **양방향 참조**           | 텍스트에서 Figure 언급 시 이미지 자동 첨부 |
| **Figure 분석 컨텍스트** | **관련 텍스트 포함**      | 본문 설명을 함께 제공하여 분석 품질 향상   |

---

## 2. 아키텍처 개요

### 2.1 현재 아키텍처 (텍스트 전용)

```
PDF → pdf-parse (텍스트만) → Chunking → Embeddings → pgvector → Search → LLM
```

### 2.2 새로운 아키텍처 (멀티모달 + 양방향 연결)

```
PDF
 │
 ├─→ pdf-parse (텍스트) → Text Chunking → Figure 참조 추출
 │                              │              │
 │                              ↓              │
 │                         Embeddings          │
 │                              │              │
 │                              ↓              │
 │                     paper_chunks (text)     │
 │                     + referenced_figures ←──┘
 │                              │
 └─→ Page Rendering → Vision AI (Figure 감지)
                           │
                           ↓
                      Figure 크롭
                           │
                           ↓
              ┌────────────┴────────────┐
              │                         │
              ↓                         ↓
     관련 텍스트 청크 조회      Supabase Storage
     (Figure를 언급하는 청크)   (Figure 이미지)
              │                         │
              └────────────┬────────────┘
                           │
                           ↓
              Vision AI (Figure 분석 + 텍스트 컨텍스트)
                           │
                           ↓
                    Figure Chunks
                    + mentioned_in_chunk_ids
                           │
                           ↓
                     paper_chunks (통합) → pgvector
                           │
                           ↓
            Hybrid Search + Figure 자동 첨부 → LLM → UI (Figure 인라인)
```

### 2.3 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PDF INDEXING PIPELINE (확장)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ PDF Index Worker                                                            │
│   └─→ Download PDF from Supabase Storage                                    │
│   └─→ [기존] Extract text (pdf-parse)                                       │
│   └─→ [기존] Chunk text                                                     │
│   └─→ [NEW] Extract Figure references from each chunk                       │
│          └─→ Parse "Figure 1", "Fig. 2a", "Table 3" patterns               │
│          └─→ Store in referenced_figures column                             │
│   └─→ [기존] Generate embeddings → Insert text chunks                       │
│   └─→ [NEW] Render each page as image                                       │
│   └─→ [NEW] Detect Figures using Gemini Vision                              │
│   └─→ [NEW] For each Figure:                                                │
│          └─→ Extract Figure image + Caption                                 │
│          └─→ Find text chunks that reference this Figure                    │
│          └─→ Analyze with Gemini Vision (image + caption + related text)    │
│          └─→ Upload Figure image to Supabase Storage                        │
│          └─→ Generate embedding for Figure description                      │
│          └─→ Insert Figure chunk with mentioned_in_chunk_ids                │
│   └─→ Update paper.vector_status = 'completed'                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. RAG QUERY PIPELINE (확장)                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ User Query                                                                  │
│   └─→ Generate query embedding                                              │
│   └─→ Hybrid search (vector + keyword)                                      │
│          └─→ Returns both text and figure chunks                            │
│   └─→ [NEW] Post-process: Find related Figures                              │
│          └─→ For text chunks with referenced_figures                        │
│          └─→ Fetch corresponding Figure chunks                              │
│          └─→ Include Figure image URLs in context                           │
│   └─→ Build context:                                                        │
│          └─→ Text chunks: "[1] content..."                                  │
│          └─→ Figure chunks: "[2] [FIGURE:N] description..."                 │
│          └─→ Related Figures: "[See Figure N for visual]"                   │
│   └─→ Generate response with Gemini                                         │
│   └─→ Parse citations: [CITE:N] and [FIGURE:N]                              │
│   └─→ Return answer + groundingChunks + relatedFigures                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema 변경

### 3.1 paper_chunks 테이블 확장

```sql
-- Migration: add_multimodal_rag.sql

-- 1. chunk_type 컬럼 추가
ALTER TABLE paper_chunks
ADD COLUMN chunk_type VARCHAR(20) NOT NULL DEFAULT 'text'
CHECK (chunk_type IN ('text', 'figure'));

-- 2. Figure 관련 컬럼 추가
ALTER TABLE paper_chunks
ADD COLUMN figure_number VARCHAR(20),           -- "Figure 1", "Fig. 2a" 등
ADD COLUMN figure_caption TEXT,                  -- 원본 caption 텍스트
ADD COLUMN figure_description TEXT,              -- Vision AI가 생성한 상세 설명
ADD COLUMN image_storage_path VARCHAR(500),      -- Supabase Storage 경로
ADD COLUMN page_number INT;                      -- Figure가 위치한 페이지 번호

-- 3. [NEW] 텍스트-Figure 양방향 연결 컬럼
ALTER TABLE paper_chunks
ADD COLUMN referenced_figures VARCHAR(50)[],     -- 텍스트 청크: 참조하는 Figure 목록
ADD COLUMN mentioned_in_chunk_ids UUID[];        -- Figure 청크: 이 Figure를 언급하는 텍스트 청크 ID들

-- 4. Figure 이미지 검색을 위한 인덱스
CREATE INDEX idx_chunks_type ON paper_chunks(chunk_type);
CREATE INDEX idx_chunks_figure_number ON paper_chunks(figure_number)
WHERE chunk_type = 'figure';

-- 5. Figure 참조 검색을 위한 GIN 인덱스
CREATE INDEX idx_chunks_referenced_figures ON paper_chunks USING GIN(referenced_figures)
WHERE chunk_type = 'text';

-- 6. RLS 정책 업데이트 (기존 정책 유지, figure 타입도 동일하게 적용)
```

### 3.2 스키마 다이어그램

```
paper_chunks
├── id UUID (PK)
├── paper_id VARCHAR(255) (FK → papers)
├── collection_id UUID (FK → collections)
├── chunk_type VARCHAR(20) ['text' | 'figure']
│
├── [Text Chunk Fields]
│   ├── content TEXT
│   ├── chunk_index INT
│   ├── token_count INT
│   └── referenced_figures VARCHAR(50)[]     ← NEW (어떤 Figure를 참조하는지)
│
├── [Figure Chunk Fields]
│   ├── figure_number VARCHAR(20)
│   ├── figure_caption TEXT
│   ├── figure_description TEXT
│   ├── image_storage_path VARCHAR(500)
│   ├── page_number INT
│   └── mentioned_in_chunk_ids UUID[]        ← NEW (어떤 텍스트 청크에서 언급되는지)
│
├── embedding vector(768)
├── content_tsv tsvector (자동 생성)
└── created_at TIMESTAMPTZ
```

### 3.3 양방향 연결 다이어그램

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│        Text Chunk               │         │        Figure Chunk             │
│                                 │         │                                 │
│ id: uuid-001                    │────────▶│ id: uuid-100                    │
│ content: "As shown in Figure 1, │         │ figure_number: "Figure 1"       │
│           the results..."       │◀────────│ mentioned_in_chunk_ids:         │
│ referenced_figures:             │         │   [uuid-001, uuid-003]          │
│   ["Figure 1"]                  │         │                                 │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

### 3.4 Figure 저장 시 content 필드 활용

Figure chunk의 `content` 필드에는 검색 가능한 텍스트를 저장:

```
[Figure {figure_number}]
Caption: {figure_caption}
Description: {figure_description}
```

이렇게 하면:

- 기존 하이브리드 검색 (vector + keyword) 그대로 작동
- content_tsv 전문 검색도 Figure에 적용
- 임베딩은 이 결합된 텍스트로 생성

---

## 4. PDF 페이지 렌더링

### 4.1 라이브러리 선택

| 옵션                 | 장점                            | 단점                |
| -------------------- | ------------------------------- | ------------------- |
| **pdf-to-img**       | 간단한 API, 빠름                | poppler 의존성 필요 |
| **pdfjs-dist**       | 브라우저/노드 호환, 의존성 적음 | 복잡한 API          |
| **pdf-lib + canvas** | PDF 조작 가능                   | 렌더링 품질 낮음    |
| **Ghostscript**      | 최고 품질                       | 무거움, 설치 복잡   |

**선택: pdfjs-dist** (node canvas 백엔드)

- 이유: 순수 JS, 추가 시스템 의존성 없음, Vercel 호환

### 4.2 구현 코드

```typescript
// src/lib/pdf/renderer.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';

// Worker 설정 (Node.js 환경)
pdfjs.GlobalWorkerOptions.workerSrc = undefined;

interface RenderedPage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

interface RenderOptions {
  scale: number; // 1.0 = 72 DPI, 2.0 = 144 DPI
  format: 'png' | 'jpeg';
}

const DEFAULT_OPTIONS: RenderOptions = {
  scale: 2.0, // 144 DPI - 충분한 품질
  format: 'png',
};

export async function renderPdfPages(
  pdfBuffer: Buffer,
  options: Partial<RenderOptions> = {}
): Promise<RenderedPage[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // PDF 로드
  const pdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;

  const pages: RenderedPage[] = [];

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: opts.scale });

    // Canvas 생성
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // 렌더링
    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    }).promise;

    // Buffer로 변환
    const imageBuffer =
      opts.format === 'png'
        ? canvas.toBuffer('image/png')
        : canvas.toBuffer('image/jpeg', { quality: 0.9 });

    pages.push({
      pageNumber: pageNum,
      imageBuffer,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}

export async function renderSinglePage(
  pdfBuffer: Buffer,
  pageNumber: number,
  options: Partial<RenderOptions> = {}
): Promise<RenderedPage> {
  const pages = await renderPdfPages(pdfBuffer, options);
  const page = pages.find(p => p.pageNumber === pageNumber);

  if (!page) {
    throw new Error(`Page ${pageNumber} not found`);
  }

  return page;
}
```

### 4.3 메모리 관리

대용량 PDF 처리 시 메모리 최적화:

```typescript
// 페이지별 스트리밍 처리
export async function* renderPdfPagesStream(
  pdfBuffer: Buffer,
  options: Partial<RenderOptions> = {}
): AsyncGenerator<RenderedPage> {
  const pdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await renderSinglePageFromDoc(pdfDocument, pageNum, options);
    yield page;

    // 메모리 해제 힌트
    if (global.gc) global.gc();
  }
}
```

---

## 5. Figure 참조 추출 (텍스트 청크)

### 5.1 Figure 참조 패턴 파싱

텍스트 청킹 시 각 청크에서 Figure 참조를 추출:

```typescript
// src/lib/pdf/figure-reference-extractor.ts

interface FigureReference {
  original: string; // 원본 텍스트 (e.g., "Fig. 2a")
  normalized: string; // 정규화된 형태 (e.g., "Figure 2a")
}

// Figure 참조 패턴들
const FIGURE_PATTERNS = [
  // "Figure 1", "Figure 1a", "Figure 1-3"
  /\bFigure\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)/gi,
  // "Fig. 1", "Fig 2a", "Figs. 1-3"
  /\bFigs?\.?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)/gi,
  // "Table 1", "Tables 1-3"
  /\bTables?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)/gi,
];

export function extractFigureReferences(text: string): FigureReference[] {
  const references: FigureReference[] = [];
  const seen = new Set<string>();

  for (const pattern of FIGURE_PATTERNS) {
    let match;
    // Reset regex lastIndex for each pattern
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const original = match[0].trim();
      const normalized = normalizeFigureReference(original);

      if (!seen.has(normalized)) {
        seen.add(normalized);
        references.push({ original, normalized });
      }
    }
  }

  return references;
}

function normalizeFigureReference(ref: string): string {
  // "Fig. 1" → "Figure 1"
  // "Figs. 1-3" → "Figure 1", "Figure 2", "Figure 3" (expanded)
  let normalized = ref
    .replace(/\bFigs?\.?\s*/gi, 'Figure ')
    .replace(/\bTables?\s*/gi, 'Table ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

// 범위 참조 확장 (e.g., "Figure 1-3" → ["Figure 1", "Figure 2", "Figure 3"])
export function expandFigureRange(ref: string): string[] {
  const rangeMatch = ref.match(/^(Figure|Table)\s*(\d+)\s*[-–]\s*(\d+)$/i);

  if (rangeMatch) {
    const [, type, start, end] = rangeMatch;
    const startNum = parseInt(start, 10);
    const endNum = parseInt(end, 10);
    const result: string[] = [];

    for (let i = startNum; i <= endNum; i++) {
      result.push(`${type} ${i}`);
    }
    return result;
  }

  return [ref];
}
```

### 5.2 청킹 시 Figure 참조 저장

```typescript
// src/lib/rag/chunker.ts (확장)

interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  referencedFigures: string[]; // NEW
}

export function chunkTextWithFigureRefs(text: string): TextChunk[] {
  const rawChunks = chunkText(text); // 기존 청킹 로직

  return rawChunks.map((chunk, index) => {
    const refs = extractFigureReferences(chunk.content);
    const expandedRefs = refs.flatMap(r => expandFigureRange(r.normalized));

    return {
      ...chunk,
      chunkIndex: index,
      referencedFigures: [...new Set(expandedRefs)], // 중복 제거
    };
  });
}
```

---

## 6. Figure 감지 및 추출

### 6.1 Gemini Vision을 이용한 Figure 감지

각 페이지 이미지를 Gemini Vision에 전송하여 Figure 감지:

````typescript
// src/lib/pdf/figure-detector.ts
import { getGeminiClient } from '@/lib/gemini/client';

interface DetectedFigure {
  figureNumber: string; // "Figure 1", "Fig. 2a"
  caption: string; // Figure 아래의 caption 텍스트
  boundingBox: {
    // Figure 영역 (정규화된 좌표 0-1)
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type: 'chart' | 'diagram' | 'image' | 'table' | 'other';
}

interface PageAnalysis {
  pageNumber: number;
  figures: DetectedFigure[];
}

const FIGURE_DETECTION_PROMPT = `
Analyze this academic paper page and identify all figures, charts, diagrams, and tables.

For each visual element found, provide:
1. Figure number (e.g., "Figure 1", "Fig. 2a", "Table 1")
2. Caption text (the description below or above the figure)
3. Bounding box coordinates (x, y, width, height as percentages 0-1 of page dimensions)
4. Type: chart | diagram | image | table | other

Return JSON array format:
[
  {
    "figureNumber": "Figure 1",
    "caption": "Overview of the proposed architecture...",
    "boundingBox": {"x": 0.1, "y": 0.3, "width": 0.8, "height": 0.4},
    "type": "diagram"
  }
]

If no figures are found, return an empty array: []

Important:
- Include ALL visual elements (figures, charts, tables, diagrams)
- Extract the COMPLETE caption text
- Coordinates should be approximate but reasonably accurate
`;

export async function detectFiguresInPage(
  pageImage: Buffer,
  pageNumber: number
): Promise<PageAnalysis> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: pageImage.toString('base64'),
            },
          },
          { text: FIGURE_DETECTION_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text || '[]';

  try {
    // JSON 파싱 (마크다운 코드 블록 제거)
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
    const figures = JSON.parse(jsonStr) as DetectedFigure[];

    return {
      pageNumber,
      figures: figures.filter(f => f.figureNumber && f.boundingBox),
    };
  } catch (error) {
    console.warn(`Failed to parse figures for page ${pageNumber}:`, error);
    return { pageNumber, figures: [] };
  }
}
````

### 6.2 Figure 이미지 크롭

감지된 영역에서 Figure 이미지 추출:

```typescript
// src/lib/pdf/figure-extractor.ts
import sharp from 'sharp';

interface CroppedFigure {
  figureNumber: string;
  normalizedFigureNumber: string; // 정규화된 형태 (텍스트 참조와 매칭용)
  caption: string;
  type: string;
  imageBuffer: Buffer;
  pageNumber: number;
}

export async function extractFigureImage(
  pageImage: Buffer,
  pageWidth: number,
  pageHeight: number,
  figure: DetectedFigure,
  pageNumber: number
): Promise<CroppedFigure> {
  const { boundingBox } = figure;

  // 정규화된 좌표를 픽셀 좌표로 변환
  const left = Math.floor(boundingBox.x * pageWidth);
  const top = Math.floor(boundingBox.y * pageHeight);
  const width = Math.floor(boundingBox.width * pageWidth);
  const height = Math.floor(boundingBox.height * pageHeight);

  // 약간의 패딩 추가 (5%)
  const padding = 0.05;
  const paddedLeft = Math.max(0, left - width * padding);
  const paddedTop = Math.max(0, top - height * padding);
  const paddedWidth = Math.min(
    pageWidth - paddedLeft,
    width * (1 + 2 * padding)
  );
  const paddedHeight = Math.min(
    pageHeight - paddedTop,
    height * (1 + 2 * padding)
  );

  // Sharp로 크롭
  const croppedBuffer = await sharp(pageImage)
    .extract({
      left: Math.round(paddedLeft),
      top: Math.round(paddedTop),
      width: Math.round(paddedWidth),
      height: Math.round(paddedHeight),
    })
    .png()
    .toBuffer();

  return {
    figureNumber: figure.figureNumber,
    normalizedFigureNumber: normalizeFigureNumber(figure.figureNumber),
    caption: figure.caption,
    type: figure.type,
    imageBuffer: croppedBuffer,
    pageNumber,
  };
}

function normalizeFigureNumber(figureNumber: string): string {
  // "Fig. 1" → "Figure 1", "TABLE 2" → "Table 2"
  return figureNumber
    .replace(/\bFig\.?\s*/gi, 'Figure ')
    .replace(/\bTABLE\b/gi, 'Table')
    .replace(/\s+/g, ' ')
    .trim();
}
```

---

## 7. Figure 분석 (Gemini Vision + 텍스트 컨텍스트)

### 7.1 관련 텍스트 청크 조회

Figure 분석 전에 해당 Figure를 언급하는 텍스트 청크들을 조회:

```typescript
// src/lib/pdf/figure-context.ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

interface RelatedTextChunk {
  id: string;
  content: string;
  chunkIndex: number;
}

export async function findChunksThatReferenceFigure(
  paperId: string,
  collectionId: string,
  figureNumber: string // 정규화된 형태: "Figure 1"
): Promise<RelatedTextChunk[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from('paper_chunks')
    .select('id, content, chunk_index')
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'text')
    .contains('referenced_figures', [figureNumber])
    .order('chunk_index', { ascending: true })
    .limit(5); // 관련성 높은 상위 5개

  if (error) {
    console.warn(`Failed to find related chunks for ${figureNumber}:`, error);
    return [];
  }

  return data.map(d => ({
    id: d.id,
    content: d.content,
    chunkIndex: d.chunk_index,
  }));
}
```

### 7.2 상세 분석 프롬프트 (텍스트 컨텍스트 포함)

```typescript
// src/lib/pdf/figure-analyzer.ts
import { getGeminiClient } from '@/lib/gemini/client';
import { findChunksThatReferenceFigure } from './figure-context';

interface FigureAnalysis {
  figureNumber: string;
  normalizedFigureNumber: string;
  caption: string;
  description: string; // Vision AI가 생성한 상세 설명
  pageNumber: number;
  imageBuffer: Buffer;
  mentionedInChunkIds: string[]; // 이 Figure를 언급하는 텍스트 청크 ID들
}

const FIGURE_ANALYSIS_PROMPT_WITH_CONTEXT = `
You are analyzing a figure from an academic research paper.

Figure Information:
- Figure Number: {figureNumber}
- Caption: {caption}

Related text from the paper that discusses this figure:
---
{relatedTextContext}
---

Based on BOTH the image AND the text context above, provide a comprehensive description of this figure.

Your description should include:
1. What type of visualization this is (bar chart, line graph, flowchart, architecture diagram, etc.)
2. Key elements and their relationships
3. Main findings or insights shown (use specific numbers/data if mentioned in the text)
4. Any trends, patterns, or notable data points
5. Labels, axes, legends if applicable
6. The significance of this figure in the context of the paper

Write 3-5 paragraphs. Be precise and technical. Focus on information that would be relevant for answering research questions about this paper.

IMPORTANT: Incorporate insights from the related text to provide a more complete understanding. The text often explains what the figure demonstrates or why it's significant.

Do NOT start with "This figure shows..." - instead, directly describe the content.
`;

const FIGURE_ANALYSIS_PROMPT_NO_CONTEXT = `
You are analyzing a figure from an academic research paper.

Figure Information:
- Figure Number: {figureNumber}
- Caption: {caption}

Provide a detailed description of this figure that would help a researcher understand its content without seeing the image.

Your description should include:
1. What type of visualization this is (bar chart, line graph, flowchart, architecture diagram, etc.)
2. Key elements and their relationships
3. Main findings or insights shown
4. Any trends, patterns, or notable data points
5. Labels, axes, legends if applicable

Write 3-5 paragraphs. Be precise and technical. Focus on the information that would be relevant for answering research questions about this paper.

Do NOT start with "This figure shows..." - instead, directly describe the content.
`;

export async function analyzeFigure(
  croppedFigure: CroppedFigure,
  paperId: string,
  collectionId: string
): Promise<FigureAnalysis> {
  const client = getGeminiClient();

  // 1. 관련 텍스트 청크 조회
  const relatedChunks = await findChunksThatReferenceFigure(
    paperId,
    collectionId,
    croppedFigure.normalizedFigureNumber
  );

  // 2. 프롬프트 구성
  let prompt: string;
  if (relatedChunks.length > 0) {
    const relatedTextContext = relatedChunks
      .map((chunk, i) => `[Text ${i + 1}]:\n${chunk.content}`)
      .join('\n\n');

    prompt = FIGURE_ANALYSIS_PROMPT_WITH_CONTEXT.replace(
      '{figureNumber}',
      croppedFigure.figureNumber
    )
      .replace('{caption}', croppedFigure.caption || 'No caption available')
      .replace('{relatedTextContext}', relatedTextContext);
  } else {
    prompt = FIGURE_ANALYSIS_PROMPT_NO_CONTEXT.replace(
      '{figureNumber}',
      croppedFigure.figureNumber
    ).replace('{caption}', croppedFigure.caption || 'No caption available');
  }

  // 3. Vision AI 분석
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: croppedFigure.imageBuffer.toString('base64'),
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });

  return {
    figureNumber: croppedFigure.figureNumber,
    normalizedFigureNumber: croppedFigure.normalizedFigureNumber,
    caption: croppedFigure.caption,
    description: response.text || '',
    pageNumber: croppedFigure.pageNumber,
    imageBuffer: croppedFigure.imageBuffer,
    mentionedInChunkIds: relatedChunks.map(c => c.id),
  };
}
```

### 7.3 배치 처리

여러 Figure를 효율적으로 처리:

```typescript
// src/lib/pdf/figure-pipeline.ts

const CONCURRENT_ANALYSIS = 3; // 동시 분석 수 제한

export async function analyzeAllFigures(
  figures: CroppedFigure[],
  paperId: string,
  collectionId: string
): Promise<FigureAnalysis[]> {
  const results: FigureAnalysis[] = [];

  // 배치로 나누어 처리
  for (let i = 0; i < figures.length; i += CONCURRENT_ANALYSIS) {
    const batch = figures.slice(i, i + CONCURRENT_ANALYSIS);

    const batchResults = await Promise.all(
      batch.map(fig => analyzeFigure(fig, paperId, collectionId))
    );

    results.push(...batchResults);

    // Rate limit 대응: 배치 간 지연
    if (i + CONCURRENT_ANALYSIS < figures.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
```

---

## 8. 저장 및 인덱싱

### 8.1 Figure 이미지 Storage 업로드

```typescript
// src/lib/storage/figures.ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function uploadFigureImage(
  imageBuffer: Buffer,
  paperId: string,
  figureNumber: string
): Promise<string> {
  const supabase = createAdminSupabaseClient();

  // 파일명 생성 (Figure 1 → figure-1.png)
  const safeFigureNumber = figureNumber
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const path = `figures/${paperId}/${safeFigureNumber}.png`;

  const { data, error } = await supabase.storage
    .from('pdfs') // 기존 버킷 재사용
    .upload(path, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload figure: ${error.message}`);
  }

  return path;
}

export function getFigurePublicUrl(storagePath: string): string {
  const supabase = createAdminSupabaseClient();

  const { data } = supabase.storage.from('pdfs').getPublicUrl(storagePath);

  return data.publicUrl;
}
```

### 8.2 Figure Chunk 생성 및 저장

```typescript
// src/lib/rag/figure-indexer.ts
import { generateDocumentEmbeddings } from './embeddings';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { uploadFigureImage } from '@/lib/storage/figures';

interface FigureChunkInput {
  paperId: string;
  collectionId: string;
  figureNumber: string;
  normalizedFigureNumber: string;
  caption: string;
  description: string;
  imageBuffer: Buffer;
  pageNumber: number;
  mentionedInChunkIds: string[];
}

export async function indexFigures(
  figures: FigureChunkInput[]
): Promise<number> {
  if (figures.length === 0) return 0;

  const supabase = createAdminSupabaseClient();

  // 1. 이미지 업로드
  const storagePaths = await Promise.all(
    figures.map(fig =>
      uploadFigureImage(
        fig.imageBuffer,
        fig.paperId,
        fig.normalizedFigureNumber
      )
    )
  );

  // 2. 검색용 content 생성
  const contents = figures.map((fig, i) =>
    buildFigureContent(fig.figureNumber, fig.caption, fig.description)
  );

  // 3. 임베딩 생성
  const embeddings = await generateDocumentEmbeddings(contents);

  // 4. DB 삽입
  const records = figures.map((fig, i) => ({
    paper_id: fig.paperId,
    collection_id: fig.collectionId,
    chunk_type: 'figure',
    content: contents[i],
    chunk_index: 10000 + i, // Figure는 텍스트 청크 이후 인덱스
    token_count: Math.ceil(contents[i].length / 4),
    figure_number: fig.normalizedFigureNumber,
    figure_caption: fig.caption,
    figure_description: fig.description,
    image_storage_path: storagePaths[i],
    page_number: fig.pageNumber,
    mentioned_in_chunk_ids: fig.mentionedInChunkIds,
    embedding: embeddings[i],
  }));

  const { error } = await supabase.from('paper_chunks').upsert(records, {
    onConflict: 'paper_id,collection_id,chunk_index',
  });

  if (error) {
    throw new Error(`Failed to index figures: ${error.message}`);
  }

  return records.length;
}

function buildFigureContent(
  figureNumber: string,
  caption: string,
  description: string
): string {
  return `[${figureNumber}]
Caption: ${caption || 'No caption'}

${description}`.trim();
}
```

---

## 9. 검색 함수 수정

### 9.1 hybrid_search 함수 확장

```sql
-- Migration: update_hybrid_search_multimodal.sql

CREATE OR REPLACE FUNCTION hybrid_search(
  p_collection_id UUID,
  p_query_embedding vector(768),
  p_query_text TEXT,
  p_limit INT DEFAULT 20,
  p_semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id UUID,
  paper_id VARCHAR(255),
  content TEXT,
  chunk_index INT,
  chunk_type VARCHAR(20),
  figure_number VARCHAR(20),
  figure_caption TEXT,
  figure_description TEXT,
  image_storage_path VARCHAR(500),
  page_number INT,
  referenced_figures VARCHAR(50)[],      -- NEW
  mentioned_in_chunk_ids UUID[],         -- NEW
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
WITH semantic AS (
  SELECT id, paper_id, content, chunk_index,
    chunk_type, figure_number, figure_caption,
    figure_description, image_storage_path, page_number,
    referenced_figures, mentioned_in_chunk_ids,
    1 - (embedding <=> p_query_embedding) AS score,
    ROW_NUMBER() OVER (ORDER BY embedding <=> p_query_embedding) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit * 2
),
keyword AS (
  SELECT id, paper_id, content, chunk_index,
    chunk_type, figure_number, figure_caption,
    figure_description, image_storage_path, page_number,
    referenced_figures, mentioned_in_chunk_ids,
    ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) AS score,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) DESC) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
    AND content_tsv @@ plainto_tsquery('english', p_query_text)
  LIMIT p_limit * 2
)
SELECT
  COALESCE(s.id, k.id) AS chunk_id,
  COALESCE(s.paper_id, k.paper_id) AS paper_id,
  COALESCE(s.content, k.content) AS content,
  COALESCE(s.chunk_index, k.chunk_index) AS chunk_index,
  COALESCE(s.chunk_type, k.chunk_type) AS chunk_type,
  COALESCE(s.figure_number, k.figure_number) AS figure_number,
  COALESCE(s.figure_caption, k.figure_caption) AS figure_caption,
  COALESCE(s.figure_description, k.figure_description) AS figure_description,
  COALESCE(s.image_storage_path, k.image_storage_path) AS image_storage_path,
  COALESCE(s.page_number, k.page_number) AS page_number,
  COALESCE(s.referenced_figures, k.referenced_figures) AS referenced_figures,
  COALESCE(s.mentioned_in_chunk_ids, k.mentioned_in_chunk_ids) AS mentioned_in_chunk_ids,
  COALESCE(s.score, 0)::FLOAT AS semantic_score,
  COALESCE(k.score, 0)::FLOAT AS keyword_score,
  (p_semantic_weight * COALESCE(1.0 / (60 + s.rank), 0) +
   (1 - p_semantic_weight) * COALESCE(1.0 / (60 + k.rank), 0))::FLOAT AS combined_score
FROM semantic s
FULL OUTER JOIN keyword k ON s.id = k.id
ORDER BY combined_score DESC
LIMIT p_limit;
$$ LANGUAGE SQL;
```

### 9.2 Search 결과 타입 확장

```typescript
// src/lib/rag/search.ts

export interface SearchResult {
  chunkId: string;
  paperId: string;
  content: string;
  chunkIndex: number;
  chunkType: 'text' | 'figure';
  figureNumber?: string;
  figureCaption?: string;
  figureDescription?: string;
  imageStoragePath?: string;
  imageUrl?: string; // 변환된 public URL
  pageNumber?: number;
  referencedFigures?: string[]; // NEW: 텍스트 청크가 참조하는 Figure들
  mentionedInChunkIds?: string[]; // NEW: Figure가 언급되는 텍스트 청크들
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}
```

### 9.3 검색 결과 후처리: 관련 Figure 자동 첨부

```typescript
// src/lib/rag/search-postprocessor.ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getFigurePublicUrl } from '@/lib/storage/figures';

export interface EnrichedSearchResults {
  chunks: SearchResult[];
  relatedFigures: SearchResult[]; // 텍스트 청크에서 참조된 Figure들
}

export async function enrichSearchResultsWithFigures(
  results: SearchResult[],
  collectionId: string
): Promise<EnrichedSearchResults> {
  // 1. 이미 포함된 Figure들의 번호 수집
  const includedFigureNumbers = new Set(
    results.filter(r => r.chunkType === 'figure').map(r => r.figureNumber)
  );

  // 2. 텍스트 청크에서 참조된 Figure 번호 수집 (아직 포함되지 않은 것만)
  const referencedFigureNumbers = new Set<string>();
  for (const result of results) {
    if (result.chunkType === 'text' && result.referencedFigures) {
      for (const figNum of result.referencedFigures) {
        if (!includedFigureNumbers.has(figNum)) {
          referencedFigureNumbers.add(figNum);
        }
      }
    }
  }

  // 3. 참조된 Figure 청크 조회
  let relatedFigures: SearchResult[] = [];
  if (referencedFigureNumbers.size > 0) {
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from('paper_chunks')
      .select('*')
      .eq('collection_id', collectionId)
      .eq('chunk_type', 'figure')
      .in('figure_number', Array.from(referencedFigureNumbers));

    if (!error && data) {
      relatedFigures = data.map(mapToSearchResult);
    }
  }

  // 4. 모든 결과에 imageUrl 추가
  const enrichedChunks = results.map(r => {
    if (r.chunkType === 'figure' && r.imageStoragePath) {
      return { ...r, imageUrl: getFigurePublicUrl(r.imageStoragePath) };
    }
    return r;
  });

  const enrichedRelatedFigures = relatedFigures.map(r => {
    if (r.imageStoragePath) {
      return { ...r, imageUrl: getFigurePublicUrl(r.imageStoragePath) };
    }
    return r;
  });

  return {
    chunks: enrichedChunks,
    relatedFigures: enrichedRelatedFigures,
  };
}

function mapToSearchResult(row: any): SearchResult {
  return {
    chunkId: row.id,
    paperId: row.paper_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    chunkType: row.chunk_type,
    figureNumber: row.figure_number,
    figureCaption: row.figure_caption,
    figureDescription: row.figure_description,
    imageStoragePath: row.image_storage_path,
    pageNumber: row.page_number,
    referencedFigures: row.referenced_figures,
    mentionedInChunkIds: row.mentioned_in_chunk_ids,
    semanticScore: 0,
    keywordScore: 0,
    combinedScore: 0,
  };
}
```

---

## 10. RAG Query 수정

### 10.1 컨텍스트 빌드 확장

```typescript
// src/lib/rag/index.ts

function buildContext(
  chunks: SearchResult[],
  relatedFigures: SearchResult[]
): string {
  const parts: string[] = [];

  // 1. 메인 검색 결과
  chunks.forEach((c, i) => {
    if (c.chunkType === 'figure') {
      parts.push(`[${i + 1}] [FIGURE: ${c.figureNumber}] (Paper ID: ${c.paperId}, Page ${c.pageNumber})
Caption: ${c.figureCaption || 'No caption'}

${c.figureDescription}`);
    } else {
      // 텍스트 청크
      let text = `[${i + 1}] (Paper ID: ${c.paperId})
${c.content}`;

      // 참조하는 Figure가 있으면 표시
      if (c.referencedFigures && c.referencedFigures.length > 0) {
        text += `\n[References: ${c.referencedFigures.join(', ')}]`;
      }

      parts.push(text);
    }
  });

  // 2. 관련 Figure (텍스트에서 참조되었지만 직접 검색되지 않은 것들)
  if (relatedFigures.length > 0) {
    parts.push('\n--- Related Figures (referenced in text above) ---\n');

    relatedFigures.forEach((f, i) => {
      parts.push(`[RELATED-${i + 1}] [FIGURE: ${f.figureNumber}] (Paper ID: ${f.paperId}, Page ${f.pageNumber})
Caption: ${f.figureCaption || 'No caption'}

${f.figureDescription}`);
    });
  }

  return parts.join('\n\n---\n\n');
}
```

### 10.2 시스템 프롬프트 업데이트

```typescript
// src/lib/gemini/prompts.ts

export const MULTIMODAL_CITATION_SYSTEM_PROMPT = `
You are CiteBite, an AI research assistant specialized in analyzing academic papers.

When answering questions:
1. Use [CITE:N] markers to cite specific text sources (where N is the source number in brackets)
2. Use [FIGURE:Figure X] markers to reference figures (e.g., "[FIGURE:Figure 1] shows the architecture...")
3. Each number corresponds to the context sources provided
4. If information is from a figure, describe what the figure shows

IMPORTANT - Figure References:
- When a text source mentions a figure (indicated by [References: Figure X]), you should reference that figure
- Related figures are provided at the end of the context - use them when relevant
- Always use the exact figure number format: [FIGURE:Figure 1], [FIGURE:Table 2], etc.

Citation rules:
- Always cite sources for factual claims
- When referencing a figure, explain what it depicts based on the description provided
- If sources conflict, present both perspectives with their citations
- If no relevant information is found, say so clearly

Response format:
- Be concise but thorough
- Use technical language appropriate for researchers
- Structure longer responses with bullet points or sections
`;
```

### 10.3 응답 인용 파싱 확장

```typescript
// src/lib/rag/index.ts

interface ParsedCitations {
  answer: string;
  citedIndices: number[];
  figureReferences: {
    index: number;
    figureNumber: string;
    isRelated: boolean; // 관련 Figure인지 (직접 검색 결과가 아닌)
  }[];
}

function parseCitations(
  text: string,
  chunks: SearchResult[],
  relatedFigures: SearchResult[]
): ParsedCitations {
  const citedIndices: number[] = [];
  const figureReferences: {
    index: number;
    figureNumber: string;
    isRelated: boolean;
  }[] = [];

  // [CITE:N] 파싱
  const citeRegex = /\[CITE:(\d+)\]/g;
  let match;
  while ((match = citeRegex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    if (!citedIndices.includes(idx) && idx >= 0 && idx < chunks.length) {
      citedIndices.push(idx);
    }
  }

  // [FIGURE:Figure X] 파싱
  const figureRegex =
    /\[FIGURE:(Figure\s*\d+[a-z]?|Fig\.?\s*\d+[a-z]?|Table\s*\d+)\]/gi;
  while ((match = figureRegex.exec(text)) !== null) {
    const figureNumber = normalizeFigureNumber(match[1]);

    // 메인 검색 결과에서 찾기
    let chunkIdx = chunks.findIndex(
      c =>
        c.chunkType === 'figure' &&
        c.figureNumber?.toLowerCase() === figureNumber.toLowerCase()
    );

    if (chunkIdx >= 0) {
      if (!citedIndices.includes(chunkIdx)) {
        citedIndices.push(chunkIdx);
      }
      figureReferences.push({
        index: chunkIdx,
        figureNumber,
        isRelated: false,
      });
    } else {
      // 관련 Figure에서 찾기
      const relatedIdx = relatedFigures.findIndex(
        f => f.figureNumber?.toLowerCase() === figureNumber.toLowerCase()
      );
      if (relatedIdx >= 0) {
        figureReferences.push({
          index: relatedIdx,
          figureNumber,
          isRelated: true,
        });
      }
    }
  }

  return {
    answer: text,
    citedIndices: [...new Set(citedIndices)].sort((a, b) => a - b),
    figureReferences,
  };
}

function normalizeFigureNumber(figNum: string): string {
  return figNum
    .replace(/\bFig\.?\s*/gi, 'Figure ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

---

## 11. 채팅 UI 수정

### 11.1 GroundingChunk 타입 확장

```typescript
// src/types/chat.ts

export interface GroundingChunk {
  retrievedContext: {
    text: string;
    paper_id: string;
    chunk_type?: 'text' | 'figure';
    figure_number?: string;
    figure_caption?: string;
    image_url?: string; // Figure 이미지 URL
    page_number?: number;
    is_related?: boolean; // NEW: 직접 검색이 아닌 관련 Figure인지
  };
}

export interface ChatResponse {
  answer: string;
  groundingChunks: GroundingChunk[];
  relatedFigures?: GroundingChunk[]; // NEW: 텍스트에서 참조된 Figure들
}
```

### 11.2 Figure 인라인 렌더링 컴포넌트

```tsx
// src/components/chat/FigureInline.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ZoomIn, FileText } from 'lucide-react';

interface FigureInlineProps {
  figureNumber: string;
  imageUrl: string;
  caption?: string;
  pageNumber?: number;
  paperTitle?: string;
  isRelated?: boolean; // 관련 Figure 표시 (점선 테두리 등)
}

export function FigureInline({
  figureNumber,
  imageUrl,
  caption,
  pageNumber,
  paperTitle,
  isRelated = false,
}: FigureInlineProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`my-4 rounded-lg border p-3 ${
        isRelated
          ? 'border-dashed border-muted-foreground/50 bg-muted/30'
          : 'bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{figureNumber}</span>
        {pageNumber && <span>• Page {pageNumber}</span>}
        {isRelated && <span className="text-xs">(referenced in text)</span>}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <div className="relative cursor-pointer group">
            <Image
              src={imageUrl}
              alt={caption || figureNumber}
              width={400}
              height={300}
              className="rounded-md object-contain max-h-[300px] w-auto mx-auto"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </DialogTrigger>

        <DialogContent className="max-w-4xl">
          <Image
            src={imageUrl}
            alt={caption || figureNumber}
            width={1200}
            height={900}
            className="w-full h-auto"
          />
          {caption && (
            <p className="text-sm text-muted-foreground mt-4">{caption}</p>
          )}
        </DialogContent>
      </Dialog>

      {caption && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {caption}
        </p>
      )}
    </div>
  );
}
```

### 11.3 메시지 렌더링 수정

```tsx
// src/components/chat/MessageContent.tsx

import { FigureInline } from './FigureInline';

interface MessageContentProps {
  content: string;
  groundingChunks: GroundingChunk[];
  relatedFigures?: GroundingChunk[];
}

// [FIGURE:Figure 1] 마커를 인라인 이미지로 변환
function renderMessageContent({
  content,
  groundingChunks,
  relatedFigures = [],
}: MessageContentProps): React.ReactNode {
  const figureRegex =
    /\[FIGURE:(Figure\s*\d+[a-z]?|Fig\.?\s*\d+[a-z]?|Table\s*\d+)\]/gi;

  const allFigures = [
    ...groundingChunks.filter(c => c.retrievedContext.chunk_type === 'figure'),
    ...relatedFigures,
  ];

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = figureRegex.exec(content)) !== null) {
    // 매치 전 텍스트
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Figure 찾기
    const figureNumber = match[1];
    const normalizedFigNum = normalizeFigureNumber(figureNumber);

    const figureChunk = allFigures.find(
      c =>
        c.retrievedContext.figure_number?.toLowerCase() ===
        normalizedFigNum.toLowerCase()
    );

    if (figureChunk?.retrievedContext.image_url) {
      parts.push(
        <FigureInline
          key={match.index}
          figureNumber={figureNumber}
          imageUrl={figureChunk.retrievedContext.image_url}
          caption={figureChunk.retrievedContext.figure_caption}
          pageNumber={figureChunk.retrievedContext.page_number}
          isRelated={figureChunk.retrievedContext.is_related}
        />
      );
    } else {
      // Figure를 찾지 못한 경우 텍스트로 표시
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}

function normalizeFigureNumber(figNum: string): string {
  return figNum
    .replace(/\bFig\.?\s*/gi, 'Figure ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

---

## 12. Worker Integration

### 12.1 pdfIndexWorker 확장

```typescript
// src/lib/jobs/workers/pdfIndexWorker.ts

import { renderPdfPages } from '@/lib/pdf/renderer';
import { detectFiguresInPage } from '@/lib/pdf/figure-detector';
import { extractFigureImage } from '@/lib/pdf/figure-extractor';
import { analyzeAllFigures } from '@/lib/pdf/figure-pipeline';
import { indexFigures } from '@/lib/rag/figure-indexer';
import { chunkTextWithFigureRefs } from '@/lib/rag/chunker';

export async function processPdfIndexJob(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId, storagePath } = job.data;

  try {
    // 1. Download PDF
    await job.updateProgress(5);
    const pdfBuffer = await downloadPdfFromStorage(storagePath);

    // 2. Extract text (기존)
    await job.updateProgress(10);
    const { text } = await extractTextFromPdf(pdfBuffer);

    // 3. [MODIFIED] Chunk text WITH Figure references
    await job.updateProgress(15);
    const textChunks = chunkTextWithFigureRefs(text);

    // 4. Generate embeddings and insert text chunks (with referenced_figures)
    await job.updateProgress(25);
    const textEmbeddings = await generateDocumentEmbeddings(
      textChunks.map(c => c.content)
    );
    await insertTextChunks(textChunks, textEmbeddings, paperId, collectionId);

    // 5. [NEW] Render PDF pages
    await job.updateProgress(35);
    const pages = await renderPdfPages(pdfBuffer);

    // 6. [NEW] Detect figures in each page
    await job.updateProgress(45);
    const pageAnalyses = await Promise.all(
      pages.map(page => detectFiguresInPage(page.imageBuffer, page.pageNumber))
    );

    // 7. [NEW] Extract and crop figures
    await job.updateProgress(55);
    const allCroppedFigures: CroppedFigure[] = [];
    for (const page of pages) {
      const analysis = pageAnalyses.find(a => a.pageNumber === page.pageNumber);
      if (!analysis) continue;

      for (const figure of analysis.figures) {
        const cropped = await extractFigureImage(
          page.imageBuffer,
          page.width,
          page.height,
          figure,
          page.pageNumber
        );
        allCroppedFigures.push(cropped);
      }
    }

    // 8. [NEW] Analyze figures with Vision AI + text context
    // (내부적으로 각 Figure를 언급하는 텍스트 청크를 조회하여 컨텍스트로 제공)
    await job.updateProgress(70);
    const analyzedFigures = await analyzeAllFigures(
      allCroppedFigures,
      paperId,
      collectionId
    );

    // 9. [NEW] Index figures (with mentioned_in_chunk_ids)
    await job.updateProgress(85);
    const figureChunks = analyzedFigures.map(fig => ({
      paperId,
      collectionId,
      figureNumber: fig.figureNumber,
      normalizedFigureNumber: fig.normalizedFigureNumber,
      caption: fig.caption,
      description: fig.description,
      imageBuffer: fig.imageBuffer,
      pageNumber: fig.pageNumber,
      mentionedInChunkIds: fig.mentionedInChunkIds,
    }));
    await indexFigures(figureChunks);

    // 10. Update status
    await job.updateProgress(100);
    await updatePaperVectorStatus(paperId, collectionId, 'completed');

    return {
      success: true,
      textChunks: textChunks.length,
      figuresIndexed: figureChunks.length,
    };
  } catch (error) {
    await updatePaperVectorStatus(paperId, collectionId, 'failed');
    throw error;
  }
}

// 텍스트 청크 삽입 (referenced_figures 포함)
async function insertTextChunks(
  chunks: TextChunk[],
  embeddings: number[][],
  paperId: string,
  collectionId: string
) {
  const supabase = createAdminSupabaseClient();

  const records = chunks.map((chunk, i) => ({
    paper_id: paperId,
    collection_id: collectionId,
    chunk_type: 'text',
    content: chunk.content,
    chunk_index: chunk.chunkIndex,
    token_count: chunk.tokenCount,
    referenced_figures: chunk.referencedFigures, // NEW
    embedding: embeddings[i],
  }));

  const { error } = await supabase
    .from('paper_chunks')
    .upsert(records, { onConflict: 'paper_id,collection_id,chunk_index' });

  if (error) {
    throw new Error(`Failed to insert text chunks: ${error.message}`);
  }
}
```

---

## 13. 구현 순서

### Phase 1: 인프라 준비 (2일)

1. 의존성 설치

   ```bash
   npm install pdfjs-dist canvas sharp
   npm install --save-dev @types/pdfjs-dist
   ```

2. DB Migration 작성 및 적용

   ```bash
   npx supabase migration new add_multimodal_rag
   npx supabase db reset
   npx supabase gen types typescript --local > src/types/database.types.ts
   ```

3. Supabase Storage 설정 확인 (figures 폴더 접근 가능)

### Phase 2: 텍스트 청킹 확장 + PDF 렌더링 (2일)

4. `src/lib/pdf/figure-reference-extractor.ts` 구현
5. `src/lib/rag/chunker.ts` 수정 (referenced_figures 추가)
6. `src/lib/pdf/renderer.ts` 구현
7. 단위 테스트 작성

### Phase 3: Figure 감지 및 추출 (2일)

8. `src/lib/pdf/figure-detector.ts` 구현
9. `src/lib/pdf/figure-extractor.ts` 구현
10. 단위 테스트 작성 및 검증

### Phase 4: Figure 분석 (텍스트 컨텍스트 포함) (3일)

11. `src/lib/pdf/figure-context.ts` 구현 (관련 텍스트 조회)
12. `src/lib/pdf/figure-analyzer.ts` 구현 (컨텍스트 포함 분석)
13. `src/lib/pdf/figure-pipeline.ts` 구현
14. `src/lib/storage/figures.ts` 구현
15. `src/lib/rag/figure-indexer.ts` 구현

### Phase 5: 검색 및 RAG 수정 (3일)

16. `hybrid_search` 함수 업데이트
17. `src/lib/rag/search.ts` 타입 확장
18. `src/lib/rag/search-postprocessor.ts` 구현 (관련 Figure 자동 첨부)
19. `src/lib/rag/index.ts` 컨텍스트 빌드 및 파싱 수정

### Phase 6: Worker 통합 (2일)

20. `pdfIndexWorker.ts` 확장
21. 워커 테스트 (단일 PDF로 전체 파이프라인 검증)

### Phase 7: UI 구현 (2일)

22. `FigureInline.tsx` 컴포넌트 구현
23. 메시지 렌더링 로직 수정
24. E2E 테스트

### Phase 8: 최적화 및 안정화 (2일)

25. 메모리 사용량 최적화 (대용량 PDF)
26. 에러 핸들링 강화
27. 성능 테스트 및 튜닝
28. 문서 업데이트

---

## 14. 비용 분석

### 14.1 Gemini Vision API 비용

| 작업        | 모델             | Input               | Output       | 비용             |
| ----------- | ---------------- | ------------------- | ------------ | ---------------- |
| Figure 감지 | gemini-2.0-flash | ~0.1M tokens/page   | ~0.5K tokens | ~$0.00003/page   |
| Figure 분석 | gemini-2.0-flash | ~0.1M tokens/figure | ~1K tokens   | ~$0.00003/figure |

### 14.2 논문당 예상 비용

| 항목          | 수량      | 단가     | 비용              |
| ------------- | --------- | -------- | ----------------- |
| 페이지 렌더링 | 10 pages  | -        | 무료 (로컬)       |
| Figure 감지   | 10 pages  | $0.00003 | $0.0003           |
| Figure 분석   | 5 figures | $0.00003 | $0.00015          |
| 임베딩        | 5 figures | $0.0002  | $0.001            |
| **총계**      |           |          | **~$0.0015/논문** |

### 14.3 100개 논문 처리 비용

- Figure 처리: ~$0.15
- 텍스트 임베딩 (기존): ~$0.02
- **총 비용: ~$0.17**

→ 기존 대비 약 8배 증가하나 절대 비용은 여전히 저렴

### 14.4 Storage 비용

| 항목                | 크기            |
| ------------------- | --------------- |
| Figure 이미지 (PNG) | 50-200KB/figure |
| 논문당 평균 Figure  | 5개             |
| 논문당 Storage      | ~0.5-1MB        |
| 100개 논문          | ~50-100MB       |

→ Supabase Free tier (1GB) 내에서 충분

---

## 15. 테스트 계획

### 15.1 단위 테스트

```typescript
// Figure 참조 추출
- [ ] "Figure 1" 패턴 인식
- [ ] "Fig. 2a" 패턴 인식
- [ ] "Figures 1-3" 범위 확장
- [ ] "Table 2" 패턴 인식
- [ ] 중복 참조 제거

// PDF Renderer
- [ ] 정상 PDF 렌더링
- [ ] 다양한 페이지 크기 처리
- [ ] 메모리 제한 테스트

// Figure Detector
- [ ] Figure가 있는 페이지 감지
- [ ] Figure가 없는 페이지 처리
- [ ] 다양한 Figure 타입 (chart, diagram, table)
- [ ] Caption 추출 정확도

// Figure Analyzer
- [ ] 상세 설명 생성
- [ ] Caption 컨텍스트 활용
- [ ] 관련 텍스트 컨텍스트 활용
- [ ] 다양한 시각화 타입 처리

// Search Postprocessor
- [ ] 텍스트 청크에서 Figure 참조 추출
- [ ] 관련 Figure 자동 조회
- [ ] 중복 Figure 제거
```

### 15.2 통합 테스트

```typescript
- [ ] PDF → 텍스트 청킹 (with referenced_figures) → 저장
- [ ] PDF → Figure 추출 → 분석 (with text context) → 인덱싱
- [ ] 양방향 연결 확인 (referenced_figures ↔ mentioned_in_chunk_ids)
- [ ] 쿼리 → 검색 → Figure 자동 첨부 → 응답
- [ ] Figure 이미지 Storage 업로드/다운로드
```

### 15.3 E2E 테스트

```typescript
- [ ] 새 컬렉션에 Figure 많은 논문 추가
- [ ] 인덱싱 완료 확인 (text + figure chunks)
- [ ] "Figure 1이 뭘 보여주지?" → Figure 이미지 인라인 표시
- [ ] "결과가 어떻게 돼?" → 관련 텍스트 + 참조된 Figure 함께 표시
- [ ] 확대 모달 동작
- [ ] 관련 Figure 표시 (점선 테두리)
```

---

## 16. 위험 요소 및 대응

| Risk                        | Impact | Likelihood | Mitigation                                |
| --------------------------- | ------ | ---------- | ----------------------------------------- |
| Figure 감지 부정확          | Medium | Medium     | 감지 실패 시 텍스트만 인덱싱, 로그 기록   |
| Vision API 비용 급증        | Medium | Low        | 페이지당 Figure 수 제한 (max 10)          |
| 대용량 PDF 메모리 부족      | High   | Medium     | 스트리밍 처리, 페이지별 GC                |
| Caption 추출 실패           | Low    | Medium     | Caption 없이도 분석 진행                  |
| 이미지 품질 저하            | Low    | Low        | DPI 설정 조정 (scale: 2.0)                |
| 처리 시간 증가              | Medium | High       | 진행 상태 표시, 사용자 알림               |
| **텍스트-Figure 매칭 실패** | Medium | Medium     | 정규화 로직 강화, 부분 매칭 허용          |
| **관련 텍스트 없음**        | Low    | Medium     | 텍스트 없이도 Caption + 이미지만으로 분석 |

---

## 17. 성공 기준

- [ ] PDF 인덱싱 성공률 > 85% (Figure 포함)
- [ ] Figure 감지 정확도 > 80%
- [ ] 텍스트-Figure 연결 정확도 > 90%
- [ ] Figure 관련 질문 응답에 이미지 표시
- [ ] 텍스트에서 Figure 언급 시 관련 이미지 자동 첨부
- [ ] 논문당 처리 시간 < 2분
- [ ] 기존 텍스트 검색 성능 유지

---

## 18. 참고 자료

- [Gemini Vision API](https://ai.google.dev/gemini-api/docs/vision)
- [pdfjs-dist](https://github.com/nicolo-ribaudo/pdfjs-dist)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
