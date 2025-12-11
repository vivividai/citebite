# CiteBite 기술 스택 개요

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite MVP 구현을 위한 전체 시스템 아키텍처 및 기술 스택 개요

---

## 관련 문서

- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar API 상세
- **[프론트엔드 스택](./FRONTEND.md)** - Next.js, React, UI 라이브러리, 상태 관리
- **[백엔드 스택](./BACKEND.md)** - Node.js, API Routes, 인증, 데이터베이스
- **[데이터베이스 설계](./DATABASE.md)** - PostgreSQL, Supabase CLI, SQL migrations, Supabase Storage
- **[인프라 및 운영](./INFRASTRUCTURE.md)** - 배포, 백그라운드 작업, 보안, 성능, 비용

---

## 1. 개요

### 1.1 시스템 요구사항

CiteBite는 다음과 같은 핵심 기능을 제공해야 합니다:

- **논문 자동 수집**: Semantic Scholar API를 통한 Open Access 논문 검색 및 다운로드
- **수동 PDF 업로드**: Non-Open Access 논문을 사용자가 직접 업로드
- **RAG 기반 대화**: pgvector + Gemini를 활용한 논문 기반 질의응답
- **대화 기록 관리**: 영구적인 대화 기록 저장 및 이어하기
- **컬렉션 업데이트**: 신규 논문 자동 발견 및 추가
- **인사이트 생성**: AI 기반 연구 동향 분석
- **공개 컬렉션**: 컬렉션 공유 및 복사 기능

### 1.2 기술 선택 기준

- **확장성**: 사용자 증가에 대응 가능한 구조
- **비용 효율성**: MVP 단계에서 최소 비용으로 시작
- **개발 속도**: 10-12주 내 MVP 완성 가능한 기술
- **유지보수성**: 타입 안정성 및 명확한 코드 구조
- **성능**: 5초 이내 AI 응답 시간 보장

---

## 2. 전체 시스템 아키텍처

### 2.1 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 컬렉션   │  │ 논문     │  │ AI 대화  │  │ 인사이트 │   │
│  │ 관리 UI  │  │ 리스트   │  │ UI       │  │ 대시보드 │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Next.js API Routes)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 컬렉션   │  │ 논문     │  │ 대화     │  │ 인사이트 │   │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                │                │
         │                │                │
         ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                        Supabase                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PostgreSQL   │  │ Auth         │  │ Storage      │      │
│  │ (Client SDK) │  │              │  │              │      │
│  │              │  │ - Google     │  │ - PDF 저장   │      │
│  │ - Users      │  │ - Email/PW   │  │ - CDN 통합   │      │
│  │ - Collections│  │ - Session    │  │ - RLS 보안   │      │
│  │ - Papers     │  │ - JWT        │  │              │      │
│  │ - Convos     │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
         │                │
         ▼                ▼
┌──────────────┐  ┌──────────────┐
│ Semantic     │  │ Gemini API   │
│ Scholar API  │  │              │
│              │  │ - Chat (LLM) │
│ - 논문 검색  │  │ - Embedding  │
│ - 메타데이터 │  │              │
│ - PDF URL    │  │              │
└──────────────┘  └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│              pgvector (PostgreSQL Extension)                │
│  - 768차원 벡터 저장 (paper_chunks 테이블)                  │
│  - HNSW 인덱스로 고속 유사도 검색                          │
│  - 하이브리드 검색 (벡터 70% + 키워드 30%)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Background Jobs (BullMQ + Redis)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PDF 다운로드 │  │ PDF 인덱싱   │  │ 인사이트     │     │
│  │ Queue        │  │ Queue        │  │ 생성 Queue   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

**컬렉션 생성 플로우:**

```
1. 사용자: 키워드 + 필터 입력
2. Frontend → Backend: POST /api/collections
3. Backend → Semantic Scholar: 논문 검색
4. Backend → Supabase PostgreSQL: 컬렉션 + 논문 메타데이터 저장
5. Backend → BullMQ: PDF 다운로드 작업 큐잉
6. BullMQ Worker:
   - PDF 다운로드 → Supabase Storage 저장
   - PDF 텍스트 추출 → 청킹
   - Gemini embedding 생성 → pgvector 저장
7. Backend → Gemini: 인사이트 생성 요청
8. Backend → Supabase PostgreSQL: 인사이트 저장
9. Frontend ← WebSocket/Polling: 진행 상태 업데이트
```

**AI 대화 플로우:**

