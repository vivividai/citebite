# RAG Evaluation with QASPER Dataset

QASPER 데이터셋을 활용한 CiteBite Custom RAG 시스템 정확도 평가 구현 계획

## Overview

- **평가 대상**: QASPER validation set (281 papers, ~900 QA pairs)
- **측정 메트릭**: F1 Score, Exact Match
- **실행 방식**: `npm run eval:qasper`
- **데이터 소스**: ArXiv PDF 다운로드 (기존 파이프라인 활용)

---

## QASPER Dataset

QASPER (Question Answering on Scientific Papers)는 NLP/ML 도메인의 학술 논문에 대한 Q&A 데이터셋입니다.

### Dataset Structure

```typescript
interface QasperPaper {
  id: string; // ArXiv paper ID (예: "1909.00694")
  title: string;
  abstract: string;
  full_text: Array<{
    section_name: string; // "Introduction", "Methods" 등
    paragraphs: string[];
  }>;
  qas: Array<{
    question: string;
    question_id: string;
    answers: Array<{
      unanswerable: boolean; // 답변 불가 여부
      extractive_spans: string[]; // 논문에서 추출한 직접 인용
      free_form_answer: string; // 사람이 작성한 요약 답변
      yes_no: boolean | null; // Yes/No 질문인 경우
      evidence: string[]; // 근거 텍스트
    }>;
  }>;
}
```

### Answer Types

| Type             | 식별 방법                     | 평가 방식                 |
| ---------------- | ----------------------------- | ------------------------- |
| **Extractive**   | `extractive_spans.length > 0` | Token F1, Exact Match     |
| **Abstractive**  | `free_form_answer`만 존재     | Token F1, Exact Match     |
| **Yes/No**       | `yes_no !== null`             | Keyword matching accuracy |
| **Unanswerable** | `unanswerable === true`       | Detection rate            |

### Dataset Statistics

- Train: 888 papers
- Validation: 281 papers (~900 QA pairs)
- Test: 416 papers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: PAPER INGESTION (via existing pipeline)                       │
│                                                                          │
│  QASPER JSONL → ArXiv PDF URLs → queuePdfDownload() → Workers           │
│       ↓                                ↓                                 │
│  Create Collection            PDF Download Worker                        │
│  Link Papers                         ↓                                  │
│                               queuePdfIndexing()                         │
│                                      ↓                                  │
│                              PDF Index Worker                            │
│                              (chunking + embedding)                      │
│                                      ↓                                  │
│                              paper_chunks table                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: WAIT FOR INDEXING                                             │
│                                                                          │
│  Poll papers.vector_status until all = 'completed' or 'failed'          │
│  Show progress: 150/281 papers indexed (53%)                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: EVALUATION                                                    │
│                                                                          │
│  For each QA pair:                                                      │
│    → queryRAG(collectionId, question)                                   │
│    → Strip [CITE:N] markers                                             │
│    → Calculate F1 / Exact Match                                         │
│    → Save checkpoint every 50 questions                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### File Structure

```
scripts/eval/qasper/
├── index.ts          # CLI entry point
├── types.ts          # TypeScript interfaces
├── load-dataset.ts   # JSONL parser
├── ingest-papers.ts  # Paper ingestion (ArXiv PDF 큐잉)
├── wait-indexing.ts  # Workers 처리 대기 모니터
├── metrics.ts        # F1, EM calculations
├── run-evaluation.ts # Main evaluation loop
├── checkpoint.ts     # Resume support
└── report.ts         # Output formatting

data/qasper/
└── qasper-dev-v0.3.jsonl  # Dataset file (user downloads)

eval-results/
└── qasper-{timestamp}.json  # Results output
```

### Key Components

#### 1. Paper Ingestion (`ingest-papers.ts`)

ArXiv PDF를 다운로드하여 기존 파이프라인으로 처리:

```typescript
// QASPER paper ID → ArXiv PDF URL
function getArxivPdfUrl(paperId: string): string {
  return `https://arxiv.org/pdf/${paperId}.pdf`;
}

