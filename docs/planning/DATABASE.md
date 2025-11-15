# CiteBite 데이터베이스 및 저장소

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 데이터베이스 설계 및 저장소 관리 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar, Gemini File Search API
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
- **JSON 지원**: insightSummary 같은 비정형 데이터 저장
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
  file_search_store_id VARCHAR(255), -- Gemini Store ID
  insight_summary JSONB,
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

## 2. Prisma ORM

**역할**: TypeScript 친화적 DB 접근 레이어

**주요 기능:**

- **타입 안정성**: DB 스키마 → TypeScript 타입 자동 생성
- **마이그레이션**: 스키마 변경 관리
- **쿼리 빌더**: 직관적 API
- **관계 로딩**: Eager/Lazy Loading

---

### 2.1 Prisma Schema

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  name          String?
  collections   Collection[]
  conversations Conversation[]
  createdAt     DateTime       @default(now())
}

model Collection {
  id                  String              @id @default(uuid())
  userId              String
  user                User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  name                String
  searchQuery         String
  filters             Json?
  isPublic            Boolean             @default(false)
  fileSearchStoreId   String?
  insightSummary      Json?
  papers              CollectionPaper[]
  conversations       Conversation[]
  createdAt           DateTime            @default(now())
  lastUpdatedAt       DateTime            @default(now())
  copyCount           Int                 @default(0)
}

model Paper {
  paperId           String            @id
  title             String
  authors           Json
  year              Int?
  abstract          String?
  citationCount     Int?
  venue             String?
  openAccessPdfUrl  String?
  pdfSource         String?           // 'auto' | 'manual'
  vectorStatus      String?           // 'pending' | 'completed'
  uploadedBy        String?
  collections       CollectionPaper[]
  createdAt         DateTime          @default(now())
}

model CollectionPaper {
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  collectionId String
  paper        Paper      @relation(fields: [paperId], references: [paperId], onDelete: Cascade)
  paperId      String

  @@id([collectionId, paperId])
}

model Conversation {
  id             String    @id @default(uuid())
  collectionId   String
  collection     Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  userId         String
  user           User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  title          String?
  messages       Message[]
  createdAt      DateTime   @default(now())
  lastMessageAt  DateTime   @default(now())
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String       // 'user' | 'assistant'
  content        String       @db.Text
  citedPapers    Json?
  timestamp      DateTime     @default(now())
}
```

---

### 2.2 사용 예시

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 컬렉션 생성 (트랜잭션)
async function createCollection(userId: string, data: CreateCollectionInput) {
  return await prisma.$transaction(async tx => {
    const collection = await tx.collection.create({
      data: {
        userId,
        name: data.name,
        searchQuery: data.keywords,
        filters: data.filters,
      },
    });

    // 논문 추가
    await tx.collectionPaper.createMany({
      data: papers.map(p => ({
        collectionId: collection.id,
        paperId: p.paperId,
      })),
    });

    return collection;
  });
}

// 복잡한 조인 쿼리
const collections = await prisma.collection.findMany({
  where: { userId },
  include: {
    _count: {
      select: { papers: true, conversations: true },
    },
    papers: {
      include: { paper: true },
      take: 5,
      orderBy: { paper: { citationCount: 'desc' } },
    },
  },
});
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

## 4. Vector Database (Gemini File Search)

**역할**: 앞서 [외부 API 가이드](./EXTERNAL_APIS.md)의 섹션 2.2에서 상세 설명

**데이터 플로우:**

1. PDF 파일 → Supabase Storage 저장 (원본 보관)
2. PDF Buffer → Gemini File Search Store 업로드
3. Gemini: 텍스트 추출 → 청킹 → 임베딩 → 인덱싱
4. 쿼리 시: Gemini에서 시맨틱 검색 → 컨텍스트 반환

**컬렉션별 Store 매핑:**

```typescript
// Collection 테이블의 fileSearchStoreId 필드에 저장
const collection = await prisma.collection.findUnique({
  where: { id: collectionId },
});

const storeId = collection.fileSearchStoreId;
// 이 Store ID로 Gemini에 쿼리
```

**공개 컬렉션 복사 시:**

- 동일한 `fileSearchStoreId` 참조 → 벡터 데이터 재사용
- 비용 절감 + 인덱싱 시간 단축
