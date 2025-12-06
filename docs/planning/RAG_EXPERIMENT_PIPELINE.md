# RAG 실험 자동화 파이프라인 계획

## 개요

사용자가 자연어로 정의한 RAG 개선 방향을 기반으로, Claude Code가 각 실험을 독립적인 git branch에서 구현하고 QASPER evaluation을 실행한 뒤 결과를 Markdown 리포트로 저장하는 워크플로우.

## 워크플로우 요약

```
1. 사용자: experiments/specs/*.md 에 실험 명세 작성
2. Claude Code 세션:
   - 실험 spec 파일 읽기
   - git branch 생성 (exp/{experiment-id})
   - RAG 코드 수정 (파라미터 변경)
   - QASPER evaluation 실행
   - results/EXPERIMENT_RESULTS.md 생성
   - 결과 commit
3. 사용자: 나중에 각 branch 결과 비교 후 merge 결정
```

---

## Phase 1: 실험 명세 형식 정의

### 파일 위치

`experiments/specs/{experiment-id}.md`

### YAML Frontmatter 스키마

```yaml
---
id: 'chunk-size-8k' # 고유 ID (branch 이름에 사용)
name: 'Larger Chunk Size (8K chars)' # 사람이 읽을 수 있는 이름
hypothesis: | # 가설 (왜 이 변경이 성능을 개선할 것인가)
  더 큰 청크가 복잡한 질문에 대한 컨텍스트 유지를 개선할 것

target:
  component: 'chunker' # chunker | search | embeddings | prompt
  file: 'src/lib/rag/chunker.ts' # 수정할 파일

parameters: # 변경할 파라미터들
  maxChars: 8192
  overlapChars: 1200

evaluation:
  mode: 'json' # json (빠름) | pdf (전체 파이프라인)
  paperLimit: 20 # 평가할 논문 수

tags: ['chunking', 'context'] # 분류용 태그
---
## Description
(자유 형식의 설명 - Claude가 구현 방향 이해에 참고)
```

### 지원 컴포넌트 및 파라미터

| Component    | File                        | Parameters                             |
| ------------ | --------------------------- | -------------------------------------- |
| `chunker`    | `src/lib/rag/chunker.ts`    | `maxChars`, `overlapChars`, `minChars` |
| `search`     | `src/lib/rag/search.ts`     | `limit`, `semanticWeight`              |
| `embeddings` | `src/lib/rag/embeddings.ts` | `EMBEDDING_DIMENSIONS`                 |
| `prompt`     | `src/lib/rag/index.ts`      | 시스템 프롬프트 내용                   |

---

## Phase 2: 디렉토리 구조

```
experiments/
├── specs/                    # 실험 명세 파일들
│   ├── _TEMPLATE.md         # 명세 템플릿
│   ├── baseline.md          # 기준선 (현재 설정)
│   ├── chunk-size-8k.md     # 예시 실험 1
│   └── semantic-weight-0.9.md # 예시 실험 2
│
├── results/                  # 결과 요약 (main branch)
│   └── COMPARISON.md        # 전체 실험 비교표
│
└── README.md                # 실험 시스템 사용 가이드

results/                      # (각 exp/* branch에 생성됨)
└── EXPERIMENT_RESULTS.md    # 해당 실험의 상세 결과
```

---

## Phase 3: 실험 실행 워크플로우 (Claude Code 세션)

### Step 1: Baseline 평가 (최초 1회)

```bash
# custom_rag_evaluation branch에서 실행
npm run eval:qasper -- --mode=json --limit=20
# 결과를 experiments/results/baseline.json 으로 저장
```

### Step 2: 실험 실행 (각 실험마다)

1. **Spec 파일 읽기**
   - `experiments/specs/{id}.md` 파싱
   - YAML frontmatter에서 설정 추출

2. **Branch 생성**

   ```bash
   git checkout -b exp/{id} custom_rag_evaluation
   ```

