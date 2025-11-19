# Archived Scripts

This directory contains scripts that were used during development and debugging but are no longer actively needed in day-to-day operations. They are preserved for:

- Future reference and learning
- Debugging specific integration issues
- Understanding API usage patterns
- Quick testing during development

---

## Gemini API Integration Scripts

### `demo-gemini-api.ts`

**Purpose**: Interactive demonstration of Gemini File Search API workflow

**What it does**:

1. Creates a File Search store
2. Retrieves store information
3. Uploads a test PDF with metadata
4. Shows automatic chunking and indexing process
5. Cleans up by deleting the store

**When to use**:

- Learning how Gemini File Search API works
- Understanding the complete workflow
- Testing Gemini API connectivity
- Reference for API call patterns

**Usage**:

```bash
npx tsx scripts/archive/demo-gemini-api.ts
```

**Note**: Requires `tests/fixtures/sample.pdf` - generate with `generate-test-pdf.ts`

---

### `test-gemini-client.ts`

**Purpose**: Verify Gemini client configuration and API access

**What it tests**:

1. API key is configured
2. Gemini client initializes correctly
3. File Search Stores API is available
4. Can access existing stores
5. `uploadToFileSearchStore` method exists
6. Operations API is available

**When to use**:

- After setting up GEMINI_API_KEY
- Debug Gemini API connection issues
- Verify SDK version compatibility

**Usage**:

```bash
npx tsx scripts/archive/test-gemini-client.ts
```

---

### `test-gemini-upload.ts`

**Purpose**: Detailed debugging of PDF upload to Gemini with verbose logging

**What it does**:

- Downloads a test PDF from Supabase Storage
- Creates Blob from PDF buffer
- Calls `uploadToFileSearchStore` API
- Monitors operation status with polling
- Shows detailed API response structure

**When to use**:

- Debug PDF upload failures
- Understand operation polling mechanism
- Test upload with real PDFs from database
- Debug `operation.name is undefined` errors

**Usage**:

```bash
npx tsx scripts/archive/test-gemini-upload.ts
```

**Note**: Requires at least one paper in database with PDF in storage

---

### `test-upload-function.ts`

**Purpose**: Test the `uploadPdfToStore` wrapper function

**What it does**:

- Fetches a test paper from database
- Downloads PDF from Supabase Storage
- Calls `uploadPdfToStore` function (our wrapper)
- Reports success/failure

**When to use**:

- Test changes to `uploadPdfToStore` function
- Debug wrapper function logic
- Verify metadata formatting

**Usage**:

```bash
npx tsx scripts/archive/test-upload-function.ts
```

---

### `test-gemini-store.ts`

**Purpose**: Test accessing a specific Gemini File Search store

**What it does**:

- Attempts to get a hardcoded store by ID
- Lists all stores in the Gemini account
- Diagnoses store access issues

**When to use**:

- Debug "store not found" errors
- Verify API key has access to stores
- Check if stores exist in Gemini

**Usage**:

```bash
npx tsx scripts/archive/test-gemini-store.ts
```

**Note**: Contains hardcoded store ID - update before using

---

## Worker Testing Scripts

### `test-pdf-indexing.ts`

**Purpose**: End-to-end test of PDF indexing worker

**What it does**:

1. Finds a test paper in database
2. Queues a PDF indexing job
3. Waits for worker to process
4. Verifies `vector_status` changes to `completed`

**When to use**:

- Test worker is processing jobs correctly
- Debug indexing pipeline issues
- Verify BullMQ configuration

**Usage**:

```bash
# Start workers first
npm run workers

# In another terminal
npx tsx scripts/archive/test-pdf-indexing.ts
```

**Requirements**:

- Workers must be running
- Redis must be running
- At least one paper with PDF in storage

---

## Utility Scripts

### `generate-test-pdf.ts`

**Purpose**: Generate a sample research paper PDF for testing

**What it generates**:

- Multi-page PDF with title, authors, abstract, sections
- Realistic research paper structure
- Text content suitable for embedding tests
- Saved to `tests/fixtures/sample.pdf`

**When to use**:

- Need a test PDF for development
- Testing PDF processing pipeline
- Demoing Gemini File Search API

**Usage**:

```bash
npx tsx scripts/archive/generate-test-pdf.ts
```

**Output**: `tests/fixtures/sample.pdf` (~20 KB)

---

## Analysis Scripts

### `analyze-storage.ts`

**Purpose**: Analyze Gemini storage usage and costs

**What it analyzes**:

- Gemini reported storage size
- Number of indexed PDFs
- Average size per paper (with embeddings)
- Storage breakdown (PDFs vs embeddings)
- Free tier usage percentage
- Estimated indexing costs

**When to use**:

- Understand storage consumption
- Plan capacity for collections
- Estimate costs for scaling
- Debug unexpectedly high storage usage

**Usage**:

```bash
npx tsx scripts/archive/analyze-storage.ts
```

**Note**: Contains hardcoded collection ID - update before using

**Example output**:

```
Gemini reported size: 347.08 MB
Number of indexed PDFs: 87
Average per paper (with embeddings): 3.99 MB
Estimated original PDF size: 1.33 MB

Breakdown:
  Original PDFs (estimated): 115.69 MB (~33%)
  Vector embeddings: 231.39 MB (~67%)

You can index approximately 256 papers in free tier
```

---

## Data Inspection Scripts

### `check-collections.ts`

**Purpose**: Quick view of collections in database (moved to `ops/`)

**Note**: This script has been moved to `scripts/ops/check-collections.ts` as it's useful for operational monitoring.

---

## Common Issues and Solutions

### "No papers found to test"

- Create a collection through the UI first
- Add papers to the collection
- Ensure PDFs are downloaded to storage

### "PDF not found in storage"

- Check collection has papers
- Verify `storage_key` in database matches actual file
- Run `npm run workers` to process downloads

### "Store not found"

- Verify GEMINI_API_KEY matches the key used to create stores
- Check store ID is correct
- Use `list-gemini-stores.ts` to see all stores

### "Test PDF not found"

- Run `generate-test-pdf.ts` first to create sample PDF
- Check `tests/fixtures/` directory exists

---

## Migration Notes

These scripts were moved from `scripts/` root to `scripts/archive/` on 2025-11-19:

**Reason for archiving**:

- Used during Phase 1-2 development for debugging
- Contain hardcoded IDs or test data
- Functionality now covered by production code
- Still valuable for learning and reference

**Still useful for**:

- New developers learning the codebase
- Debugging rare integration issues
- Testing API changes
- Understanding Gemini File Search workflow

---

## Maintenance

If you find these scripts useful, consider:

1. Updating hardcoded IDs to use CLI arguments
2. Adding them to npm scripts in package.json
3. Moving them back to `ops/` or `test/` if actively used
4. Documenting any changes to API patterns

---

## See Also

- [Main scripts README](../README.md) - Active scripts documentation
- [Gemini File Search API Docs](https://ai.google.dev/gemini-api/docs/file-search)
- [EXTERNAL_APIS.md](../../docs/planning/EXTERNAL_APIS.md) - API integration guide