```
1. 사용자: 질문 입력
2. Frontend → Backend: POST /api/conversations/{id}/messages
3. Backend → Supabase PostgreSQL: 대화 기록 조회
4. Backend → Custom RAG:
   - 질문 임베딩 생성 (Gemini embedding-001)
   - pgvector 하이브리드 검색 (벡터 + 키워드)
   - 관련 청크로 컨텍스트 구성
5. Backend → Gemini Chat: 컨텍스트 + 질문으로 답변 생성
6. Backend: 인용 파싱 및 메타데이터 구성
7. Backend → Supabase PostgreSQL: 답변 저장
8. Frontend ← Backend: 답변 + 인용 정보
```

---

## 3. 기능별 기술 스택 매핑

### 3.1 컬렉션 생성

#### 자동 논문 수집

| 기능 요소       | 기술 스택                          | 상세 역할                                  |
| --------------- | ---------------------------------- | ------------------------------------------ |
| 키워드 검색     | Semantic Scholar API               | Bulk Search 엔드포인트로 논문 검색         |
| 필터링          | Semantic Scholar API               | 연도, 인용 수, Open Access 필터 적용       |
| 메타데이터 저장 | Supabase PostgreSQL + Supabase SDK | 논문 정보, 컬렉션-논문 관계 저장           |
| PDF 다운로드    | BullMQ + Axios                     | 백그라운드에서 비동기 다운로드             |
| PDF 저장        | Supabase Storage                   | 원본 PDF 영구 저장 (재처리 가능), CDN 통합 |
| 벡터화          | Gemini embedding + pgvector        | PDF 청킹 → 임베딩 생성 → 벡터 저장         |
| 진행 상태 UI    | WebSocket / Polling                | 실시간 진행률 표시                         |

**구현 상세:**

```typescript
// Backend API Route: POST /api/collections
async function createCollection(req: Request) {
  // 1. 입력 검증
  const { name, keywords, filters } = req.body;

  // 2. Semantic Scholar 검색
  const papers = await semanticScholarService.search({
    query: keywords,
    yearFrom: filters.yearFrom,
    yearTo: filters.yearTo,
    minCitations: filters.minCitations,
    openAccessOnly: filters.openAccessOnly,
  });

  // 3. DB 저장 (컬렉션 생성)
  const supabase = createServerSupabaseClient();
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .insert({
      user_id: req.user.id,
      name,
      search_query: keywords,
      filters,
    })
    .select()
    .single();

  if (collectionError) throw collectionError;

  // 논문 메타데이터 저장
  const { error: papersError } = await supabase.from('papers').upsert(
    papers.map(p => ({
      paper_id: p.paperId,
      title: p.title,
      authors: p.authors,
      year: p.year,
      abstract: p.abstract,
      citation_count: p.citationCount,
      open_access_pdf_url: p.openAccessPdf?.url,
      vector_status: 'pending',
    }))
  );

  if (papersError) throw papersError;

  // 컬렉션-논문 관계 생성
  await supabase.from('collection_papers').insert(
    papers.map(p => ({
      collection_id: collection.id,
      paper_id: p.paperId,
    }))
  );

  // 4. PDF 다운로드 작업 큐잉 (벡터화는 Worker에서 처리)
  const openAccessPapers = papers.filter(p => p.openAccessPdf?.url);
  await pdfDownloadQueue.addBulk(
    openAccessPapers.map(p => ({
      name: 'download-pdf',
      data: {
        collectionId: collection.id,
        paperId: p.paperId,
        pdfUrl: p.openAccessPdf.url,
      },
    }))
  );

  return { collection, queuedPapers: openAccessPapers.length };
}
```

#### 수동 PDF 업로드

| 기능 요소      | 기술 스택                   | 상세 역할                              |
| -------------- | --------------------------- | -------------------------------------- |
| 파일 업로드 UI | React Dropzone              | 드래그앤드롭 인터페이스                |
| 파일 검증      | Backend (Node.js)           | MIME type, 파일 크기 검증 (최대 100MB) |
| 영구 저장      | Supabase Storage            | PDF 원본 저장 및 CDN 캐싱              |
| 벡터화         | Gemini embedding + pgvector | PDF 청킹 → 임베딩 → 벡터 저장          |
| 상태 업데이트  | Supabase PostgreSQL         | vectorStatus: 'pending' → 'completed'  |
| 진행 표시      | React State + Polling       | 업로드 → 인덱싱 완료까지 진행률        |

**구현 상세:**

