# Bulk PDF Upload with Auto-Matching Plan

> **Purpose**: Allow users to upload multiple PDFs at once and automatically match them to papers in their collection that lack PDF files.
>
> **Phase**: 3.5 (Extension of Phase 3: Manual PDF Upload)
>
> **Estimated Time**: 3-5 days

---

## Overview

### Problem Statement

When papers fail to download automatically (due to bot policies, paywalls, or broken links), users must currently:

1. Identify which papers need PDFs
2. Download each PDF manually from the publisher
3. Upload each PDF one-by-one to the corresponding paper

This is tedious for collections with many failed papers.

### Proposed Solution

Enable users to:

1. Download all needed PDFs at once (manually, using their institutional access)
2. Drag & drop all PDFs into CiteBite in one action
3. Let the system automatically match each PDF to the correct paper
4. Review matches and trigger indexing

```
[User downloads PDFs manually]
         ↓
[Drag & Drop multiple PDFs to CiteBite]
         ↓
[Server extracts metadata from each PDF]
         ↓
[Match PDFs to papers in collection]
         ↓
[User reviews/confirms matches]
         ↓
[Trigger indexing for matched papers]
```

---

## Technical Approach

### 1. PDF Metadata Extraction

Extract identifying information from PDFs to match against collection papers.

**Extraction Priority:**

| Method                | Accuracy | Implementation            |
| --------------------- | -------- | ------------------------- |
| DOI from PDF text     | ~95%     | Regex pattern matching    |
| DOI from PDF metadata | ~80%     | PDF metadata parsing      |
| Title from first page | ~70%     | Text extraction + cleanup |
| arXiv ID              | ~99%     | Regex pattern matching    |

**DOI Pattern:**

```typescript
// DOI formats: 10.xxxx/xxxxx
const DOI_REGEX = /\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&\'<>])\S)+)\b/gi;

// arXiv formats: arXiv:1234.56789, arxiv.org/abs/1234.56789
const ARXIV_REGEX =
  /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?)|arxiv\.org\/abs\/(\d{4}\.\d{4,5})/gi;
```

**Libraries:**

- `pdf-parse`: Extract text from PDF (lightweight, works in Node.js)
- Alternative: `pdfjs-dist` for more robust extraction

### 2. Matching Algorithm

```typescript
interface MatchResult {
  file: File;
  paper: Paper | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchMethod: 'doi' | 'arxiv' | 'title' | 'manual';
  extractedMetadata: {
    doi?: string;
    arxivId?: string;
    title?: string;
  };
}

async function matchPdfToPaper(
  pdfBuffer: Buffer,
  collectionPapers: Paper[]
): Promise<MatchResult> {
  const metadata = await extractPdfMetadata(pdfBuffer);

  // 1. Try DOI match (highest confidence)
  if (metadata.doi) {
    const match = collectionPapers.find(p =>
      p.doi?.toLowerCase() === metadata.doi?.toLowerCase()
    );
    if (match) {
      return { paper: match, confidence: 'high', matchMethod: 'doi', ... };
    }
  }

  // 2. Try arXiv ID match
  if (metadata.arxivId) {
    const match = collectionPapers.find(p =>
      p.externalId?.includes(metadata.arxivId)
    );
    if (match) {
      return { paper: match, confidence: 'high', matchMethod: 'arxiv', ... };
    }
  }

  // 3. Try title match via Semantic Scholar search
  if (metadata.title) {
    const searchResult = await semanticScholar.searchByTitle(metadata.title);
    if (searchResult) {
      const match = collectionPapers.find(
        p => p.semantic_scholar_id === searchResult.paperId
      );
      if (match) {
        return { paper: match, confidence: 'medium', matchMethod: 'title', ... };
      }
    }
  }

  // 4. No match found - needs manual selection
  return { paper: null, confidence: 'none', matchMethod: 'manual', ... };
}
```

### 3. API Endpoints

#### POST /api/collections/[id]/bulk-upload

Upload multiple PDFs and get matching results.

**Request:**

```typescript
// multipart/form-data
{
  files: File[] // Multiple PDF files
}
```

**Response:**

```typescript
{
  results: Array<{
    filename: string;
    tempStorageKey: string; // Temporary storage for unmatched files
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
  }>; // Papers that need PDFs but weren't matched
}
```

#### POST /api/collections/[id]/bulk-upload/confirm

Confirm matches and trigger indexing.

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
  indexingJobIds: string[];
}
```

### 4. UI Components

#### BulkUploadDialog

```tsx
// components/papers/BulkUploadDialog.tsx

interface BulkUploadDialogProps {
  collectionId: string;
  papersNeedingPdf: Paper[];
  onComplete: () => void;
}

// States:
// 1. Initial - Drop zone for files
// 2. Processing - Extracting metadata, matching
// 3. Review - Show matches, allow corrections
// 4. Indexing - Show progress
```

#### MatchReviewList

```tsx
// components/papers/MatchReviewList.tsx

interface MatchReviewListProps {
  matches: MatchResult[];
  unmatchedPapers: Paper[];
  onMatchChange: (fileKey: string, paperId: string) => void;
  onConfirm: () => void;
}

// UI:
// - List of uploaded files with match status
// - Dropdown to change match for each file
// - Visual indicators: ✅ High, ⚠️ Medium, ❓ None
// - "Confirm & Index" button
```

### 5. Temporary Storage Strategy

Files that haven't been confirmed need temporary storage:

```typescript
// Store in Supabase Storage with 24h expiry
const tempPath = `temp/${userId}/${uuid()}.pdf`;

