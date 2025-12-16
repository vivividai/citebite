# CiteBite 인프라 및 운영

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 인프라, 배포, 보안, 성능 최적화 및 비용 관리 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar API
- **[프론트엔드 스택](./FRONTEND.md)** - Next.js, React, UI 라이브러리
- **[백엔드 스택](./BACKEND.md)** - Node.js, API Routes, 인증
- **[데이터베이스 설계](./DATABASE.md)** - PostgreSQL, Supabase CLI, SQL migrations, Supabase Storage

---

## 1. 백그라운드 작업 처리

### 1.1 BullMQ

**역할**: 비동기 작업 큐 관리

**선택 이유:**

- **Redis 기반**: 빠른 큐 처리
- **재시도**: 실패 시 자동 재시도
- **스케줄링**: Cron, Delayed Jobs
- **우선순위**: 중요 작업 우선 처리
- **Dashboard**: Bull Board로 모니터링

**아키텍처:**

```
API Route → BullMQ Queue → Worker Process → 작업 완료 → DB 업데이트
```

**큐 정의:**

```typescript
// lib/jobs/queues.ts
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const pdfDownloadQueue = new Queue('pdf-download', { connection });
export const pdfIndexQueue = new Queue('pdf-index', { connection });
```

**Worker 정의:**

```typescript
// lib/jobs/workers/pdfDownloadWorker.ts
import { Worker } from 'bullmq';
import axios from 'axios';

const pdfDownloadWorker = new Worker(
  'pdf-download',
  async job => {
    const { collectionId, paperId, pdfUrl } = job.data;

    try {
      // 1. PDF 다운로드
      const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      const pdfBuffer = Buffer.from(response.data);

      // 2. Supabase Storage 저장
      await uploadPdf(paperId, pdfBuffer);

      // 3. 다음 작업 큐잉 (인덱싱)
      await pdfIndexQueue.add('index-pdf', {
        collectionId,
        paperId,
        pdfBuffer,
      });

      return { success: true };
    } catch (error) {
      console.error(`Failed to download PDF for ${paperId}:`, error);
      throw error; // BullMQ가 재시도
    }
  },
  {
    connection,
    concurrency: 5, // 동시 5개 작업
    limiter: {
      max: 10,
      duration: 1000, // 1초당 최대 10개
    },
  }
);

pdfDownloadWorker.on('completed', async job => {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('papers')
    .update({ vector_status: 'processing' })
    .eq('paper_id', job.data.paperId);
});

pdfDownloadWorker.on('failed', async (job, err) => {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('papers')
    .update({ vector_status: 'failed' })
    .eq('paper_id', job!.data.paperId);
});
```

**인덱싱 Worker:**

```typescript
// lib/jobs/workers/pdfIndexWorker.ts
import { Worker } from 'bullmq';
import { chunkText } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';
import { insertChunks } from '@/lib/db/chunks';

const pdfIndexWorker = new Worker(
  'pdf-indexing',
  async job => {
    const { collectionId, paperId, storageKey } = job.data;

    // 1. Supabase Storage에서 PDF 다운로드
    const pdfBuffer = await downloadPdfFromStorage(storageKey);

    // 2. PDF에서 텍스트 추출
    const text = await extractTextFromPdf(pdfBuffer);

    // 3. 텍스트 청킹 (4096자, 600자 오버랩)
    const chunks = chunkText(text);

    // 4. Gemini embedding-001로 임베딩 생성
    const embeddings = await generateDocumentEmbeddings(
      chunks.map(c => c.content)
    );

    // 5. pgvector에 저장
    await insertChunks(collectionId, paperId, chunks, embeddings);

    return { success: true, chunkCount: chunks.length };
  },
  {
    connection,
    concurrency: 3, // Gemini API rate limit 고려
  }
);

pdfIndexWorker.on('completed', async job => {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('papers')
    .update({ vector_status: 'completed' })
    .eq('paper_id', job.data.paperId);
});
```

