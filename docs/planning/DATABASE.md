# CiteBite 데이터베이스 및 저장소

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 데이터베이스 설계 및 저장소 관리 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar API
- **[프론트엔드 스택](./FRONTEND.md)** - Next.js, React, UI 라이브러리
- **[백엔드 스택](./BACKEND.md)** - Node.js, API Routes, 인증
- **[인프라 및 운영](./INFRASTRUCTURE.md)** - 배포, 백그라운드 작업, 보안

---

## 1. PostgreSQL

**역할**: 주 데이터베이스 (사용자, 컬렉션, 논문, 대화 저장)

**선택 이유:**

- **관계형**: 복잡한 조인 쿼리 지원 (컬렉션-논문 다대다 관계)
- **ACID**: 트랜잭션 보장 (컬렉션 복사 시 무결성)
- **Full-Text Search**: 대화 검색, 컬렉션 검색
- **JSON 지원**: filters 같은 비정형 데이터 저장
- **확장성**: Read Replica, Connection Pooling

---

### 1.1 스키마 설계

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Collections
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  search_query TEXT NOT NULL,
  filters JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  -- Note: file_search_store_id 컬럼은 더 이상 사용하지 않음 (pgvector로 전환)
  created_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  copy_count INT DEFAULT 0
);

-- Papers
CREATE TABLE papers (
  paper_id VARCHAR(255) PRIMARY KEY, -- Semantic Scholar ID
  title TEXT NOT NULL,
  authors JSONB,
  year INT,
  abstract TEXT,
  citation_count INT,
  venue VARCHAR(255),
  open_access_pdf_url TEXT,
  pdf_source VARCHAR(20), -- 'auto' | 'manual'
  vector_status VARCHAR(20), -- 'pending' | 'completed' | 'failed'
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Collections <-> Papers (Many-to-Many)
CREATE TABLE collection_papers (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  paper_id VARCHAR(255) REFERENCES papers(paper_id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, paper_id)
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  cited_papers JSONB, -- Array of paper IDs
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_is_public ON collections(is_public);
CREATE INDEX idx_conversations_collection_id ON conversations(collection_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_papers_citation_count ON papers(citation_count DESC);
```

---

### 1.2 호스팅 옵션

**Supabase PostgreSQL (권장):**

- **무료 티어**: 500MB 데이터베이스, 무제한 API 요청
- **Pro 티어**: $25/월부터, 8GB 포함
- **통합 기능**: Auth, Storage, Realtime이 동일 DB에서 작동
- **Connection Pooling**: PgBouncer 기본 제공
- **백업**: Pro 티어에서 7일 자동 백업
- **확장성**: Read Replica, 수직/수평 확장 지원

**대안:**

- **Vercel Postgres**: Next.js 배포 시 간편 (Neon 기반)
- **Neon**: Serverless PostgreSQL, 오토스케일링
- **Railway**: 간단한 설정, 합리적 가격

**Supabase 선택 이유:**

- Auth, Storage와 동일 플랫폼에서 관리
- Row Level Security (RLS)로 데이터 보안 강화
- Realtime 구독 기능 (선택적 사용)
- Dashboard에서 SQL 편집기, 테이블 브라우저 제공

---

## 2. Supabase Client SDK & Database Workflow

**역할**: TypeScript 친화적 DB 접근 레이어 및 마이그레이션 관리

**주요 기능:**

- **타입 안정성**: DB 스키마 → TypeScript 타입 자동 생성 (`supabase gen types`)
- **SQL 마이그레이션**: Supabase CLI를 통한 버전 관리
- **PostgREST API**: 자동 생성되는 RESTful API
- **실시간 구독**: Realtime 기능 (선택적 사용)

---

Supabase CLI를 사용하여 SQL 파일로 직접 스키마를 작성합니다:

```bash
# 새 마이그레이션 생성
npx supabase migration new init_schema
```

```sql
-- supabase/migrations/20250115000000_init_schema.sql

-- Users 테이블 (Supabase Auth와 연동)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Collections 테이블
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  search_query TEXT NOT NULL,
  filters JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  file_search_store_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  copy_count INT DEFAULT 0
);

-- Papers 테이블
CREATE TABLE papers (
  paper_id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  authors JSONB,
  year INT,
  abstract TEXT,
  citation_count INT,
  venue VARCHAR(255),
  open_access_pdf_url TEXT,
  pdf_source VARCHAR(20),
  vector_status VARCHAR(20),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Collections <-> Papers (Many-to-Many)
CREATE TABLE collection_papers (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  paper_id VARCHAR(255) REFERENCES papers(paper_id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, paper_id)
);

-- Conversations 테이블
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP DEFAULT NOW()
);

-- Messages 테이블
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  cited_papers JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_is_public ON collections(is_public);
CREATE INDEX idx_conversations_collection_id ON conversations(collection_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_papers_citation_count ON papers(citation_count DESC);
```

**마이그레이션 적용:**

```bash
# 로컬 DB에 적용
npx supabase db reset

# 원격 DB에 적용
npx supabase db push
```

---

### 2.2 TypeScript 타입 생성

Supabase CLI로 데이터베이스 스키마로부터 TypeScript 타입을 자동 생성:

```bash
# 타입 생성
npx supabase gen types typescript --local > src/types/database.types.ts

# 또는 원격 DB에서 생성
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

생성된 타입 사용:

```typescript
// src/types/database.types.ts (자동 생성)
export type Database = {
  public: {
    Tables: {
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          search_query: string;
          filters: Json | null;
          is_public: boolean;
          // ...
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          // ...
        };
        Update: {
          name?: string;
          // ...
        };
      };
      // ... 다른 테이블들
    };
  };
};
```

### 2.3 Supabase Client 사용 예시

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Database } from '@/types/database.types';

// 컬렉션 생성
async function createCollection(
  userId: string,
  data: { name: string; keywords: string; filters: any }
) {
  const supabase = createServerSupabaseClient();

  // 1. 컬렉션 생성
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: data.name,
      search_query: data.keywords,
      filters: data.filters,
    })
    .select()
    .single();

  if (collectionError) throw collectionError;

  // 2. 논문 관계 추가
  const { error: papersError } = await supabase
    .from('collection_papers')
    .insert(
      papers.map(p => ({
        collection_id: collection.id,
        paper_id: p.paperId,
      }))
    );

  if (papersError) throw papersError;

  return collection;
}