// Clean up via scheduled job or after confirmation
```

---

## Implementation Checklist

### 3.5.1 PDF Metadata Extraction Library

- [ ] Add `pdf-parse` dependency
- [ ] Create `lib/pdf/metadata-extractor.ts`
- [ ] Implement DOI extraction from PDF text
- [ ] Implement arXiv ID extraction
- [ ] Implement title extraction (first page, largest font)
- [ ] Add unit tests for extraction functions
- [ ] **E2E Test**: Extract metadata from sample PDFs

### 3.5.2 Bulk Upload API - Matching

- [ ] Create POST /api/collections/[id]/bulk-upload route
- [ ] Implement file upload handling (multipart/form-data)
- [ ] Validate file types and sizes (PDF only, max 100MB each, max 50 files)
- [ ] Extract metadata from each PDF
- [ ] Match PDFs to collection papers
- [ ] Store unmatched files in temporary storage
- [ ] Return match results
- [ ] **E2E Test**: Upload 5 PDFs and verify matches returned

### 3.5.3 Bulk Upload API - Confirmation

- [ ] Create POST /api/collections/[id]/bulk-upload/confirm route
- [ ] Validate all matches are valid (paper exists, user owns collection)
- [ ] Move files from temp storage to permanent storage
- [ ] Update Paper records (pdf_source, storage_path)
- [ ] Queue indexing jobs for each paper
- [ ] Clean up temporary files
- [ ] **E2E Test**: Confirm matches and verify indexing jobs queued

### 3.5.4 Bulk Upload UI - Drop Zone

- [ ] Create BulkUploadDialog component
- [ ] Implement multi-file drop zone (react-dropzone)
- [ ] Add file list with progress indicators
- [ ] Show upload progress for each file
- [ ] Handle upload errors gracefully
- [ ] **E2E Test**: Drop 5 files and see upload progress

### 3.5.5 Bulk Upload UI - Match Review

- [ ] Create MatchReviewList component
- [ ] Display match results with confidence indicators
- [ ] Add dropdown to manually select paper for unmatched files
- [ ] Show extracted metadata for debugging
- [ ] Highlight papers that still need PDFs
- [ ] Add "Confirm & Index" button
- [ ] **E2E Test**: Review matches and change one manually

### 3.5.6 Bulk Upload UI - Integration

- [ ] Add "Bulk Upload PDFs" button to collection detail page
- [ ] Show button when collection has papers with failed/missing PDFs
- [ ] Display count of papers needing PDFs
- [ ] Update paper list after successful upload
- [ ] Add success notification with count of papers processed
- [ ] **E2E Test**: Complete full bulk upload flow

### 3.5.7 Temporary Storage Cleanup

- [ ] Create cleanup job for expired temp files
- [ ] Schedule job to run daily
- [ ] Delete temp files older than 24 hours
- [ ] Log cleanup statistics
- [ ] **E2E Test**: Verify temp files are cleaned up

---

## Edge Cases & Error Handling

### Duplicate Detection

```typescript
// Prevent uploading same PDF twice
const existingHashes = await getExistingPdfHashes(collectionId);
const fileHash = await computeHash(pdfBuffer);

if (existingHashes.includes(fileHash)) {
  return { error: 'duplicate', existingPaperId: ... };
}
```

### Partial Failures

- If some files fail to process, continue with others
- Show clear error messages for failed files
- Allow retry for failed uploads

### Large Files

- Chunk uploads for files > 10MB
- Show progress for each chunk
- Handle network interruptions gracefully

### No Matches Found

- Display helpful message with extracted metadata
- Suggest manual paper selection
- Allow skipping files that can't be matched

---

## Database Changes

No schema changes required. Uses existing fields:

- `papers.pdf_source`: Set to 'manual_bulk'
- `papers.storage_path`: Path in Supabase Storage
- `papers.vector_status`: Set to 'pending' then processed by worker

Optional: Add tracking for bulk upload sessions

```sql
-- Optional: Track bulk upload batches
ALTER TABLE papers ADD COLUMN upload_batch_id uuid;
```

---

## Dependencies

**New Dependencies:**

```json
{
  "pdf-parse": "^1.1.1"
}
```

**Existing Dependencies Used:**

- `react-dropzone`: Already available for file uploads
- `@supabase/storage-js`: For temp and permanent storage
- BullMQ: For indexing jobs

---

## Success Metrics

- **Match Accuracy**: >80% of PDFs auto-matched correctly
- **User Time Saved**: 10 papers uploaded in <2 minutes (vs. 10+ minutes one-by-one)
- **Error Rate**: <5% of uploads fail due to technical issues
- **Adoption**: 50%+ of users with failed papers use bulk upload

---

## Future Improvements (Post-MVP)

1. **Browser Extension**: Auto-detect and upload PDFs from publisher pages
2. **Folder Watch**: Monitor a folder and auto-upload new PDFs
3. **Google Drive/Dropbox Integration**: Import PDFs from cloud storage
4. **Zotero/Mendeley Import**: Import PDFs from reference managers

---

## Related Documentation

- [BACKEND.md](./BACKEND.md) - API route patterns
- [FRONTEND.md](./FRONTEND.md) - Component patterns
- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) - Background job patterns
- [DATABASE.md](./DATABASE.md) - Storage configuration

---

**Created**: 2025-11-29
**Status**: Planning
**Author**: Claude (AI Assistant)