---

### 1.2 Redis

**역할**: BullMQ 백엔드, 캐싱

**호스팅 옵션:**

- **Upstash**: Serverless Redis, 무료 티어 (10,000 commands/day)
- **Redis Cloud**: 30MB 무료
- **Railway**: 간편 배포

**캐싱 전략:**

```typescript
// lib/cache/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Semantic Scholar API 응답 캐싱 (24시간)
export async function getCachedSearch(query: string) {
  const cacheKey = `search:${query}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = await semanticScholarService.search(query);
  await redis.setex(cacheKey, 86400, JSON.stringify(result)); // 24시간

  return result;
}
```

---

### 1.3 진행 상태 추적

**방식 1: Polling (간단)**

```typescript
// API Route: GET /api/collections/{id}/status
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const { data: collectionPapers } = await supabase
    .from('collection_papers')
    .select(
      `
      paper:papers(paper_id, vector_status)
    `
    )
    .eq('collection_id', params.id);

  const total = collectionPapers?.length || 0;
  const completed =
    collectionPapers?.filter(cp => cp.paper.vector_status === 'completed')
      .length || 0;
  const failed =
    collectionPapers?.filter(cp => cp.paper.vector_status === 'failed')
      .length || 0;

  return NextResponse.json({
    total,
    completed,
    failed,
    progress: total > 0 ? (completed / total) * 100 : 0,
  });
}

// 프론트엔드에서 5초마다 폴링
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await fetch(`/api/collections/${id}/status`).then(r =>
      r.json()
    );
    setProgress(status.progress);

    if (status.progress === 100) {
      clearInterval(interval);
    }
  }, 5000);

  return () => clearInterval(interval);
}, [id]);
```

**방식 2: WebSocket (실시간, 복잡)**

- Socket.io 사용
- Worker에서 진행 상태 emit
- 프론트엔드에서 실시간 수신

---

## 2. 배포 및 인프라

### 2.1 Vercel (권장)

**역할**: Next.js 앱 호스팅

**장점:**

- **Zero Config**: Next.js 최적화
- **Edge Functions**: 글로벌 저지연
- **Preview Deployments**: PR별 미리보기
- **환경 변수 관리**: UI에서 설정
- **무료 티어**: Hobby plan (개인 프로젝트)

**배포 프로세스:**

```bash
# 1. Vercel CLI 설치
npm i -g vercel

# 2. 프로젝트 연결
vercel link

# 3. 환경 변수 설정
vercel env add DATABASE_URL
vercel env add GEMINI_API_KEY
# ...

# 4. 배포
vercel --prod
```

**자동 배포:**

- GitHub 연동 시 main 브랜치 push → 자동 배포
- PR 생성 시 Preview 배포

---

### 2.2 Background Worker 배포

**문제**: Vercel은 Serverless 환경으로 장시간 실행 Worker 불가

**해결책: Railway 또는 Render**

**Railway:**

```yaml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node dist/workers/index.js"
restartPolicyType = "always"
```

**Worker 코드 분리:**

```
workers/
├── index.ts              # 모든 Worker 시작
├── pdfDownloadWorker.ts
└── pdfIndexWorker.ts
```

```typescript
// workers/index.ts
import './pdfDownloadWorker';
import './pdfIndexWorker';