// 복잡한 조인 쿼리
async function getCollectionsWithPapers(userId: string) {
  const supabase = createServerSupabaseClient();

  const { data: collections, error } = await supabase
    .from('collections')
    .select(
      `
      *,
      collection_papers(count),
      conversations(count),
      collection_papers(
        paper:papers(*)
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return collections;
}

// 특정 컬렉션의 Top 논문
async function getTopPapers(collectionId: string, limit: number = 5) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('collection_papers')
    .select(
      `
      paper:papers(*)
    `
    )
    .eq('collection_id', collectionId)
    .order('papers.citation_count', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data.map(item => item.paper);
}
```

---

## 3. 파일 저장소 (Supabase Storage)

**역할**: PDF 원본 파일 저장 및 제공

**선택: Supabase Storage (권장)**

**선택 이유:**

- **통합 플랫폼**: Auth, DB와 동일한 Supabase 프로젝트에서 관리
- **Row Level Security (RLS)**: 파일 수준 접근 제어
- **CDN 통합**: 285개 글로벌 도시에서 캐싱
- **이미지 변환**: 자동 리사이징 및 최적화 (PDF 썸네일 생성 가능)
- **비용 효율**: 무료 티어 1GB, Pro $25/월에 100GB 포함

---

### 3.1 주요 기능

- **버킷(Bucket)**: 논리적 저장소 단위 (예: `pdfs`, `thumbnails`)
- **공개/비공개**: 버킷별 접근 권한 설정
- **Resumable Upload**: TUS 프로토콜로 대용량 파일 안정적 업로드
- **Signed URLs**: 임시 접근 URL 생성
- **Webhook**: 파일 업로드/삭제 이벤트 감지

---

### 3.2 설정 및 사용 예시

```typescript
// lib/storage/supabaseStorage.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 서버 전용 키
);

// PDF 업로드
export async function uploadPdf(paperId: string, pdfBuffer: Buffer) {
  const fileName = `${paperId}.pdf`;
  const filePath = `pdfs/${fileName}`;

  const { data, error } = await supabase.storage
    .from('pdfs')
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600', // 1시간 CDN 캐싱
    });

  if (error) {
    throw new Error(`PDF upload failed: ${error.message}`);
  }

  return data.path;
}

// PDF 다운로드 URL 생성
export async function getPdfUrl(paperId: string, expiresIn: number = 3600) {
  const filePath = `pdfs/${paperId}.pdf`;

  const { data, error } = await supabase.storage
    .from('pdfs')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

// PDF 다운로드 (Buffer로)
export async function downloadPdf(paperId: string): Promise<Buffer> {
  const filePath = `pdfs/${paperId}.pdf`;

  const { data, error } = await supabase.storage
    .from('pdfs')
    .download(filePath);

  if (error) {
    throw new Error(`PDF download failed: ${error.message}`);
  }

  const buffer = await data.arrayBuffer();
  return Buffer.from(buffer);
}

// PDF 삭제
export async function deletePdf(paperId: string) {
  const filePath = `pdfs/${paperId}.pdf`;

  const { error } = await supabase.storage.from('pdfs').remove([filePath]);

  if (error) {
    throw new Error(`PDF deletion failed: ${error.message}`);
  }
}
```

---

### 3.3 Row Level Security (RLS) 정책

```sql
-- Supabase Dashboard에서 설정 (Storage > Policies)

-- 1. 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pdfs');

-- 2. 자신의 컬렉션에 속한 논문만 다운로드 가능
CREATE POLICY "Users can download own collection PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs' AND
  EXISTS (
    SELECT 1 FROM papers p
    JOIN collection_papers cp ON p.paper_id = p.paper_id
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.user_id = auth.uid()
    AND name = (storage.foldername(object.name))[1]
  )
);
```

---

### 3.4 비용 예측

**예시: 100 사용자, 컬렉션당 50논문**

- 저장: 100 users × 50 papers × 5MB = 25GB
- 무료 티어 초과분: 25GB - 1GB = 24GB
- 월 비용: 24GB × $0.021 = **$0.504**
- 대역폭(Egress): 무제한 (Pro 티어 250GB까지 무료)

**주의사항:**

- 파일명 중복 시 오류 발생 (`upsert: false`)
- 덮어쓰기 필요 시 `upsert: true` 사용하되, CDN 캐시 갱신 지연 주의
- Service Role Key는 서버에서만 사용 (클라이언트 노출 금지)

---

## 4. Vector Database (pgvector)

**역할**: 논문 청크의 벡터 임베딩 저장 및 유사도 검색

**데이터 플로우:**

1. PDF 파일 → Supabase Storage 저장 (원본 보관)
2. PDF → 텍스트 추출 (pdf-parse)
3. 텍스트 → 청킹 (4096자, 600자 오버랩)
4. 청크 → Gemini embedding-001로 768차원 벡터 생성
5. 벡터 → pgvector paper_chunks 테이블에 저장
6. 쿼리 시: 하이브리드 검색 (벡터 70% + 키워드 30%)

**paper_chunks 테이블:**

```sql
CREATE TABLE paper_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id VARCHAR(255) NOT NULL,
  collection_id UUID NOT NULL,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  token_count INT NOT NULL,
  embedding vector(768) NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 인덱스로 고속 검색
CREATE INDEX idx_chunks_embedding_hnsw ON paper_chunks
USING hnsw (embedding vector_cosine_ops);
```

**공개 컬렉션 복사 시:**

- 동일한 paper_id의 청크는 재사용 가능
- 비용 절감 + 인덱싱 시간 단축