```typescript
// Backend API Route: POST /api/papers/{paperId}/upload
async function uploadPdf(req: Request) {
  const { paperId } = req.params;
  const file = req.file; // multer middleware

  // 1. 검증
  if (file.mimetype !== 'application/pdf') {
    throw new Error('PDF only');
  }
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('Max 100MB');
  }

  const supabase = createServerSupabaseClient();

  // 2. Paper 조회 및 컬렉션 정보
  const { data: paper } = await supabase
    .from('papers')
    .select(
      `
      *,
      collection_papers!inner(
        collection:collections(*)
      )
    `
    )
    .eq('paper_id', paperId)
    .single();

  // 3. Supabase Storage 저장
  const { data, error } = await supabase.storage
    .from('pdfs')
    .upload(`${paperId}.pdf`, file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) throw error;

  // 4. PDF 인덱싱 작업 큐잉 (텍스트 추출 → 청킹 → 임베딩 → pgvector)
  await pdfIndexQueue.add('index-pdf', {
    paperId,
    collectionId: paper.collection_papers[0].collection_id,
    storagePath: data.path,
  });

  // 5. 상태 업데이트
  await supabase
    .from('papers')
    .update({
      pdf_source: 'manual',
      vector_status: 'completed',
      uploaded_by: req.user.id,
    })
    .eq('paper_id', paperId);

  return { success: true };
}
```

---

### 3.2 컬렉션 업데이트

| 기능 요소        | 기술 스택            | 상세 역할                      |
| ---------------- | -------------------- | ------------------------------ |
| 기존 조건 재검색 | Semantic Scholar API | 마지막 업데이트 이후 논문 검색 |
| 중복 제거        | PostgreSQL Query     | 이미 존재하는 논문 필터링      |
| 신규 논문 UI     | React                | 미리보기 리스트, 선택 체크박스 |
| 백그라운드 추가  | BullMQ               | PDF 다운로드 및 벡터화 작업    |
| 인사이트 재생성  | Gemini API           | 업데이트된 컬렉션 재분석       |

**구현 상세:**

```typescript
// Backend API Route: POST /api/collections/{id}/update
async function updateCollection(req: Request) {
  const { id } = req.params;

  // 1. 컬렉션 조회
  const { data: collection } = await supabase
    .from('collections')
    .select('*, papers(*)')
    .eq('id', id)
    .single();

  // 2. 마지막 업데이트 이후 논문 검색
  const newPapers = await semanticScholarService.search({
    query: collection.searchQuery,
    ...collection.filters,
    publicationDateFrom: collection.lastUpdatedAt,
  });

  // 3. 중복 제거
  const existingIds = new Set(collection.papers.map(p => p.paperId));
  const uniqueNewPapers = newPapers.filter(p => !existingIds.has(p.paperId));

  // 4. 사용자 선택 대기 (프론트엔드에 반환)
  return { newPapers: uniqueNewPapers };
}

// Backend API Route: POST /api/collections/{id}/add-papers
async function addPapersToCollection(req: Request) {
  const { id } = req.params;
  const { paperIds } = req.body; // 사용자가 선택한 논문들

  // 1. DB 추가
  const papersToInsert = paperIds.map(paperId => ({
    collection_id: id,
    paper_id: paperId,
    // ... 메타데이터
    vector_status: 'pending',
  }));

  await supabase.from('papers').insert(papersToInsert);

  await supabase
    .from('collections')
    .update({ last_updated_at: new Date().toISOString() })
    .eq('id', id);

  // 2. PDF 다운로드 큐잉
  await pdfDownloadQueue.addBulk(/* ... */);

  // 3. 인사이트 재생성 큐잉
  await insightQueue.add('generate-insights', { collectionId: id });

  return { success: true, addedCount: paperIds.length };
}
```

---

### 3.3 AI 대화

| 기능 요소      | 기술 스택              | 상세 역할                           |
| -------------- | ---------------------- | ----------------------------------- |
| 대화 UI        | React + Markdown       | 메시지 렌더링, 코드 블록, 인용 표시 |
| 대화 기록 조회 | PostgreSQL             | 기존 메시지 로드                    |
| RAG 쿼리       | pgvector + Gemini Chat | 하이브리드 검색 + LLM 답변 생성     |
| 인용 추출      | Custom RAG Grounding   | 답변에 사용된 논문 청크 식별        |
| 메시지 저장    | PostgreSQL             | 질문-답변 쌍 저장                   |
| 제안 질문 생성 | Gemini API             | 다음 질문 3-5개 자동 생성           |

**구현 상세:**

