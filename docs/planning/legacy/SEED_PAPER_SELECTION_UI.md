# Collection Creation Refactoring: Seed Paper Selection UI

## Overview

Refactor collection creation from keyword-based search with AI assistance to a direct 2-column paper selection approach.

## User Requirements

- Remove AI assistance feature
- 2-column layout: Left (search) / Right (selected papers + collection name + research question)
- Search by title, author, or keywords via dropdown
- Keep filters: year range, min citations, Open Access only
- Maximum 10 seed papers
- Selection persists while searching
- **Research question field (required)**: User describes what they want to learn about (used for graph expand similarity ranking)

---

## Implementation Plan

### Phase 1: Update Validation Schema

**File:** `src/lib/validations/collections.ts`

Create new `seedPaperCollectionSchema`:

```typescript
export const seedPaperCollectionSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  researchQuestion: z.string().min(10).max(500).trim(), // Required for graph expand similarity
  seedPaperIds: z.array(z.string()).min(1).max(10),
});
```

Remove: `useAiAssistant`, `keywords` fields
Keep: `researchQuestion` → stored as `natural_language_query` in DB (for auto-expand similarity ranking)

---

### Phase 2: Create Paper Search API

**File:** `src/app/api/papers/search/route.ts` (NEW)

- GET endpoint with query params: `query`, `searchType`, filters, pagination
- Uses existing `SemanticScholarClient.searchPapers()`
- Returns: `{ papers, total, offset, hasMore }`

---

### Phase 3: Create usePaperSearch Hook

**File:** `src/hooks/usePaperSearch.ts` (NEW)

- Debounced search (300ms)
- TanStack Query for data fetching
- Supports "Load more" pagination
- Returns: `{ query, setQuery, results, isLoading, hasMore, loadMore }`

---

### Phase 4: Create SeedPaperSearchPanel Component

**File:** `src/components/collections/SeedPaperSearchPanel.tsx` (NEW)

Left column UI:

- Search type dropdown (Title | Author | Keywords)
- Search input with debouncing
- Collapsible filter section (year, citations, Open Access)
- Scrollable results list with "Load more"
- Plus button to add paper (disabled if selected or max reached)

---

### Phase 5: Create SeedPaperSelectionPanel Component

**File:** `src/components/collections/SeedPaperSelectionPanel.tsx` (NEW)

Right column UI:

- Collection name input (required)
- Research question textarea (required, placeholder: "What do you want to learn about?")
- Selected papers list (N/10) with remove buttons
- Summary: Open Access vs Paywalled count
- "Create Collection" button (disabled until name + question + 1 paper)

---

### Phase 6: Refactor CreateCollectionDialog

**File:** `src/components/collections/CreateCollectionDialog.tsx`

Changes:

- Remove all AI-related state and handlers
- Remove PaperPreviewDialog integration
- Add 2-column grid layout (max-w-5xl)
- Integrate SeedPaperSearchPanel and SeedPaperSelectionPanel
- Simplify form submission to use seedPaperIds directly

Layout structure:

```tsx
<DialogContent className="max-w-5xl max-h-[85vh]">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[600px]">
    <SeedPaperSearchPanel ... />
    <SeedPaperSelectionPanel ... />
  </div>
</DialogContent>
```

---

### Phase 7: Update useCreateCollection Hook

**File:** `src/hooks/useCreateCollection.ts`

Simplify input interface to:

```typescript
interface CreateCollectionInput {
  name: string;
  researchQuestion: string;
  selectedPaperIds: string[];
}
```

---

### Phase 8: Update Collection Creation API

**File:** `src/app/api/collections/route.ts`

- Use new `seedPaperCollectionSchema`
- Remove AI/search logic (selectedPaperIds always provided)
- Store `researchQuestion` → `natural_language_query` column (for auto-expand similarity)
- Set `search_query` to null/empty
- Keep paper fetching and PDF queue logic

---

### Phase 9: Create PaperSearchCard Component

**File:** `src/components/collections/PaperSearchCard.tsx` (NEW)

Compact card for search results:

- Title (2 lines), Authors, Year/Venue
- Citation count, Open Access badge
- Plus/Check icon button

---

### Phase 10: Cleanup

**Files to Remove:**

- `src/app/api/collections/ai/suggest-keywords/route.ts`
- `src/app/api/collections/preview/route.ts`
- `src/hooks/usePreviewCollection.ts`

---

## Implementation Order

1. Phase 1: Validation schema
2. Phase 2: Paper search API
3. Phase 3: usePaperSearch hook
4. Phase 9: PaperSearchCard component
5. Phase 4: SeedPaperSearchPanel
6. Phase 5: SeedPaperSelectionPanel
7. Phase 6: CreateCollectionDialog refactor
8. Phase 7: useCreateCollection hook
9. Phase 8: Collection API update
10. Phase 10: Cleanup

---

## Critical Files

| Action | File Path                                                |
| ------ | -------------------------------------------------------- |
| Modify | `src/lib/validations/collections.ts`                     |
| Create | `src/app/api/papers/search/route.ts`                     |
| Create | `src/hooks/usePaperSearch.ts`                            |
| Create | `src/components/collections/SeedPaperSearchPanel.tsx`    |
| Create | `src/components/collections/SeedPaperSelectionPanel.tsx` |
| Create | `src/components/collections/PaperSearchCard.tsx`         |
| Modify | `src/components/collections/CreateCollectionDialog.tsx`  |
| Modify | `src/hooks/useCreateCollection.ts`                       |
| Modify | `src/app/api/collections/route.ts`                       |
| Delete | `src/app/api/collections/ai/suggest-keywords/route.ts`   |
| Delete | `src/app/api/collections/preview/route.ts`               |
| Delete | `src/hooks/usePreviewCollection.ts`                      |

---

## Technical Notes

- Search type dropdown is UX-focused; all types use same Semantic Scholar API
- 300ms debounce for search input
- Max 10 papers enforced in UI + validation
- 2-column layout stacks vertically on mobile (< md breakpoint)
- "Load more" pagination instead of page numbers
- **Research question is required** for auto-expand similarity ranking (stored in `natural_language_query` column, used by `expandQueryForReranking()` in `src/lib/gemini/query-expand.ts`)