3. **코드 수정**
   - target.component에 따라 해당 파일 수정
   - parameters의 값들을 코드에 반영

4. **변경 Commit**

   ```bash
   git add .
   git commit -m "exp: {id} - {name}"
   ```

5. **Evaluation 실행**

   ```bash
   npm run eval:qasper -- --mode=json --limit=20
   ```

6. **결과 리포트 생성**
   - `results/EXPERIMENT_RESULTS.md` 생성
   - Baseline과 비교 delta 계산

7. **결과 Commit**

   ```bash
   git add results/
   git commit -m "results: {id} evaluation complete"
   ```

8. **Base branch로 복귀**
   ```bash
   git checkout custom_rag_evaluation
   ```

---

## Phase 4: 결과 리포트 형식

### results/EXPERIMENT_RESULTS.md

```markdown
# Experiment: {name}

**ID:** `{id}`
**Branch:** `exp/{id}`
**Date:** {timestamp}

## Hypothesis

{hypothesis}

## Configuration Changes

| Parameter | Baseline | Experiment |
| --------- | -------- | ---------- |
| maxChars  | 4096     | 8192       |

## Results

### Overall Metrics

| Metric      | Baseline | Experiment | Delta  |
| ----------- | -------- | ---------- | ------ |
| F1 Score    | 0.0806   | 0.0923     | +14.5% |
| Exact Match | 3.33%    | 4.17%      | +25.2% |

### By Answer Type

(표)

## Recommendation

**ADOPT** / **REJECT** / **NEEDS_MORE_DATA**

## Raw Data

<details>
<summary>JSON</summary>
{json data}
</details>
```

---

## 구현 작업 목록

### Task 1: 템플릿 및 문서 생성

- [ ] `experiments/specs/_TEMPLATE.md` - 실험 명세 템플릿
- [ ] `experiments/README.md` - 사용 가이드

### Task 2: Baseline 평가 실행

- [ ] QASPER evaluation 실행 (현재 설정)
- [ ] 결과를 `experiments/results/baseline.json`으로 저장
- [ ] Baseline 결과 문서화

### Task 3: 샘플 실험 명세 작성

- [ ] `experiments/specs/baseline.md` - 현재 설정 문서화
- [ ] 2-3개의 샘플 실험 명세 작성

### Task 4: 실험 실행 가이드

- [ ] Claude Code가 따라야 할 step-by-step 워크플로우 문서화
- [ ] 각 컴포넌트별 코드 수정 패턴 문서화

---

## 수정할 파일 목록

### 새로 생성

1. `experiments/specs/_TEMPLATE.md` - 실험 명세 템플릿
2. `experiments/specs/baseline.md` - Baseline 명세
3. `experiments/README.md` - 실험 시스템 가이드
4. `experiments/results/baseline.json` - Baseline 평가 결과

### 기존 파일 (실험시 수정 대상)

1. `src/lib/rag/chunker.ts:29-33` - DEFAULT_CHUNK_CONFIG
2. `src/lib/rag/search.ts:54` - limit, semanticWeight 기본값
3. `src/lib/rag/index.ts` - 시스템 프롬프트 (prompt 실험시)

---

## 주의사항

1. **세션 제한**: Claude Code 세션당 1개 실험 권장 (evaluation이 오래 걸림)
2. **Baseline 필수**: 모든 실험은 baseline 결과와 비교됨
3. **독립성**: 각 실험 branch는 완전히 독립적 (다른 실험에 영향 없음)
4. **Rollback**: 실패시 `git checkout custom_rag_evaluation`로 복귀

---

## 예상 소요 시간

- Phase 1-4 (템플릿/문서): ~30분
- Baseline 평가 실행: ~20-30분 (20 papers 기준)
- 각 실험 실행: ~30-40분/실험

---

## 다음 단계

1. 이 계획 승인 후 템플릿 및 문서 생성
2. Baseline evaluation 실행
3. 사용자가 실험 명세 작성
4. Claude Code 세션에서 실험 실행