console.log('All workers started');
```

**배포:**

- Railway/Render에 Worker 앱 배포
- 환경 변수 공유 (DATABASE_URL, REDIS_URL 등)
- Vercel API와 동일한 DB/Redis 접근

---

### 2.3 데이터베이스 호스팅

**추천: Supabase**

**무료 티어:**

- 500MB PostgreSQL 데이터베이스
- 1GB Storage
- 50,000 MAU (월간 활성 사용자)
- 무제한 API 요청
- 프로젝트 비활성 시 1주일 후 일시 중지

**Pro 티어 ($25/월):**

- 8GB 데이터베이스 (초과 시 $0.125/GB)
- 100GB Storage (초과 시 $0.021/GB)
- 100,000 MAU (초과 시 $0.00325/MAU)
- 7일 자동 백업
- Email 지원

**장점:**

- Auth, Storage, DB가 통합된 단일 플랫폼
- Vercel 연동 간편 (환경 변수 자동 동기화)
- Dashboard에서 SQL 편집기, 테이블 브라우저 제공
- RLS로 데이터 보안 강화

**대안:**

- Neon: Serverless PostgreSQL, 0.5GB 무료
- Railway: 월 $5, 간단한 설정

---

### 2.4 모니터링

| 도구             | 역할            | 무료 티어          |
| ---------------- | --------------- | ------------------ |
| Sentry           | 에러 추적       | 5,000 errors/월    |
| LogTail          | 로그 집계       | 1GB/월             |
| Vercel Analytics | 성능 모니터링   | 무료 (Hobby plan)  |
| Bull Board       | BullMQ 모니터링 | Self-hosted (무료) |

---

## 3. 보안 및 성능 최적화

### 3.1 보안

#### 3.1.1 API Key 관리

```typescript
// .env.local (절대 Git에 커밋하지 않음)
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
DATABASE_URL=postgresql://...

# AI APIs
GEMINI_API_KEY=xxx
SEMANTIC_SCHOLAR_API_KEY=xxx

# Background Jobs
REDIS_URL=redis://...
```

**환경 변수 검증:**

```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  GEMINI_API_KEY: z.string(),
  // ...
});

export const env = envSchema.parse(process.env);
```

#### 3.1.2 Rate Limiting

```typescript
// middleware.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10초당 10 요청
});

export async function middleware(req: NextRequest) {
  const ip = req.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  return NextResponse.next();
}
```

#### 3.1.3 SQL Injection 방지

- Supabase Client 사용 (파라미터화된 쿼리)
- Raw SQL 사용 시 `supabase.rpc()` 또는 prepared statements

#### 3.1.4 XSS 방지

- React의 자동 이스케이핑
- `dangerouslySetInnerHTML` 사용 금지 (또는 sanitize)
- react-markdown 사용 시 sanitize 옵션

#### 3.1.5 Row Level Security (RLS) - Supabase

**역할**: 데이터베이스 수준에서 사용자별 접근 제어

**핵심 정책 예시 (SQL Migration 파일로 작성):**

```bash
# RLS 정책을 위한 마이그레이션 생성
npx supabase migration new enable_rls_policies
```

```sql
-- supabase/migrations/YYYYMMDD_enable_rls_policies.sql

-- Collections 테이블: RLS 활성화 및 정책 설정
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own collections"
ON collections FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can only update their own collections"
ON collections FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own collections"
ON collections FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Conversations 테이블: RLS 활성화
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own conversations"
ON conversations FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- Papers 테이블: 모든 인증된 사용자가 조회 가능 (공개 데이터)
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all papers"
ON papers FOR SELECT
TO authenticated
USING (true);

-- Messages 테이블: 자신의 대화에 속한 메시지만 접근
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access messages from their conversations"
ON messages FOR ALL
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  )
);
```

**적용 방법:**

```bash
# 로컬에 적용
npx supabase db reset

# 원격에 적용
npx supabase db push
```

**주의사항:**

- Service Role Key는 RLS를 우회하므로 서버에서만 사용
- Anon Key는 RLS 정책을 준수
- 복잡한 조인은 성능 영향 가능 (인덱스 최적화 필요)
- RLS 정책은 SQL 마이그레이션 파일로 버전 관리

---

### 3.2 성능 최적화

#### 3.2.1 데이터베이스 쿼리 최적화

```typescript
// N+1 쿼리 방지: 적절한 JOIN 사용
const supabase = createServerSupabaseClient();
const { data: collections } = await supabase
  .from('collections')
  .select(
    `
    *,
    collection_papers(
      paper:papers(*)
    ),
    conversations(count)
  `
  )
  .eq('user_id', userId);