async function ingestQasperPapers(
  papers: QasperPaper[],
  collectionId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ queued: number; failed: string[] }>;
```

**Flow**:

1. Collection 생성: "QASPER Evaluation"
2. Paper 생성: `paper_id` = ArXiv ID, `open_access_pdf_url` = ArXiv PDF URL
3. PDF 다운로드 큐잉: `queuePdfDownload()` 호출
4. Workers가 처리: PDF Download → PDF Indexing → paper_chunks 저장

#### 2. Indexing Monitor (`wait-indexing.ts`)

```typescript
async function waitForIndexing(
  collectionId: string,
  paperIds: string[],
  options: {
    pollIntervalMs?: number; // default: 5000
    timeoutMs?: number; // default: 3600000 (1 hour)
    onProgress?: (completed: number, total: number, failed: number) => void;
  }
): Promise<{ completed: string[]; failed: string[] }>;
```

진행 상황 표시:

```
Waiting for PDF indexing...
[████████████░░░░░░░░] 150/281 (53%) | 5 failed | ETA: 12min
```

#### 3. Metrics (`metrics.ts`)

**Token-level F1 Score** (SQuAD style):

```typescript
function calculateF1(predicted: string, reference: string): number {
  const predTokens = tokenize(normalize(predicted));
  const refTokens = tokenize(normalize(reference));

  const overlap = countOverlap(predTokens, refTokens);
  const precision = overlap / predTokens.length;
  const recall = overlap / refTokens.length;

  return (2 * precision * recall) / (precision + recall) || 0;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Multiple References** (max score):

```typescript
function evaluateWithReferences(
  predicted: string,
  references: string[]
): Metrics {
  let maxF1 = 0,
    maxEM = 0;
  for (const ref of references) {
    maxF1 = Math.max(maxF1, calculateF1(predicted, ref));
    maxEM = Math.max(maxEM, calculateExactMatch(predicted, ref));
  }
  return { f1: maxF1, em: maxEM };
}
```

#### 4. Evaluation Runner (`run-evaluation.ts`)

```typescript
async function runEvaluation(
  collectionId: string,
  papers: QasperPaper[],
  options: { resume?: boolean; limit?: number }
): Promise<EvaluationResult[]>;
```

**Flow**:

1. Checkpoint 로드 (resume 모드)
2. 각 paper의 QA pairs 순회
3. `queryRAG(collectionId, question)` 호출
4. Citation markers 제거: `answer.replace(/\[CITE:\d+\]/g, '')`
5. Answer type 분류 및 metrics 계산
6. 50개 질문마다 checkpoint 저장
7. Rate limiting: 100ms delay between requests

---

## Output Format

### Console Output

```
========================================
QASPER RAG Evaluation Results
========================================
Model: gemini-2.5-flash | Runtime: 1h 23m

--- Overall Metrics ---
F1 Score:      0.453
Exact Match:   12.7%
Questions:     900

--- By Answer Type ---
┌──────────────┬───────┬───────┬───────┐
│ Type         │ Count │ F1    │ EM    │
├──────────────┼───────┼───────┼───────┤
│ Extractive   │ 320   │ 0.521 │ 18.5% │
│ Abstractive  │ 380   │ 0.398 │ 8.2%  │
│ Yes/No       │ 120   │ -     │ 74.1% │
│ Unanswerable │ 80    │ -     │ 62.5% │
└──────────────┴───────┴───────┴───────┘
```

### JSON Output (`eval-results/qasper-{timestamp}.json`)

```json
{
  "metadata": {
    "timestamp": "2025-12-03T10:30:45Z",
    "model": "gemini-2.5-flash",
    "totalPapers": 281,
    "totalQuestions": 900,
    "runtimeMs": 5400000
  },
  "summary": {
    "overall": { "f1": 0.453, "exactMatch": 0.127 },
    "byType": {
      "extractive": { "count": 320, "f1": 0.521, "em": 0.185 },
      "abstractive": { "count": 380, "f1": 0.398, "em": 0.082 },
      "yes_no": { "count": 120, "accuracy": 0.741 },
      "unanswerable": { "count": 80, "detectionRate": 0.625 }
    }
  },
  "details": [...],
  "errors": [...]
}
```

---

## Usage

### Prerequisites

1. **Workers 실행 필수**: PDF 다운로드 및 인덱싱은 Workers가 처리

   ```bash
   npm run workers  # 별도 터미널에서 실행
   ```

2. **QASPER 데이터셋 다운로드**:
   - https://huggingface.co/datasets/allenai/qasper
   - `qasper-dev-v0.3.jsonl` 파일을 `data/qasper/`에 배치

3. **환경 변수**: `.env.local`에 Gemini API 키, Redis URL 등 설정 필요

### Commands

```bash
# Quick test with 5 papers
npm run eval:qasper -- --limit=5

# Full evaluation (새 collection 생성)
npm run eval:qasper

# 중단된 평가 재개
npm run eval:qasper -- --resume

# 기존 collection으로 평가만 실행 (ingestion 건너뜀)
npm run eval:qasper -- --skip-ingest --collection=<uuid>
```

---

## Runtime Estimate

| Phase                    | Calculation                         | Time             |
| ------------------------ | ----------------------------------- | ---------------- |
| Dataset Loading          | 281 papers × parsing                | ~5 sec           |
| Paper Ingestion (큐잉)   | 281 papers × DB insert + queue      | ~2 min           |
| PDF Processing (Workers) | 281 PDFs × download + chunk + embed | ~30-60 min       |
| Evaluation               | 900 questions × ~3s per RAG query   | ~45-60 min       |
| **Total**                |                                     | **~1.5-2 hours** |

**참고**: PDF 처리는 Workers가 병렬로 처리하므로 실제 시간은 Worker 동시성에 따라 다름

---

## Implementation Checklist

| Step      | File                  | Description              | Est. Time |
| --------- | --------------------- | ------------------------ | --------- |
| 1         | `types.ts`            | Type definitions         | 15min     |
| 2         | `load-dataset.ts`     | JSONL parser             | 30min     |
| 3         | `ingest-papers.ts`    | ArXiv PDF 다운로드 큐잉  | 1h        |
| 4         | `wait-indexing.ts`    | Workers 처리 대기 모니터 | 30min     |
| 5         | `metrics.ts`          | F1, EM calculations      | 45min     |
| 6         | `checkpoint.ts`       | Resume support           | 30min     |
| 7         | `run-evaluation.ts`   | Main evaluation loop     | 1h        |
| 8         | `report.ts`           | Output formatting        | 30min     |
| 9         | `index.ts`            | CLI orchestration        | 30min     |
| 10        | Test with `--limit=5` | Validation               | 30min     |
| **Total** |                       |                          | **~6h**   |

---

## Dependencies (Reused Modules)

기존 모듈 100% 재사용:

- `src/lib/rag/index.ts` - `queryRAG()`
- `src/lib/jobs/queues.ts` - `queuePdfDownload()`
- `src/lib/db/papers.ts` - `upsertPapers()`
- `src/lib/db/collections.ts` - `createCollection()`, `linkPapersToCollection()`
- `src/lib/supabase/server.ts` - `createAdminSupabaseClient()`

---

## Files to Modify

### New Files (9)

- `scripts/eval/qasper/index.ts`
- `scripts/eval/qasper/types.ts`
- `scripts/eval/qasper/load-dataset.ts`
- `scripts/eval/qasper/ingest-papers.ts`
- `scripts/eval/qasper/wait-indexing.ts`
- `scripts/eval/qasper/metrics.ts`
- `scripts/eval/qasper/run-evaluation.ts`
- `scripts/eval/qasper/checkpoint.ts`
- `scripts/eval/qasper/report.ts`

### Existing Files to Modify (1)

- `package.json` - Add `eval:qasper` script

### Directories to Create (2)

- `data/qasper/` - Dataset storage
- `eval-results/` - Output directory

### .gitignore Additions

```
data/qasper/*.jsonl
eval-results/*.json
eval-results/*-checkpoint.json
```
