# RAG Evaluation Guide (QASPER)

QASPER 데이터셋을 활용한 CiteBite Custom RAG 시스템 평가 가이드.

## Quick Start

```bash
# 1. Quick test (5 papers, JSON mode - 빠름)
npm run eval:qasper -- --limit=5

# 2. Full evaluation (JSON mode)
npm run eval:qasper

# 3. PDF pipeline test (chunking 효과 테스트)
npm run workers  # 별도 터미널에서 먼저 실행
npm run eval:qasper -- --mode=pdf --limit=5
```

## Two Evaluation Modes

### JSON Mode (기본값, 권장)

```bash
npm run eval:qasper -- --mode=json
```

- QASPER JSON의 `full_text`를 직접 chunking + embedding
- **Workers 불필요** (Redis 없이도 실행 가능)
- 빠르고 안정적
- **용도**: LLM 응답 품질 평가

### PDF Mode

```bash
npm run eval:qasper -- --mode=pdf
```

- ArXiv에서 PDF 다운로드 → 텍스트 추출 → chunking + embedding
- **Workers 필수** (`npm run workers`)
- 실제 사용 시나리오와 동일
- **용도**: PDF 파이프라인 + chunking 효과 테스트

## Prerequisites

### 1. QASPER 데이터셋

데이터셋은 이미 `data/qasper/` 경로에 포함되어 있습니다:

- `qasper-dev-v0.3.json` - 원본 JSON (281 papers)
- `qasper-dev-v0.3.jsonl` - JSONL 형식 (평가 스크립트용)

만약 없다면 직접 다운로드:

```bash
curl -L "https://qasper-dataset.s3.us-west-2.amazonaws.com/qasper-train-dev-v0.3.tgz" | tar -xz -C data/qasper/
```

### 2. 환경 변수

`.env.local`에 필요한 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `REDIS_URL` (PDF mode에서만 필요)

### 3. Workers (PDF mode only)

```bash
npm run workers  # 별도 터미널에서 실행
```

## CLI Options

```bash
# Mode 선택
npm run eval:qasper -- --mode=json    # JSON 직접 사용 (기본값)
npm run eval:qasper -- --mode=pdf     # PDF 파이프라인

# Paper 수 제한
npm run eval:qasper -- --limit=5      # 5개 paper만 테스트

# 중단된 평가 재개
npm run eval:qasper -- --resume

# 기존 collection 사용 (ingestion 건너뜀)
npm run eval:qasper -- --skip-ingest --collection=<uuid>

# 조합 예시
npm run eval:qasper -- --mode=json --limit=10
npm run eval:qasper -- --mode=pdf --limit=5 --resume
```

## Evaluation Process

### JSON Mode

```
Phase 1: Load QASPER dataset (JSON)
    ↓
Phase 2: Direct ingestion (chunk + embed full_text)
    ↓
Phase 4: RAG evaluation (queryRAG for each QA)
    ↓
Phase 5: Generate report
```

### PDF Mode

```
Phase 1: Load QASPER dataset
    ↓
Phase 2: Queue PDF downloads (ArXiv)
    ↓
Phase 3: Wait for Workers (download + index)
    ↓
Phase 4: RAG evaluation
    ↓
Phase 5: Generate report
```

## Output

### Console Output

```
========================================
QASPER RAG Evaluation Results
========================================
Model: gemini-2.5-flash (json mode) | Runtime: 15m 23s

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

### JSON Output

결과 파일: `eval-results/qasper-{timestamp}.json`

```json
{
  "metadata": {
    "timestamp": "2025-12-03T10:30:45Z",
    "model": "gemini-2.5-flash (json mode)",
    "totalPapers": 281,
    "totalQuestions": 900,
    "runtimeMs": 923000,
    "collectionId": "uuid"
  },
  "summary": {
    "overall": { "f1": 0.453, "exactMatch": 0.127 },
    "byType": { ... }
  },
  "details": [...],
  "errors": [...]
}
```

## File Structure

```
scripts/eval/qasper/
├── index.ts          # CLI entry point
├── types.ts          # TypeScript interfaces
├── load-dataset.ts   # JSONL parser
├── ingest-papers.ts  # PDF mode: ArXiv PDF queueing
├── direct-ingest.ts  # JSON mode: Direct text ingestion
├── wait-indexing.ts  # Indexing progress monitor
├── metrics.ts        # F1, EM calculations
├── checkpoint.ts     # Resume support
├── run-evaluation.ts # Main evaluation loop
└── report.ts         # Output formatting

data/qasper/
├── qasper-dev-v0.3.json   # Original dataset
└── qasper-dev-v0.3.jsonl  # JSONL format for eval

eval-results/
├── qasper-{timestamp}.json      # Results
└── {collection-id}-checkpoint.json  # Checkpoint
```

## Runtime Estimate

### JSON Mode (권장)

| Phase            | Time                        |
| ---------------- | --------------------------- |
| Dataset Loading  | ~5 sec                      |
| Direct Ingestion | ~10-20 min (embedding 포함) |
| Evaluation       | ~45-60 min                  |
| **Total**        | **~1 hour**                 |

### PDF Mode

| Phase                    | Time             |
| ------------------------ | ---------------- |
| Dataset Loading          | ~5 sec           |
| PDF Queueing             | ~2 min           |
| PDF Processing (Workers) | ~30-60 min       |
| Evaluation               | ~45-60 min       |
| **Total**                | **~1.5-2 hours** |

## Troubleshooting

### "QASPER dataset not found"

데이터셋 파일 경로 확인:

```bash
ls -la data/qasper/
# qasper-dev-v0.3.jsonl 파일이 있어야 함
```

### Indexing timeout (PDF mode)

- Workers가 실행 중인지 확인: `npm run workers`
- Queue 상태 확인: `npm run queues:check`

### Resume from interruption

Ctrl+C로 중단 시 체크포인트 자동 저장됨. `--resume` 옵션으로 재개:

```bash
npm run eval:qasper -- --resume
```

### Collection already exists

같은 mode로 재실행 시 기존 collection 재사용. 새로 시작하려면:

1. Supabase에서 collection 삭제
2. 또는 다른 mode로 실행 (각 mode별 별도 collection)

## Metrics

### Token-level F1 Score (SQuAD style)

```
F1 = 2 * (precision * recall) / (precision + recall)
```

### Exact Match

정규화된 문자열 완전 일치 여부 (0 or 1)

### Answer Types

| Type         | 평가 방식                 |
| ------------ | ------------------------- |
| Extractive   | Token F1, Exact Match     |
| Abstractive  | Token F1, Exact Match     |
| Yes/No       | Keyword matching accuracy |
| Unanswerable | Detection rate            |

## Comparing Modes

두 mode의 결과를 비교하면 chunking 전략의 효과를 측정할 수 있습니다:

```bash
# 1. JSON mode로 baseline 측정
npm run eval:qasper -- --mode=json --limit=50

# 2. PDF mode로 실제 파이프라인 측정
npm run eval:qasper -- --mode=pdf --limit=50

# 3. eval-results/*.json 파일 비교
```

차이점:

- **JSON mode**: QASPER에서 제공하는 깔끔한 텍스트 사용
- **PDF mode**: PDF에서 추출한 텍스트 사용 (노이즈 포함 가능)
