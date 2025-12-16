# CiteBite UI Redesign Plan

## Overview

Supabase 스타일 아이콘 레일 + 4-column 대시보드 레이아웃 + 베이지/녹색 테마 적용

## Target Layout

```
┌──────┬────────────┬──────────────────────────┬─────────────────┐
│ Rail │ Context    │ Paper List (50%)         │ Chat            │
│(60px)│ Sidebar    │                          │                 │
│      │ (220px)    ├──────────────────────────┤ (400px)         │
│ 📚   │            │ Graph (50%)              │                 │
│ 🛒   │ [+] Create │                          │                 │
│ ⚙️   │ • Coll 1   │                          │                 │
│      │ > Coll 2 ◀│                          │                 │
│ 👤   │            │                          │                 │
└──────┴────────────┴──────────────────────────┴─────────────────┘
```

## Icon Rail Navigation

### Navigation Items (Top Section)

| Icon       | Label                 | Route             | Context Sidebar      |
| ---------- | --------------------- | ----------------- | -------------------- |
| 📚 Library | Collections           | `/dashboard`      | CollectionsSidebar   |
| 🛒 Shop    | Community collections | `/dashboard/shop` | ShopSidebar (future) |

### Utility Items (Bottom Section)

| Icon        | Label            | Route                 | Context Sidebar          |
| ----------- | ---------------- | --------------------- | ------------------------ |
| ⚙️ Settings | App settings     | `/dashboard/settings` | SettingsSidebar (future) |
| 👤 Profile  | User avatar/menu | -                     | Dropdown menu            |

### Rail Behavior

- 고정 너비 60px, full height
- 아이콘 + tooltip on hover
- Active indicator (왼쪽 바 또는 배경색)
- Context sidebar는 선택된 rail item에 따라 변경

---

## Phase 1: Theme & Foundation

### 1.1 Update CSS Theme (`src/app/globals.css`)

베이지/녹색 테마로 CSS 변수 변경:

```css
:root {
  --background: 40 33% 96%; /* #F7F4EF - warm cream */
  --foreground: 30 10% 15%; /* warm dark brown */
  --card: 40 33% 98%; /* off-white */
  --primary: 152 55% 33%; /* forest green */
  --secondary: 40 25% 92%; /* light beige */
  --accent: 150 30% 85%; /* sage green tint */
  --border: 40 15% 85%; /* warm gray */
  --rail: 30 15% 12%; /* dark charcoal for rail */
  --rail-active: 152 55% 33%; /* forest green for active */
}
```

### 1.2 Create Dashboard Layout (`src/components/layout/DashboardLayout.tsx`)

- 4-column CSS Grid: `grid-cols-[60px_220px_1fr_400px]`
- Full viewport height: `h-screen`
- Children slots: rail, sidebar, content, chat

### 1.3 Create Icon Rail (`src/components/layout/IconRail.tsx`)

- Fixed width 60px, full height
- Dark background (--rail color)
- Top section: navigation icons (Library, Shop)
- Bottom section: utility icons (Settings, Profile)
- Active state indicator (left border or background)
- Tooltip on hover (using shadcn Tooltip)

### 1.4 Create Dashboard Route (`src/app/dashboard/page.tsx`)

- Server component for auth check
- Redirect non-authenticated to login
- Render DashboardLayout with IconRail

---

## Phase 2: Context Sidebars

### 2.1 Create Context Sidebar Container (`src/components/layout/ContextSidebar.tsx`)

- Wrapper that renders appropriate sidebar based on active rail item
- Smooth transition between sidebars
- Fixed width 220px

### 2.2 Create CollectionsSidebar (`src/components/layout/CollectionsSidebar.tsx`)

- Header: "Library" title
- Create Collection button (+ icon)
- Scrollable collection list
- Search/filter collections (optional)

### 2.3 Create CollectionSidebarItem (`src/components/layout/CollectionSidebarItem.tsx`)

- Collection name + paper count
- Active indicator (selected state)
- Context menu for Edit/Delete

### 2.4 Create ShopSidebar (Future - `src/components/layout/ShopSidebar.tsx`)

- Header: "Community Shop" title
- Categories/filters for shared collections
- Search shared collections
- Popular/trending section

### 2.5 Create SettingsSidebar (Future - `src/components/layout/SettingsSidebar.tsx`)

- Header: "Settings" title
- Navigation items: Account, Appearance, API Keys, etc.
- Settings categories as list items

### 2.6 Reuse Existing:

- `useCollections` hook
- `CreateCollectionDialog` component
- `useDeleteCollection` hook

---

## Phase 3: State Management

### 3.1 URL-based Navigation

- Routes:
  - `/dashboard` - Library (collections)
  - `/dashboard?collection=<id>` - Selected collection
  - `/dashboard/shop` - Community shop (future)
  - `/dashboard/settings` - Settings (future)
- Use `usePathname` + `useSearchParams` to read
- Update URL on navigation

### 3.2 Create DashboardContext (`src/context/DashboardContext.tsx`)

```typescript
type ActiveSection = 'library' | 'shop' | 'settings';

interface DashboardContextValue {
  activeSection: ActiveSection;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (id: string | null) => void;
  collection: CollectionDetail | null;
  isLoading: boolean;
}
```

### 3.3 Rail Navigation Hook (`src/hooks/useRailNavigation.ts`)

- Derive activeSection from URL pathname
- Provide navigation functions
- Handle active state for rail icons

---

## Phase 4: Content Panel (Middle Column)

### 4.1 Create ContentPanel (`src/components/layout/ContentPanel.tsx`)

- Split layout: PaperList (top) + Graph (bottom)
- Use `react-resizable-panels` for adjustable split
- Empty state when no collection selected

