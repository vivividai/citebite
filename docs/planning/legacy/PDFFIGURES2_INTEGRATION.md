# pdffigures2 통합 계획: Figure Detection 병목 해소

## 요약

**목표**: Gemini Vision API Detection을 pdffigures2 Docker 컨테이너로 대체하여 병목 해소
**설치 방식**: Docker 컨테이너 (격리됨, 권장)
**폴백 전략**: 없음 (pdffigures2 결과만 사용, 빠름)

---

## 현재 상황

### 병목 분석

- **Detection 단계**: Gemini Vision API로 전체 페이지 스캔 (3페이지/배치, 300ms 딜레이)
- **Analysis 단계**: 크롭된 Figure 분석 (2개/배치, 500ms 딜레이)
- 50페이지, 100개 Figure → 약 37회 API 호출, 15-20분 소요

### pdffigures2로 해결 가능한 부분

- **Detection**: 룰 베이스로 Figure 위치 + Caption 추출 (API 호출 없음)
- **Analysis**: 여전히 Gemini Vision 필요 (Description 생성)

**예상 효과**: Detection API 호출 제거 → 50% 이상 시간 단축

---

## 구현 계획

### Phase 1: pdffigures2 Docker 컨테이너 구성

#### 1.1 Dockerfile 작성

**파일**: `docker/pdffigures2/Dockerfile`

```dockerfile
FROM openjdk:11-slim
RUN apt-get update && apt-get install -y wget
# pdffigures2 JAR 다운로드 및 설정
COPY run-server.sh /app/
EXPOSE 8080
CMD ["/app/run-server.sh"]
```

#### 1.2 간단한 HTTP API 서버

pdffigures2 CLI를 HTTP로 래핑하는 간단한 서버:

- `POST /extract` - PDF 파일 받아서 Figure 목록 JSON 반환

**파일**: `docker/pdffigures2/server.py` (Python Flask 또는 간단한 스크립트)

#### 1.3 docker-compose 설정

**파일**: `docker-compose.yml` (추가 서비스)

```yaml
services:
  pdffigures2:
    build: ./docker/pdffigures2
    ports:
      - '8081:8080'
    volumes:
      - ./temp:/data
```

---

### Phase 2: Node.js 클라이언트 구현

#### 2.1 pdffigures2 HTTP 클라이언트

**파일**: `src/lib/pdf/pdffigures2-client.ts`

```typescript
export interface Pdffigures2Figure {
  name: string; // "Figure 1"
  page: number;
  caption: string;
  regionBoundary: { x1: number; y1: number; x2: number; y2: number };
}

export async function detectFiguresWithPdffigures2(
  pdfPath: string
): Promise<Pdffigures2Figure[]>;
```

#### 2.2 Detection Strategy 패턴

**파일**: `src/lib/pdf/figure-detection-strategy.ts`

```typescript
export type DetectionStrategy = 'gemini' | 'pdffigures2';

export async function detectFigures(
  pdfPath: string,
  pageImages: RenderedPage[],
  strategy: DetectionStrategy
): Promise<DetectedFigure[]>;
```

- `gemini`: 기존 Gemini Vision API 사용 (figure-detector.ts)
- `pdffigures2`: Docker 컨테이너 API 호출

---

### Phase 3: 파이프라인 통합

#### 3.1 환경 변수 추가

**파일**: `.env.example`

```bash
# Figure Detection Strategy: 'gemini' | 'pdffigures2'
FIGURE_DETECTION_STRATEGY=pdffigures2
PDFFIGURES2_API_URL=http://localhost:8081
```

#### 3.2 figure-pipeline.ts 수정

Detection 단계에서 Strategy 선택 로직 추가:

**파일**: `src/lib/pdf/figure-pipeline.ts`

- `processPdfFigures()` 함수에서 Strategy 기반 Detection 호출
- pdffigures2 결과를 기존 `DetectedFigure` 형식으로 변환
- 기존 `detectFiguresInPages()` 호출부를 Strategy 패턴으로 교체

#### 3.3 BoundingBox 변환

pdffigures2는 픽셀 좌표, Gemini는 0-1 정규화 좌표 사용:

**파일**: `src/lib/pdf/pdffigures2-client.ts`

```typescript
// pdffigures2 픽셀 좌표 → 정규화 좌표 변환
function convertToNormalizedBoundingBox(
  region: { x1: number; y1: number; x2: number; y2: number },
  pageWidth: number,
  pageHeight: number
): BoundingBox {
  return {
    x: region.x1 / pageWidth,
    y: region.y1 / pageHeight,
    width: (region.x2 - region.x1) / pageWidth,
    height: (region.y2 - region.y1) / pageHeight,
  };
}
```

---

### Phase 4: 에러 처리 (폴백 없음)

#### 4.1 pdffigures2 실패 시 동작

- Docker 컨테이너 미실행 → 에러 로그 + Figure 추출 스킵
- 타임아웃 (30초) → 에러 로그 + Figure 추출 스킵
- 빈 결과 → 정상 처리 (해당 PDF에 Figure 없음)

#### 4.2 에러 처리 로직

```typescript
async function detectFiguresWithStrategy(
  pdfPath: string,
  strategy: DetectionStrategy
): Promise<DetectedFigure[]> {
  if (strategy === 'pdffigures2') {
    try {
      return await detectFiguresWithPdffigures2(pdfPath);
    } catch (error) {
      console.error('pdffigures2 detection failed:', error);
      return []; // 폴백 없이 빈 배열 반환
    }
  }
  // gemini 전략은 기존 코드 사용
  return await detectFiguresWithGemini(pageImages);
}
```

---

## 수정 대상 파일

| 파일                                       | 변경 내용                          |
| ------------------------------------------ | ---------------------------------- |
| `docker/pdffigures2/Dockerfile`            | **신규** - Docker 이미지 정의      |
| `docker/pdffigures2/server.py`             | **신규** - HTTP API 서버           |
| `docker-compose.yml`                       | **수정** - pdffigures2 서비스 추가 |
| `src/lib/pdf/pdffigures2-client.ts`        | **신규** - HTTP 클라이언트         |
| `src/lib/pdf/figure-detection-strategy.ts` | **신규** - Strategy 패턴           |
| `src/lib/pdf/figure-pipeline.ts`           | **수정** - Strategy 기반 Detection |
| `src/lib/pdf/figure-detector.ts`           | **유지** - 기존 Gemini 방식 보존   |
| `.env.example`                             | **수정** - 환경 변수 추가          |

---

## 예상 효과

| 지표               | 현재 (Gemini만) | pdffigures2 적용 후 |
| ------------------ | --------------- | ------------------- |
| Detection API 호출 | ~12회/50페이지  | 0회                 |
| Detection 시간     | ~5분            | ~10초               |
| 총 처리 시간       | 15-20분         | 8-12분              |
| API 비용           | $0.05/paper     | $0.025/paper        |

---

## 리스크 및 완화 방안

1. **Docker 의존성**: 개발/배포 환경에 Docker 필요 (이미 Redis 사용 중이므로 문제 없음)
2. **정확도 차이**: pdffigures2가 일부 Figure 놓칠 수 있음 → 폴백 없이 진행 (사용자 선택)
3. **Table 처리**: pdffigures2는 Table도 감지 → Figure와 동일하게 처리

---

## 구현 순서

1. Phase 1: Docker 컨테이너 구성 (Dockerfile, server.py)
2. Phase 2: Node.js 클라이언트 (pdffigures2-client.ts, strategy)
3. Phase 3: 파이프라인 통합 (figure-pipeline.ts 수정)
4. Phase 4: 테스트 및 검증
