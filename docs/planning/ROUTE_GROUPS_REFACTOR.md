# Route Groups 리팩토링 계획

## 개요

middleware.ts를 제거하고 Next.js App Router의 Route Groups 패턴을 사용하여 레이아웃을 분리합니다.

## 문제점

### 현재 구현의 문제

```typescript
// src/middleware.ts - 불필요한 오버헤드
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
```

```typescript
// src/app/layout.tsx - middleware에 의존
const headersList = await headers();
const pathname = headersList.get('x-pathname') || '';
const isDashboard = pathname.startsWith('/dashboard');
{!isDashboard && <Navigation user={user} />}
```

**문제점:**

1. 모든 요청마다 middleware 실행 (성능 오버헤드)
2. 단순히 Navigation 숨기기 위해 middleware 사용 (과잉 설계)
3. header 기반 pathname 전달 (우회적 방법)
4. Next.js 권장 패턴 미사용

## 해결 방안: Route Groups

Next.js App Router의 Route Groups `(folderName)`를 사용하면:

- URL 경로에 영향 없이 레이아웃 분리 가능
- middleware 없이 조건부 레이아웃 구현
- 각 그룹별 독립적인 layout.tsx 사용

---

## 현재 vs 변경 후 구조

### 현재 구조

```
src/app/
├── layout.tsx              # Navigation 조건부 렌더링 (middleware 의존)
├── page.tsx                # 홈페이지
├── (auth)/
│   └── login/page.tsx      # 로그인
├── dashboard/
│   ├── layout.tsx          # 인증 체크만
│   ├── page.tsx
│   └── DashboardClient.tsx
├── collections/            # 리다이렉트용
│   ├── page.tsx
│   └── [id]/page.tsx
└── test/
    └── semantic-scholar/page.tsx
```

### 변경 후 구조

```
src/app/
├── layout.tsx              # 공통 요소만 (html, body, fonts, Providers)
├── (with-nav)/             # Navigation 포함 레이아웃
│   ├── layout.tsx          # Navigation 렌더링
│   ├── page.tsx            # 홈페이지 (이동)
│   └── (auth)/
│       └── login/page.tsx  # 로그인 (이동)
├── (no-nav)/               # Navigation 없는 레이아웃
│   ├── layout.tsx          # 빈 레이아웃
│   └── dashboard/          # 대시보드 (이동)
│       ├── layout.tsx
│       ├── page.tsx
│       └── DashboardClient.tsx
├── collections/            # 리다이렉트 유지 (route group 밖)
│   ├── page.tsx
│   └── [id]/page.tsx
└── test/                   # 테스트 유지 (route group 밖)
    └── semantic-scholar/page.tsx
```

---

## 상세 구현 계획

### Step 1: Route Group 폴더 생성

```bash
mkdir -p src/app/(with-nav)
mkdir -p src/app/(no-nav)
```

### Step 2: (with-nav) 레이아웃 생성

**새 파일:** `src/app/(with-nav)/layout.tsx`

```tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Navigation } from '@/components/layout/navigation';

interface WithNavLayoutProps {
  children: React.ReactNode;
}

export default async function WithNavLayout({ children }: WithNavLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Navigation user={user} />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
```

### Step 3: (no-nav) 레이아웃 생성

**새 파일:** `src/app/(no-nav)/layout.tsx`

```tsx
interface NoNavLayoutProps {
  children: React.ReactNode;
}

export default function NoNavLayout({ children }: NoNavLayoutProps) {
  return <>{children}</>;
}
```

### Step 4: 파일 이동

| 기존 경로            | 새 경로                       |
| -------------------- | ----------------------------- |
| `src/app/page.tsx`   | `src/app/(with-nav)/page.tsx` |
| `src/app/(auth)/`    | `src/app/(with-nav)/(auth)/`  |
| `src/app/dashboard/` | `src/app/(no-nav)/dashboard/` |

### Step 5: Root Layout 정리

**수정 파일:** `src/app/layout.tsx`

```tsx
// 변경 전
import { headers } from 'next/headers';
import { Navigation } from '@/components/layout/navigation';

export default async function RootLayout({ children }) {
  // ... user 가져오기
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <html lang="en">
      <body>
        <Providers>
          {!isDashboard && <Navigation user={user} />}
          <main className={isDashboard ? '' : 'min-h-screen'}>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

```tsx
// 변경 후
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/providers/Providers';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'CiteBite - AI-Powered Research Assistant',
  description:
    'Chat with research papers using RAG and AI. Automatically collect papers and get citation-backed answers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Step 6: middleware.ts 삭제

```bash
rm src/middleware.ts
```

---

## 파일 변경 요약

| 작업     | 파일 경로                                            |
| -------- | ---------------------------------------------------- |
| **삭제** | `src/middleware.ts`                                  |
| **수정** | `src/app/layout.tsx`                                 |
| **신규** | `src/app/(with-nav)/layout.tsx`                      |
| **신규** | `src/app/(no-nav)/layout.tsx`                        |
| **이동** | `src/app/page.tsx` → `src/app/(with-nav)/page.tsx`   |
| **이동** | `src/app/(auth)/` → `src/app/(with-nav)/(auth)/`     |
| **이동** | `src/app/dashboard/` → `src/app/(no-nav)/dashboard/` |

> **Note:** `src/context/DashboardContext.tsx`는 현재 위치 유지 (나중에 다른 context 추가 가능)

---

## 장점

1. **성능 개선**: middleware 오버헤드 제거
2. **명확한 구조**: 레이아웃 의도가 폴더 구조에 반영
3. **Next.js 권장 패턴**: App Router 공식 문서 권장 방식
4. **확장성**: 새로운 레이아웃 그룹 쉽게 추가 가능
5. **유지보수성**: 조건부 로직 없이 선언적 구조

---

## 검증 체크리스트

- [ ] `/` - 홈페이지에 Navigation 표시
- [ ] `/login` - 로그인 페이지에 Navigation 표시
- [ ] `/dashboard` - 대시보드에 Navigation 미표시
- [ ] `/dashboard?collection=xxx` - 컬렉션 선택 시 정상 동작
- [ ] `/collections` → `/dashboard` 리다이렉트 유지
- [ ] `/collections/[id]` → `/dashboard?collection=[id]` 리다이렉트 유지
- [ ] 빌드 성공 (`npm run build`)