```typescript
// Backend API Route: POST /api/conversations/{id}/messages
async function sendMessage(req: Request) {
  const { id } = req.params;
  const { content } = req.body; // 사용자 질문

  // 1. 대화 조회
  const { data: conversation } = await supabase
    .from('conversations')
    .select(
      `
      *,
      messages:messages!inner(*)
        .order(timestamp.desc)
        .limit(10),
      collection:collections(*)
    `
    )
    .eq('id', id)
    .single();

  // 2. 대화 기록 구성
  const history = conversation.messages.reverse().map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  // 3. Custom RAG 쿼리 (pgvector 하이브리드 검색 + Gemini Chat)
  const response = await queryRAG({
    collectionId: conversation.collection_id,
    question: content,
    conversationHistory: history,
  });

  // 4. 인용 논문 추출 (RAG 응답에서 grounding chunks 추출)
  const citedPaperIds = response.groundingChunks
    .map(chunk => chunk.retrievedContext?.paper_id)
    .filter(Boolean);
  const { data: citedPapers } = await supabase
    .from('papers')
    .select('paper_id, title, authors, year')
    .in('paper_id', citedPaperIds);

  // 5. 메시지 저장
  const messagesToInsert = [
    {
      conversation_id: id,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    },
    {
      conversation_id: id,
      role: 'assistant',
      content: response.answer,
      timestamp: new Date().toISOString(),
      cited_paper_ids: citedPaperIds,
    },
  ];

  await supabase.from('messages').insert(messagesToInsert);

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', id);

  // 6. 제안 질문 생성
  const suggestedQuestions = await generateSuggestedQuestions(
    response.answer,
    conversation.collection.name
  );

  return {
    answer: response.answer,
    citedPapers,
    suggestedQuestions,
  };
}
```

#### 대화 기록 관리

| 기능 요소      | 기술 스택            | 상세 역할                         |
| -------------- | -------------------- | --------------------------------- |
| 대화 리스트 UI | React                | 드롭다운, 미리보기                |
| 제목 자동 생성 | LLM (Gemini)         | 첫 질문 요약 (60자 이내)          |
| 제목 수정      | PostgreSQL           | 사용자 직접 수정 가능             |
| 대화 삭제      | Soft Delete          | deletedAt 필드로 표시 (복구 가능) |
| 대화 검색      | PostgreSQL Full-Text | message content 검색              |

---

### 3.4 인사이트 생성

| 기능 요소      | 기술 스택         | 상세 역할                    |
| -------------- | ----------------- | ---------------------------- |
| 주요 연구 흐름 | Gemini API (LLM)  | 논문 초록 분석 → 클러스터링  |
| Top 논문 추출  | PostgreSQL Query  | citationCount 기준 정렬      |
| 최근 트렌드    | Gemini API        | 최근 1년 논문 키워드 분석    |
| 연구 갭 분석   | Gemini API        | "덜 연구된 영역" 식별        |
| 인사이트 저장  | PostgreSQL (JSON) | Collection.insightSummary    |
| 인사이트 UI    | React             | 카드 형태, 클릭 시 논문 이동 |

**구현 상세:**

```typescript
// Background Job: generate-insights
async function generateInsights(collectionId: string) {
  // 1. 컬렉션 논문 조회
  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .eq('collection_id', collectionId)
    .order('citation_count', { ascending: false });

  // 2. Top 논문 (간단)
  const topPapers = papers.slice(0, 5).map(p => ({
    title: p.title,
    authors: p.authors,
    year: p.year,
    citationCount: p.citationCount,
    summary: p.abstract.slice(0, 200) + '...',
  }));

  // 3. LLM 기반 분석
  const abstracts = papers.map(p => `${p.title}\n${p.abstract}`).join('\n\n');

  const prompt = `
다음은 특정 연구 주제의 논문 초록 모음입니다:

${abstracts}

다음을 분석하여 JSON으로 반환하세요:
1. 주요 연구 흐름 3-5개 (각 흐름의 이름, 설명, 대표 논문 제목)
2. 최근 1년간 트렌드 변화 (키워드, 새로운 방향성)
3. 상대적으로 덜 연구된 영역 (연구 갭)

JSON 형식:
{
  "researchTrends": [
    { "name": "...", "description": "...", "papers": ["...", "..."] }
  ],
  "recentTrends": ["...", "...", "..."],
  "researchGaps": "..."
}
  `;

  const response = await geminiService.generateContent(prompt);
  const analysis = JSON.parse(response.text);

  // 4. 인사이트 저장
  await supabase
    .from('collections')
    .update({
      insight_summary: {
        topPapers,
        ...analysis,
        generatedAt: new Date().toISOString(),
      },
    },
  });
}
```

---

### 3.5 공개 컬렉션