```

**인덱스 추가 (SQL Migration):**

```sql
-- supabase/migrations/YYYYMMDD_add_indexes.sql
CREATE INDEX idx_collections_user_id_is_public ON collections(user_id, is_public);
CREATE INDEX idx_collection_papers_collection_id ON collection_papers(collection_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
```

#### 3.2.2 캐싱 전략

| 계층        | 도구        | 캐싱 대상                     | TTL       |
| ----------- | ----------- | ----------------------------- | --------- |
| CDN         | Vercel Edge | 정적 파일, API 응답 (공개)    | 1시간     |
| Application | Redis       | Semantic Scholar API 응답     | 24시간    |
| Database    | PostgreSQL  | Materialized Views (인사이트) | 수동 갱신 |
| Client      | React Query | 컬렉션, 대화 데이터           | 1분       |

#### 3.2.3 이미지/PDF 최적화

- PDF 썸네일 생성 (첫 페이지)
- Supabase Storage CDN 자동 캐싱 (285개 글로벌 엣지)
- Lazy Loading (react-lazyload)
- Signed URL 캐싱 (1시간 TTL)

#### 3.2.4 코드 스플리팅

```typescript
// 대화 UI는 필요할 때만 로드
const ChatInterface = dynamic(() => import('@/components/ChatInterface'), {
  loading: () => <Skeleton />,
  ssr: false // 클라이언트에서만 렌더링
});
```

---

## 4. 개발 도구 및 테스팅

### 4.1 개발 도구

| 도구        | 역할                     |
| ----------- | ------------------------ |
| ESLint      | 코드 린팅 (오류 검출)    |
| Prettier    | 코드 포맷팅              |
| Husky       | Git Hooks (커밋 전 린트) |
| lint-staged | 스테이징된 파일만 린트   |
| TypeScript  | 타입 체킹                |

**설정 예시:**

```json
// .eslintrc.json
{
  "extends": ["next/core-web-vitals", "prettier"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error"
  }
}

// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2
}

// package.json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write ."
  },
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

---

### 4.2 테스팅

#### 4.2.1 Unit Testing (Jest + React Testing Library)

```typescript
// __tests__/components/CollectionCard.test.tsx
import { render, screen } from '@testing-library/react';
import CollectionCard from '@/components/CollectionCard';

describe('CollectionCard', () => {
  it('renders collection name', () => {
    const collection = {
      id: '1',
      name: 'Transformer Architecture',
      paperCount: 42
    };

    render(<CollectionCard collection={collection} />);

    expect(screen.getByText('Transformer Architecture')).toBeInTheDocument();
    expect(screen.getByText('42개 논문')).toBeInTheDocument();
  });
});
```

#### 4.2.2 API Testing (Supertest)

```typescript
// __tests__/api/collections.test.ts
import request from 'supertest';
import { app } from '@/app';

describe('POST /api/collections', () => {
  it('creates a new collection', async () => {
    const response = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'Test Collection',
        keywords: 'machine learning',
      });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Test Collection');
  });
});
```

#### 4.2.3 E2E Testing (Playwright)

```typescript
// e2e/collection-flow.spec.ts
import { test, expect } from '@playwright/test';

test('create collection and chat', async ({ page }) => {
  // 로그인
  await page.goto('/login');
  await page.fill('input[name=email]', 'test@example.com');
  await page.fill('input[name=password]', 'password');
  await page.click('button[type=submit]');

  // 컬렉션 생성
  await page.goto('/collections/new');
  await page.fill('input[name=name]', 'Test Collection');
  await page.fill('input[name=keywords]', 'transformers');
  await page.click('button:has-text("컬렉션 만들기")');

  // 대화 시작
  await page.waitForSelector('text=컬렉션 준비 완료');
  await page.click('button:has-text("AI와 대화 시작하기")');

  await page.fill(
    'textarea[placeholder*="메시지"]',
    'What are the main approaches?'
  );
  await page.click('button:has-text("전송")');

  // 답변 대기
  await page.waitForSelector('text=참조 논문');

  expect(await page.textContent('role=assistant')).toContain('approach');
});
```

