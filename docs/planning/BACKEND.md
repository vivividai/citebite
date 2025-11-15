# CiteBite 백엔드 스택

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 백엔드 개발을 위한 기술 스택 및 패턴 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar, Gemini File Search API
- **[프론트엔드 스택](./FRONTEND.md)** - Next.js, React, UI 라이브러리
- **[데이터베이스 설계](./DATABASE.md)** - PostgreSQL, Supabase CLI, SQL migrations, Supabase Storage
- **[인프라 및 운영](./INFRASTRUCTURE.md)** - 배포, 백그라운드 작업, 보안

---

## 1. 런타임 및 프레임워크

### 1.1 Node.js 20+

**선택 이유:**

- **성능**: V8 엔진 최적화
- **생태계**: npm 패키지 풍부
- **비동기**: 이벤트 루프로 I/O 효율적 처리
- **TypeScript 지원**: ts-node, tsx 사용

---

### 1.2 Next.js API Routes

**역할**: RESTful API 엔드포인트

**구조:**

```
app/api/
├── collections/
│   ├── route.ts              # GET /api/collections, POST
│   └── [id]/
│       ├── route.ts          # GET, PATCH, DELETE
│       ├── update/route.ts   # POST (신규 논문 확인)
│       └── add-papers/route.ts
├── papers/
│   └── [id]/
│       └── upload/route.ts   # POST (PDF 업로드)
├── conversations/
│   └── [id]/
│       └── messages/route.ts # GET, POST
└── auth/
    └── [...nextauth]/route.ts
```

**API Route 예시:**

```typescript
// app/api/collections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: collections, error } = await supabase
    .from('collections')
    .select(
      `
      *,
      collection_papers(count),
      conversations(count)
    `
    )
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(collections);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  const body = await req.json();

  // 입력 검증
  const validated = CollectionSchema.parse(body);

  // 비즈니스 로직
  const collection = await collectionService.create(session.user.id, validated);

  return NextResponse.json(collection, { status: 201 });
}
```

**대안 (필요 시):**

- **Express.js**: API Routes가 제한적일 경우 별도 서버
- **Fastify**: 더 빠른 성능 필요 시

---

## 2. 인증 및 권한 관리

### 2.1 Supabase Auth (권장)

**역할**: 사용자 인증, 세션 관리, 권한 제어

**지원 기능:**

- **OAuth 로그인**: Google, GitHub, Discord 등 20+ 프로바이더
- **Email/Password**: 자체 인증, Magic Link 지원
- **Session 관리**: JWT 기반 자동 세션 관리
- **Row Level Security (RLS)**: 데이터베이스 수준 권한 제어
- **Next.js 통합**: @supabase/ssr 패키지로 SSR 지원

**설정 예시:**

```typescript
// lib/supabase/client.ts (Client Component용)
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// lib/supabase/server.ts (Server Component/API용)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

// app/api/auth/callback/route.ts (OAuth 콜백)
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(requestUrl.origin);
}
```

**인증 사용 예시:**

```typescript
// components/LoginButton.tsx
'use client';
import { createClient } from '@/lib/supabase/client';

export function LoginButton() {
  const supabase = createClient();

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/api/auth/callback`
      }
    });
  }

  return <button onClick={handleGoogleLogin}>Google로 로그인</button>;
}

// app/api/collections/route.ts (인증 확인)
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 인증된 사용자의 컬렉션 조회
  const { data: collections, error: dbError } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(collections);
}
```

**장점:**

- PostgreSQL과 완벽 통합 (같은 DB 사용)
- Row Level Security로 데이터 접근 제어
- 추가 인증 서버 불필요
- 무료 티어에서 50,000 MAU 지원

---

## 3. 입력 검증

### 3.1 Zod

**역할**: 런타임 타입 검증, API 입력 검증

**주요 기능:**

- **스키마 정의**: TypeScript 타입 자동 추론
- **에러 메시지**: 상세한 검증 실패 원인
- **파싱**: 입력 데이터 변환 (문자열 → 숫자 등)

**사용 예시:**

```typescript
import { z } from 'zod';

// 스키마 정의
const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.string().min(1),
  filters: z.object({
    yearFrom: z.number().int().min(1900).optional(),
    yearTo: z.number().int().max(new Date().getFullYear()).optional(),
    minCitations: z.number().int().min(0).optional(),
    openAccessOnly: z.boolean().optional(),
  }),
});

// 타입 추론
type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;

// API에서 사용
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const validated = CreateCollectionSchema.parse(body);
    // validated는 CreateCollectionInput 타입
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ errors: error.errors }, { status: 400 });
    }
  }
}
```

---

## 4. 외부 API 클라이언트

### 4.1 Axios

**역할**: HTTP 요청 (Semantic Scholar API, Gemini API)

**선택 이유:**

- **Interceptors**: 요청/응답 공통 처리 (헤더, 에러)
- **Timeout**: 자동 타임아웃 설정
- **Retry**: axios-retry로 재시도 로직

**Semantic Scholar Client 예시:**

```typescript
// lib/semantic-scholar/client.ts
import axios from 'axios';
import axiosRetry from 'axios-retry';

const semanticScholarClient = axios.create({
  baseURL: 'https://api.semanticscholar.org/graph/v1',
  timeout: 30000,
  headers: {
    'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY,
  },
});

// 재시도 설정
axiosRetry(semanticScholarClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: error => {
    return (
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      error.response?.status === 429
    ); // Rate limit
  },
});

// 검색 함수
export async function searchPapers(params: SearchParams) {
  const response = await semanticScholarClient.get('/paper/search/bulk', {
    params: {
      query: params.query,
      fields: 'paperId,title,authors,year,citationCount,openAccessPdf,abstract',
      limit: params.limit || 100,
    },
  });

  return response.data.data; // 논문 배열
}
```

**Gemini API Client:**

```typescript
// lib/gemini/client.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function uploadToFileSearchStore(
  storeId: string,
  pdfBuffer: Buffer,
  metadata: Record<string, string>
) {
  const fileSearchStore = genai.fileSearchStores.get(storeId);

  await fileSearchStore.uploadToFileSearchStore({
    file: {
      data: pdfBuffer,
      mimeType: 'application/pdf',
    },
    metadata,
  });
}
```