| 기능 요소   | 기술 스택               | 상세 역할                         |
| ----------- | ----------------------- | --------------------------------- |
| 공개 설정   | PostgreSQL              | Collection.isPublic 필드          |
| 컬렉션 목록 | PostgreSQL + Pagination | 공개 컬렉션 조회                  |
| 검색/필터   | PostgreSQL Full-Text    | 이름, 설명 검색                   |
| 통계 표시   | PostgreSQL Aggregation  | 복사 횟수, 논문 수                |
| 복사 기능   | PostgreSQL Transaction  | 메타데이터 복사, 벡터 데이터 공유 |

**구현 상세:**

```typescript
// Backend API Route: POST /api/collections/{id}/copy
async function copyCollection(req: Request) {
  const { id } = req.params; // 원본 컬렉션 ID

  // 1. 원본 조회
  const { data: original } = await supabase
    .from('collections')
    .select('*, papers(*)')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (!original) throw new Error('Not found or not public');

  // 2. 새 컬렉션 생성
  const { data: newCollection } = await supabase
    .from('collections')
    .insert({
      user_id: req.user.id,
      name: `${original.name} (복사본)`,
      search_query: original.search_query,
      filters: original.filters,
      is_public: false,
      insight_summary: original.insight_summary,
    })
    .select()
    .single();

  // 3. 논문 연결 (junction table)
  const paperLinks = original.papers.map(p => ({
    collection_id: newCollection.id,
    paper_id: p.paper_id,
  }));
  await supabase.from('collection_papers').insert(paperLinks);

  // 4. 복사 횟수 증가
  await supabase
    .from('collections')
    .update({ copy_count: (original.copy_count || 0) + 1 })
    .eq('id', original.id);

  return { collection: newCollection };
}
```

**참고**: paper_chunks 테이블의 벡터 데이터는 paper_id로 참조되므로, 여러 컬렉션이 동일한 논문을 공유할 때 벡터 데이터 중복 방지.

---

## 4. 결론

### 4.1 핵심 기술 스택 요약

| 계층                | 기술                                                        | 역할                         |
| ------------------- | ----------------------------------------------------------- | ---------------------------- |
| **Frontend**        | Next.js 14, React 18, TypeScript, Tailwind, shadcn/ui       | UI, SSR, 타입 안정성         |
| **Backend**         | Next.js API Routes, Supabase Auth, Zod                      | API, 인증, 검증              |
| **Database**        | Supabase PostgreSQL, Supabase Client, SQL migrations        | 관계형 데이터 저장, RLS 보안 |
| **Vector DB**       | pgvector (Supabase PostgreSQL Extension)                    | PDF 벡터화, RAG              |
| **File Storage**    | Supabase Storage                                            | PDF 원본 저장, CDN 통합      |
| **Background Jobs** | BullMQ, Redis                                               | 비동기 작업 처리             |
| **External APIs**   | Semantic Scholar, Gemini                                    | 논문 검색, LLM               |
| **Deployment**      | Vercel (App), Supabase (DB/Auth/Storage), Railway (Workers) | 호스팅                       |

### 4.2 성공을 위한 핵심 포인트

1. **Supabase 통합 플랫폼**: DB, Auth, Storage, Vector DB를 단일 플랫폼에서 관리하여 인프라 복잡도 감소
2. **pgvector + Gemini Embedding**: 커스텀 RAG로 완전한 제어권 확보, 하이브리드 검색으로 정확도 향상
3. **BullMQ로 비동기 처리**: PDF 다운로드/인덱싱으로 사용자 대기 시간 제거
4. **Row Level Security**: 데이터베이스 수준 보안으로 안전한 멀티테넌트 구조
5. **Supabase Client SDK**: TypeScript 타입 자동 생성으로 타입 안정성 확보
6. **React Query**: API 호출 최적화로 UX 향상
7. **점진적 출시**: Phase별 완료 기준 설정으로 MVP 10주 내 출시

### 4.3 Supabase 도입 이점

- **개발 속도**: Auth, Storage API를 직접 구축할 필요 없음
- **비용 효율**: 무료 티어로 초기 100 사용자 커버 가능 (~$7/월)
- **관리 편의성**: 단일 Dashboard에서 DB, Auth, Storage 모니터링
- **확장성**: Pro 플랜으로 간단 업그레이드, 10,000 사용자까지 대응 가능

### 4.4 다음 단계

1. GitHub 리포지토리 생성
2. Next.js + TypeScript 프로젝트 초기화
3. **Supabase 프로젝트 생성** (DB, Auth, Storage 통합)
4. Supabase CLI 설치 및 프로젝트 연결
5. Semantic Scholar API Key 발급
6. Gemini API Key 발급
7. Phase 1 개발 시작