---

## 5. 비용 예측

### 5.1 초기 단계 (100 사용자)

**가정:**

- 사용자당 평균 2개 컬렉션
- 컬렉션당 평균 50개 논문
- 대화: 사용자당 월 50회
- 총 저장 용량: 100 users × 50 papers × 5MB = 25GB

| 항목                        | 사용량                                                   | 단가         | 월 비용     |
| --------------------------- | -------------------------------------------------------- | ------------ | ----------- |
| **Vercel (Frontend + API)** | Hobby plan                                               | 무료         | $0          |
| **Supabase**                |                                                          |              |             |
| - PostgreSQL                | <500MB                                                   | 무료 티어    | $0          |
| - Storage                   | 25GB (무료 1GB 초과분 24GB)                              | $0.021/GB    | $0.50       |
| - Auth                      | <50K MAU                                                 | 무료 티어    | $0          |
| **Railway (Workers)**       | 1 instance                                               | Starter plan | $5          |
| **Upstash Redis**           | <10K cmds/day                                            | 무료 티어    | $0          |
| **Gemini API**              |                                                          |              |             |
| - Embedding (초기)          | 100 users × 2 colls × 50 papers × 50K chars = 500M chars | $0.00001/1K  | $5          |
| - Chat (input)              | 100 users × 50 msgs × 2K tokens = 10M tokens             | $0.075/1M    | $0.75       |
| - Chat (output)             | 100 users × 50 msgs × 500 tokens = 2.5M tokens           | $0.30/1M     | $0.75       |
| **Semantic Scholar API**    | 무료 (API Key 발급)                                      | 무료         | $0          |
| **합계**                    |                                                          |              | **~$12/월** |

**참고**:

- 임베딩은 초기 비용, 이후는 대화 비용만 발생 → 월 ~$7
- Supabase 무료 티어만으로 DB + Auth 커버 가능
- Storage는 Pro 플랜 없이도 사용 가능 (종량제)

---

### 5.2 성장 단계 (1,000 사용자)

**가정:**

- 총 저장 용량: 1,000 users × 50 papers × 5MB = 250GB
- DB 크기: ~5GB (메타데이터, 대화 기록)
- MAU: ~700명 (70% 활성률)

| 항목                      | 사용량                              | 월 비용                |
| ------------------------- | ----------------------------------- | ---------------------- |
| **Vercel Pro**            | 유료 전환 필요                      | $20                    |
| **Supabase Pro**          |                                     | $25                    |
| - PostgreSQL              | 5GB (8GB 포함 범위 내)              | 포함                   |
| - Storage                 | 250GB (100GB 초과분 150GB)          | 150GB × $0.021 = $3.15 |
| - Auth                    | 700 MAU (100K 포함 범위 내)         | 포함                   |
| **Railway (Workers × 2)** | 2 instances                         | $10                    |
| **Upstash Redis**         | 1M cmds/day                         | $10                    |
| **Gemini API**            | 1,000 users × 50 msgs × 2.5K tokens | $9.38                  |
| **합계**                  |                                     | **~$77/월**            |

**참고**:

- Supabase Pro 전환 시 백업, Email 지원 포함
- Storage 초과 비용은 실제 사용량에 따라 변동
- 10,000 사용자 규모에서도 Supabase Pro + Storage 종량제로 충분

---

## 6. 개발 로드맵

전체 구현 단계별 상세 체크리스트는 **[ROADMAP.md](../ROADMAP.md)**를 참조하세요.

프로젝트는 8개 Phase (총 10-12주)로 진행되며, 각 Phase별 상세 작업 항목, E2E 테스트 포인트, 완료 기준이 ROADMAP 문서에 포함되어 있습니다.
