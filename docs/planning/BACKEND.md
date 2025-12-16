# CiteBite 백엔드 스택

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 백엔드 개발을 위한 기술 스택 및 패턴 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar API
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
│       ├── add-papers/route.ts
│       ├── bulk-upload/
│       │   ├── route.ts      # POST (PDF 일괄 업로드 + 매칭)
│       │   └── confirm/route.ts # POST (매칭 확정 + 인덱싱)
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

---

## 5. Bulk PDF Upload API

### 5.1 개요

여러 PDF 파일을 한 번에 업로드하고 컬렉션 내 논문과 자동 매칭하는 API입니다.

**관련 문서**: [BULK_PDF_UPLOAD_PLAN.md](./BULK_PDF_UPLOAD_PLAN.md)

### 5.2 POST /api/collections/[id]/bulk-upload

PDF 파일들을 업로드하고 메타데이터를 추출하여 매칭 결과를 반환합니다.

**Request:**

```typescript
// Content-Type: multipart/form-data
{
  files: File[] // 최대 50개, 각 파일 최대 100MB
}
```

**Response:**

```typescript
{
  results: Array<{
    filename: string;
    tempStorageKey: string;
    match: {
      paperId: string | null;
      paperTitle: string | null;
      confidence: 'high' | 'medium' | 'low' | 'none';
      matchMethod: 'doi' | 'arxiv' | 'title' | 'manual';
    };
    extractedMetadata: {
      doi?: string;
      arxivId?: string;
      title?: string;
    };
  }>;
  unmatchedPapers: Array<{
    paperId: string;
    title: string;
  }>;
}
```

**구현 예시:**

```typescript
// app/api/collections/[id]/bulk-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractPdfMetadata } from '@/lib/pdf/metadata-extractor';
import { matchPdfToPaper } from '@/lib/pdf/matcher';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 컬렉션 소유권 확인
  const { data: collection } = await supabase
    .from('collections')
    .select('id, user_id')
    .eq('id', params.id)
    .single();

  if (!collection || collection.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // PDF가 필요한 논문 조회
  const { data: papersNeedingPdf } = await supabase
    .from('collection_papers')
    .select('papers(*)')
    .eq('collection_id', params.id)
    .in('papers.vector_status', ['failed', 'pending']);

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  // 파일 검증
  if (files.length > 50) {
    return NextResponse.json(
      { error: 'Too many files (max 50)' },
      { status: 400 }
    );
  }

  const results = [];

  for (const file of files) {
    // 크기 검증
    if (file.size > 100 * 1024 * 1024) {
      results.push({
        filename: file.name,
        error: 'File too large (max 100MB)',
      });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 메타데이터 추출
    const metadata = await extractPdfMetadata(buffer);

    // 매칭 시도
    const matchResult = await matchPdfToPaper(metadata, papersNeedingPdf);

    // 임시 저장
    const tempKey = `temp/${user.id}/${crypto.randomUUID()}.pdf`;
    await supabase.storage.from('pdfs').upload(tempKey, buffer);

    results.push({
      filename: file.name,
      tempStorageKey: tempKey,
      match: matchResult,
      extractedMetadata: metadata,
    });
  }

  return NextResponse.json({
    results,
    unmatchedPapers: papersNeedingPdf.filter(
      p => !results.some(r => r.match.paperId === p.id)
    ),
  });
}
```

### 5.3 POST /api/collections/[id]/bulk-upload/confirm

사용자가 확인한 매칭을 확정하고 인덱싱 작업을 시작합니다.

**Request:**

```typescript
{
  matches: Array<{
    tempStorageKey: string;
    paperId: string;
  }>;
}
```

**Response:**

```typescript
{
  success: true;
  processed: number;
  indexingJobIds: string[];
}
```

**구현 예시:**