### 4.2 Adapt PaperList

- Minor modifications to `src/components/collections/PaperList.tsx`
- Remove outer padding
- Consume collectionId from context

### 4.3 Adapt PaperGraph

- Minor modifications to `src/components/graph/PaperGraph.tsx`
- Remove fixed height, use flex
- Consume collectionId from context

---

## Phase 5: Chat Panel (Right Column)

### 5.1 Create ChatPanel (`src/components/layout/ChatPanel.tsx`)

- Conversation switcher at top (dropdown/tabs)
- Simplified ChatInterface without conversation sidebar

### 5.2 Modify ChatInterface (`src/components/chat/ChatInterface.tsx`)

- Add prop: `hideConversationList?: boolean`
- When true, remove w-64 sidebar
- Chat fills full width

---

## Phase 6: Landing Page & Navigation

### 6.1 Simplify Landing Page (`src/app/page.tsx`)

- Non-authenticated: Simple login card (centered)
- Authenticated: Redirect to `/dashboard`

### 6.2 Update Navigation (`src/components/layout/navigation.tsx`)

- Option A: Slim top bar (logo + user menu only)
- Option B: Move to sidebar, no top bar
- Hide on dashboard route

### 6.3 Update Login Redirect

- `src/app/(auth)/login/page.tsx`
- Redirect to `/dashboard` after success

---

## Phase 7: Cleanup

### 7.1 Redirect Old Routes

- `/collections` → `/dashboard`
- `/collections/[id]` → `/dashboard?collection=<id>`

### 7.2 Update Layout (`src/app/layout.tsx`)

- Conditional navigation rendering
- Dashboard uses its own layout

---

## Critical Files to Modify

| File                                              | Change                           |
| ------------------------------------------------- | -------------------------------- |
| `src/app/globals.css`                             | Theme colors + rail variables    |
| `src/app/page.tsx`                                | Simple login page                |
| `src/app/layout.tsx`                              | Conditional nav                  |
| `src/app/dashboard/page.tsx`                      | **NEW** - Main dashboard         |
| `src/app/dashboard/shop/page.tsx`                 | **NEW** - Shop page (future)     |
| `src/app/dashboard/settings/page.tsx`             | **NEW** - Settings page (future) |
| `src/components/layout/DashboardLayout.tsx`       | **NEW** - 4-column grid          |
| `src/components/layout/IconRail.tsx`              | **NEW** - Icon navigation rail   |
| `src/components/layout/IconRailItem.tsx`          | **NEW** - Rail icon button       |
| `src/components/layout/ContextSidebar.tsx`        | **NEW** - Sidebar container      |
| `src/components/layout/CollectionsSidebar.tsx`    | **NEW** - Collections list       |
| `src/components/layout/CollectionSidebarItem.tsx` | **NEW** - Collection item        |
| `src/components/layout/ContentPanel.tsx`          | **NEW** - Middle panel           |
| `src/components/layout/ChatPanel.tsx`             | **NEW** - Right panel            |
| `src/context/DashboardContext.tsx`                | **NEW** - Dashboard state        |
| `src/hooks/useRailNavigation.ts`                  | **NEW** - Rail navigation        |
| `src/components/chat/ChatInterface.tsx`           | Add hideConversationList prop    |
| `src/components/layout/navigation.tsx`            | Simplify/remove                  |

---

## Component Reuse

| Existing                 | Reuse Strategy                    |
| ------------------------ | --------------------------------- |
| `PaperList`              | Embed, minor style adjustments    |
| `PaperGraph`             | Embed, height adjustment          |
| `ChatInterface`          | Add prop for embedded mode        |
| `CreateCollectionDialog` | Reuse as-is                       |
| `useCollections`         | Reuse in CollectionsSidebar       |
| `useCollection`          | Reuse in DashboardContext         |
| `ConversationList`       | Transform to dropdown             |
| `UserNav`                | Reuse in IconRail profile section |
| `Tooltip` (shadcn)       | Use for rail icon tooltips        |

---

## Estimated Work Breakdown

1. **Theme & Foundation** - globals.css, DashboardLayout, IconRail, dashboard route
2. **Icon Rail** - IconRail, IconRailItem, navigation state
3. **Context Sidebars** - ContextSidebar, CollectionsSidebar, items
4. **State** - DashboardContext, useRailNavigation, URL sync
5. **Content** - ContentPanel with PaperList + Graph
6. **Chat** - ChatPanel, ChatInterface modification
7. **Navigation** - Simplify, login flow
8. **Cleanup** - Redirects, old code removal

---

## Notes

- Desktop-first (min 1024px)
- Mobile/tablet: Consider overlay or stacked layout
- Empty states needed for: no collection selected, empty collection

---

## Future Expansion

### Shop Feature (Post-MVP)

- Community collection marketplace
- Browse/search shared collections
- "Import" collections to personal library
- Rating/reviews for shared collections
- Creator profiles

### Settings Feature

- Account settings (profile, email, password)
- Appearance (theme preference)
- API key management (for power users)
- Notification preferences
- Data export/import

### Icon Rail Extensibility

Rail은 새 섹션 추가가 쉬운 구조:

```typescript
const railItems: RailItem[] = [
  { icon: Library, label: 'Library', path: '/dashboard', section: 'library' },
  { icon: Store, label: 'Shop', path: '/dashboard/shop', section: 'shop' },
  // 쉽게 추가 가능:
  // { icon: Bookmark, label: 'Bookmarks', path: '/dashboard/bookmarks', section: 'bookmarks' },
  // { icon: History, label: 'History', path: '/dashboard/history', section: 'history' },
];
```
