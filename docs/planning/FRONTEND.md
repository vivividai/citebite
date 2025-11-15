# CiteBite 프론트엔드 스택

**문서 버전**: v1.0
**작성일**: 2025-11-15
**목적**: CiteBite 프론트엔드 개발을 위한 기술 스택 및 패턴 가이드

---

## 관련 문서

- **[전체 아키텍처](./OVERVIEW.md)** - 시스템 개요 및 데이터 흐름
- **[외부 API 가이드](./EXTERNAL_APIS.md)** - Semantic Scholar, Gemini File Search API
- **[백엔드 스택](./BACKEND.md)** - Node.js, API Routes, 인증
- **[데이터베이스 설계](./DATABASE.md)** - PostgreSQL, Prisma, Supabase Storage
- **[인프라 및 운영](./INFRASTRUCTURE.md)** - 배포, 백그라운드 작업, 보안

---

## 1. 프레임워크 및 라이브러리

### 1.1 Next.js 14+ (App Router)

**선택 이유:**

- **SSR/SSG**: 초기 로딩 속도 향상, SEO 최적화 (공개 컬렉션)
- **API Routes**: 별도 백엔드 서버 불필요, 풀스택 개발
- **File-based Routing**: 직관적인 페이지 구조
- **서버 컴포넌트**: 데이터 패칭 최적화, 클라이언트 번들 크기 감소

**사용 패턴:**

```typescript
// app/collections/[id]/page.tsx (서버 컴포넌트)
export default async function CollectionPage({ params }: { params: { id: string } }) {
  // 서버에서 데이터 패칭
  const collection = await prisma.collection.findUnique({
    where: { id: params.id },
    include: { papers: true, conversations: true }
  });

  return <CollectionDetail collection={collection} />;
}
```

---

### 1.2 React 18+

**주요 기능:**

- **Concurrent Features**: Suspense, useTransition으로 로딩 UX 개선
- **Server Components**: Next.js와 통합
- **Hooks**: useState, useEffect, custom hooks로 상태 관리

**사용 예시:**

```typescript
// components/ChatInterface.tsx
'use client';

import { useState, useTransition } from 'react';

export function ChatInterface({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPending, startTransition] = useTransition();

  async function sendMessage(content: string) {
    startTransition(async () => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      const newMessage = await response.json();
      setMessages(prev => [...prev, newMessage]);
    });
  }

  return (/* UI */);
}
```

---

### 1.3 TypeScript

**필수 이유:**

- **타입 안정성**: 런타임 에러 사전 방지
- **자동완성**: 개발 속도 향상
- **Prisma 통합**: DB 스키마 타입 자동 생성
- **API 계약**: 프론트-백엔드 인터페이스 명확화

**타입 정의 예시:**

```typescript
// types/index.ts
export interface Collection {
  id: string;
  name: string;
  papers: Paper[];
  conversations: Conversation[];
  insightSummary: InsightSummary;
}

export interface InsightSummary {
  topPapers: TopPaper[];
  researchTrends: ResearchTrend[];
  recentTrends: string[];
  researchGaps: string;
}
```

---

## 2. UI 라이브러리

### 2.1 Tailwind CSS

**선택 이유:**

- **유틸리티 우선**: 빠른 프로토타이핑
- **번들 크기**: 사용하지 않는 CSS 자동 제거
- **반응형**: 모바일 대응 간편
- **커스터마이징**: theme 확장 용이

**설정 예시:**

```javascript
// tailwind.config.js
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
      },
    },
  },
};
```

---

### 2.2 shadcn/ui 또는 Radix UI

**선택 이유:**

- **접근성**: ARIA 표준 준수
- **커스터마이징**: Tailwind와 완벽 통합
- **복사-붙여넣기**: 컴포넌트 소스 코드 직접 수정 가능
- **Headless**: 디자인 자유도 높음

**필요 컴포넌트:**

- `Dialog`: 논문 상세 팝업, PDF 업로드 모달
- `DropdownMenu`: 대화 리스트 선택
- `Card`: 컬렉션 카드, 인사이트 카드
- `Button`: 모든 액션 버튼
- `Progress`: PDF 다운로드 진행률
- `Tabs`: 인사이트/논문/대화 탭

**사용 예시:**

```typescript
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';

export function PaperDetailDialog({ paper }: { paper: Paper }) {
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>{paper.title}</DialogHeader>
        <div>
          <p>인용 수: {paper.citationCount}</p>
          {!paper.openAccessPdf && (
            <UploadPdfButton paperId={paper.paperId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 3. 상태 관리

### 3.1 React Query (TanStack Query)

**역할**: 서버 상태 관리 (API 데이터)

**주요 기능:**

- **자동 캐싱**: API 응답 캐싱, 중복 요청 방지
- **백그라운드 업데이트**: stale 데이터 자동 갱신
- **Optimistic Updates**: 낙관적 UI 업데이트
- **Infinite Queries**: 무한 스크롤 (논문 리스트)

**사용 예시:**

```typescript
// hooks/useCollection.ts
import { useQuery } from '@tanstack/react-query';

export function useCollection(id: string) {
  return useQuery({
    queryKey: ['collection', id],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${id}`);
      return res.json();
    },
    staleTime: 60 * 1000, // 1분간 fresh
    refetchOnWindowFocus: true
  });
}

// 컴포넌트에서 사용
function CollectionDetail({ id }: { id: string }) {
  const { data: collection, isLoading } = useCollection(id);

  if (isLoading) return <Skeleton />;
  return <div>{collection.name}</div>;
}
```

**Mutation 예시:**

```typescript
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onSuccess: () => {
      // 대화 기록 자동 갱신
      queryClient.invalidateQueries(['conversation', conversationId]);
    },
  });
}
```

---

### 3.2 Zustand 또는 Jotai (클라이언트 상태)

**역할**: 로컬 UI 상태 (모달 열림, 필터 설정 등)

**Zustand 선택 이유:**

- **간결**: Boilerplate 최소화
- **TypeScript 지원**: 완벽한 타입 추론
- **DevTools**: Redux DevTools 연동

**사용 예시:**

```typescript
// stores/uiStore.ts
import create from 'zustand';

interface UIState {
  isUploadModalOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isUploadModalOpen: false,
  openUploadModal: () => set({ isUploadModalOpen: true }),
  closeUploadModal: () => set({ isUploadModalOpen: false })
}));

// 컴포넌트에서 사용
function UploadButton() {
  const { openUploadModal } = useUIStore();
  return <Button onClick={openUploadModal}>PDF 업로드</Button>;
}
```

---

## 4. 추가 라이브러리

| 라이브러리                 | 역할            | 사용 시나리오                     |
| -------------------------- | --------------- | --------------------------------- |
| `react-markdown`           | 마크다운 렌더링 | AI 답변 표시 (코드 블록, 리스트)  |
| `react-syntax-highlighter` | 코드 하이라이팅 | 마크다운 내 코드 블록             |
| `react-dropzone`           | 파일 업로드 UI  | PDF 드래그앤드롭                  |
| `date-fns`                 | 날짜 포맷팅     | "2일 전", "2024.11.15"            |
| `recharts`                 | 차트 렌더링     | 인사이트 대시보드 (트렌드 그래프) |
| `react-hot-toast`          | 알림 메시지     | "컬렉션 생성 완료", "에러 발생"   |

**사용 예시 (react-markdown):**

```typescript
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

export function AIMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter language={match[1]} {...props}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```