```typescript
// app/api/collections/[id]/bulk-upload/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { pdfIndexingQueue } from '@/lib/jobs/queues';

const ConfirmSchema = z.object({
  matches: z.array(
    z.object({
      tempStorageKey: z.string(),
      paperId: z.string().uuid(),
    })
  ),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { matches } = ConfirmSchema.parse(body);

  const indexingJobIds: string[] = [];

  for (const match of matches) {
    // 임시 파일을 영구 저장소로 이동
    const permanentKey = `collections/${params.id}/${match.paperId}.pdf`;

    const { data: fileData } = await supabase.storage
      .from('pdfs')
      .download(match.tempStorageKey);

    await supabase.storage.from('pdfs').upload(permanentKey, fileData!);

    // 임시 파일 삭제
    await supabase.storage.from('pdfs').remove([match.tempStorageKey]);

    // 논문 레코드 업데이트
    await supabase
      .from('papers')
      .update({
        storage_path: permanentKey,
        pdf_source: 'manual_bulk',
        vector_status: 'pending',
      })
      .eq('id', match.paperId);

    // 인덱싱 작업 큐에 추가
    const job = await pdfIndexingQueue.add('index-pdf', {
      paperId: match.paperId,
      collectionId: params.id,
      storagePath: permanentKey,
    });

    indexingJobIds.push(job.id!);
  }

  return NextResponse.json({
    success: true,
    processed: matches.length,
    indexingJobIds,
  });
}
```

### 5.4 PDF 메타데이터 추출

```typescript
// lib/pdf/metadata-extractor.ts
import pdf from 'pdf-parse';

const DOI_REGEX = /\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&\'<>])\S)+)\b/gi;
const ARXIV_REGEX = /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?)/gi;

export interface PdfMetadata {
  doi?: string;
  arxivId?: string;
  title?: string;
  text?: string;
}

export async function extractPdfMetadata(buffer: Buffer): Promise<PdfMetadata> {
  const data = await pdf(buffer);
  const text = data.text;

  // DOI 추출
  const doiMatch = text.match(DOI_REGEX);
  const doi = doiMatch?.[0];

  // arXiv ID 추출
  const arxivMatch = text.match(ARXIV_REGEX);
  const arxivId = arxivMatch?.[1];

  // 제목 추출 (첫 페이지의 첫 몇 줄에서 추출)
  const lines = text.split('\n').filter(l => l.trim());
  const title = extractTitle(lines.slice(0, 20));

  return { doi, arxivId, title, text: text.slice(0, 5000) };
}

function extractTitle(lines: string[]): string | undefined {
  // 휴리스틱: 가장 긴 줄 중 하나가 제목일 가능성 높음
  const candidates = lines
    .filter(l => l.length > 20 && l.length < 200)
    .filter(l => !l.match(/abstract|introduction|doi|arxiv/i));

  return candidates[0]?.trim();
}
```

### 5.5 매칭 로직

```typescript
// lib/pdf/matcher.ts
import { searchByTitle } from '@/lib/semantic-scholar/client';

export interface MatchResult {
  paperId: string | null;
  paperTitle: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchMethod: 'doi' | 'arxiv' | 'title' | 'manual';
}

export async function matchPdfToPaper(
  metadata: PdfMetadata,
  papers: Paper[]
): Promise<MatchResult> {
  // 1. DOI 매칭 (highest confidence)
  if (metadata.doi) {
    const match = papers.find(
      p => p.doi?.toLowerCase() === metadata.doi?.toLowerCase()
    );
    if (match) {
      return {
        paperId: match.id,
        paperTitle: match.title,
        confidence: 'high',
        matchMethod: 'doi',
      };
    }
  }

  // 2. arXiv ID 매칭
  if (metadata.arxivId) {
    const match = papers.find(p => p.external_ids?.ArXiv === metadata.arxivId);
    if (match) {
      return {
        paperId: match.id,
        paperTitle: match.title,
        confidence: 'high',
        matchMethod: 'arxiv',
      };
    }
  }

  // 3. 제목 검색으로 매칭
  if (metadata.title) {
    const searchResult = await searchByTitle(metadata.title);
    if (searchResult) {
      const match = papers.find(
        p => p.semantic_scholar_id === searchResult.paperId
      );
      if (match) {
        return {
          paperId: match.id,
          paperTitle: match.title,
          confidence: 'medium',
          matchMethod: 'title',
        };
      }
    }
  }

  // 4. 매칭 실패
  return {
    paperId: null,
    paperTitle: null,
    confidence: 'none',
    matchMethod: 'manual',
  };
}
```

---

**문서 버전**: v1.1
**수정일**: 2025-11-29
**변경사항**: Bulk PDF Upload API 섹션 추가
