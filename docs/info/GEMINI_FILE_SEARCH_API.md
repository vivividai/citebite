# Gemini File Search API Reference

**Last Updated**: 2025-01-20
**API Version**: v1beta
**Official Documentation**:

- [File Search Stores API](https://ai.google.dev/api/file-search/file-search-stores)
- [Documents API](https://ai.google.dev/api/file-search/documents)

---

## Table of Contents

1. [Overview](#overview)
2. [API Architecture](#api-architecture)
3. [File Search Stores API](#file-search-stores-api)
4. [Documents API](#documents-api)
5. [TypeScript Implementation Guide](#typescript-implementation-guide)
6. [Best Practices](#best-practices)
7. [Error Handling](#error-handling)
8. [Limitations](#limitations)

---

## Overview

### What is Gemini File Search API?

Gemini File Search API is a managed vector database service that allows you to:

- Store and index documents (PDFs, text files, etc.)
- Perform semantic search across document content
- Retrieve relevant chunks with grounding metadata for RAG applications
- Filter results using custom metadata

### Key Concepts

- **File Search Store**: A container for documents (like a vector database)
- **Document**: An individual file uploaded to a store
- **Chunk**: Automatically generated text segments from documents with embeddings
- **Custom Metadata**: User-defined key-value pairs for filtering and organization

### Use in CiteBite

CiteBite uses File Search API for:

1. Indexing research papers (PDFs) in collections
2. Semantic search during AI chat conversations
3. Grounding LLM responses with citations from papers

---

## API Architecture

### Resource Hierarchy

```
FileSearchStore (Vector DB Container)
├── name: "fileSearchStores/{store_id}"
├── Document 1
│   ├── name: "fileSearchStores/{store_id}/documents/{doc_id}"
│   ├── Chunk 1 (auto-generated)
│   ├── Chunk 2
│   └── Chunk 3
├── Document 2
│   ├── Chunk 1
│   └── Chunk 2
└── Document 3
    └── Chunk 1
```

### Base URL

```
https://generativelanguage.googleapis.com/v1beta
```

### Authentication

All requests require an API key:

```bash
# Header authentication
x-goog-api-key: YOUR_GEMINI_API_KEY

# Query parameter authentication
?key=YOUR_GEMINI_API_KEY
```

---

## File Search Stores API

### 1. Create Store

**Purpose**: Creates a new empty File Search Store.

**Endpoint**:

```http
POST /v1beta/fileSearchStores
```

**Request Body**:

```json
{
  "displayName": "My Research Papers" // Optional, max 512 chars
}
```

**Response**:

```json
{
  "name": "fileSearchStores/abc123",
  "displayName": "My Research Papers",
  "createTime": "2025-01-20T10:00:00Z",
  "updateTime": "2025-01-20T10:00:00Z",
  "activeDocumentsCount": 0,
  "pendingDocumentsCount": 0,
  "failedDocumentsCount": 0,
  "sizeBytes": "0"
}
```

**TypeScript Example**:

```typescript
async function createFileSearchStore(displayName: string): Promise<string> {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/fileSearchStores',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({ displayName }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create store: ${response.statusText}`);
  }

  const data = await response.json();
  return data.name; // "fileSearchStores/abc123"
}
```

---

### 2. Get Store

**Purpose**: Retrieves metadata about a specific File Search Store.

**Endpoint**:

```http
GET /v1beta/{name}
```

**Path Parameters**:

- `name`: Store resource name (e.g., `fileSearchStores/abc123`)

**Response**:

```json
{
  "name": "fileSearchStores/abc123",
  "displayName": "My Research Papers",
  "createTime": "2025-01-20T10:00:00Z",
  "updateTime": "2025-01-20T10:15:00Z",
  "activeDocumentsCount": 5,
  "pendingDocumentsCount": 2,
  "failedDocumentsCount": 1,
  "sizeBytes": "15728640"
}
```

**TypeScript Example**:

```typescript
async function getFileSearchStore(storeName: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${storeName}`,
    {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get store: ${response.statusText}`);
  }

  return await response.json();
}
```

---

### 3. List Stores

**Purpose**: Lists all File Search Stores owned by the user.

**Endpoint**:

```http
GET /v1beta/fileSearchStores
```

**Query Parameters**:

- `pageSize` (optional): Max 20, default 10
- `pageToken` (optional): For pagination

**Response**:

```json
{
  "fileSearchStores": [
    {
      "name": "fileSearchStores/abc123",
      "displayName": "Research Papers",
      "activeDocumentsCount": 5,
      "sizeBytes": "15728640"
    }
  ],
  "nextPageToken": "next_page_token_here"
}
```

**TypeScript Example**:

```typescript
async function listFileSearchStores(): Promise<any[]> {
  const allStores = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(
      'https://generativelanguage.googleapis.com/v1beta/fileSearchStores'
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('pageSize', '20');

    const response = await fetch(url.toString(), {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    });

    const data = await response.json();
    allStores.push(...(data.fileSearchStores || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allStores;
}
```

---

### 4. Delete Store

**Purpose**: Deletes a File Search Store.

**Endpoint**:

```http
DELETE /v1beta/{name}
```

**Query Parameters**:

- `force` (optional): If `true`, deletes all documents in the store. Default: `false`

**Response**: Empty JSON object `{}`

**TypeScript Example**:

```typescript
async function deleteFileSearchStore(
  storeName: string,
  force: boolean = false
): Promise<void> {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/${storeName}`
  );
  if (force) url.searchParams.set('force', 'true');

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete store: ${response.statusText}`);
  }
}
```

**Warning**: Use `force=true` carefully - deletion is irreversible!

---

### 5. Import File

**Purpose**: Imports a file from File Service into a File Search Store for indexing.

**Endpoint**:

```http
POST /v1beta/{parent}/documents:importFile
```

**Path Parameters**:

- `parent`: Store name (e.g., `fileSearchStores/abc123`)

**Request Body**:

```json
{
  "fileName": "files/xyz789",
  "displayName": "Research Paper 1",
  "customMetadata": [
    {
      "key": "author",
      "stringValue": "John Doe"
    },
    {
      "key": "year",
      "numericValue": 2024
    },
    {
      "key": "categories",
      "stringListValue": {
        "values": ["machine-learning", "nlp"]
      }
    }
  ],
  "chunkingConfig": {
    "chunkSize": 800,
    "chunkOverlap": 100
  }
}
```

**Response**: Long-running operation

```json
{
  "name": "fileSearchStores/abc123/operations/op456",
  "metadata": { ... },
  "done": false
}
```

**TypeScript Example**:

```typescript
interface CustomMetadata {
  key: string;
  stringValue?: string;
  numericValue?: number;
  stringListValue?: { values: string[] };
}

async function importFileToStore(
  storeName: string,
  fileName: string,
  displayName: string,
  customMetadata: CustomMetadata[] = [],
  chunkingConfig?: { chunkSize: number; chunkOverlap: number }
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${storeName}/documents:importFile`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        fileName,
        displayName,
        customMetadata,
        chunkingConfig,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to import file: ${response.statusText}`);
  }

  const operation = await response.json();
  return operation.name; // Operation name for polling
}
```

---

### 6. Upload to Store

**Purpose**: Directly uploads a file to a File Search Store (bypasses File Service).

**Endpoint**:

```http
POST /upload/v1beta/{parent}/documents:upload
```

**Content-Type**: `multipart/related`

**Request Format**:

```
--boundary_string
Content-Type: application/json

{
  "displayName": "My PDF Document",
  "customMetadata": [...],
  "chunkingConfig": {...},
  "mimeType": "application/pdf"
}

--boundary_string
Content-Type: application/pdf

[Binary file data]
--boundary_string--
```

**Response**: Long-running operation

**TypeScript Example**:

```typescript
async function uploadToFileSearchStore(
  storeName: string,
  fileBuffer: Buffer,
  displayName: string,
  mimeType: string = 'application/pdf',
  customMetadata: CustomMetadata[] = []
): Promise<string> {
  const boundary =
    '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  const metadata = {
    displayName,
    customMetadata,
    chunkingConfig: {
      chunkSize: 800,
      chunkOverlap: 100,
    },
    mimeType,
  };

  // Build multipart body
  const parts = [
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
  ];

  const header = Buffer.from(parts.join('\r\n') + '\r\n', 'utf-8');
  const footer = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
  const body = Buffer.concat([header, fileBuffer, footer]);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/${storeName}/documents:upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
      },
      body,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
  }

  const operation = await response.json();
  return operation.name;
}
```

---

### 7. Get Operation

**Purpose**: Polls the status of a long-running operation (upload/import).

**Endpoint**:

```http
GET /v1beta/{name}
```

**Path Parameters**:

- `name`: Operation name (e.g., `fileSearchStores/abc123/operations/op789`)

**Response (In Progress)**:

```json
{
  "name": "fileSearchStores/abc123/operations/op789",
  "metadata": {
    "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.OperationMetadata",
    "progressPercentage": 45
  },
  "done": false
}
```

**Response (Completed)**:

```json
{
  "name": "fileSearchStores/abc123/operations/op789",
  "done": true,
  "response": {
    "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.Document",
    "name": "fileSearchStores/abc123/documents/doc123",
    "state": "STATE_ACTIVE"
  }
}
```

**Response (Failed)**:

```json
{
  "name": "fileSearchStores/abc123/operations/op789",
  "done": true,
  "error": {
    "code": 3,
    "message": "Failed to process document"
  }
}
```

**TypeScript Example**:

```typescript
async function pollOperation(
  operationName: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get operation: ${response.statusText}`);
    }

    const operation = await response.json();

    if (operation.done) {
      if (operation.error) {
        throw new Error(
          `Operation failed: ${operation.error.message} (code: ${operation.error.code})`
        );
      }
      return operation.response; // Document object
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Operation timed out');
}
```

---

## Documents API

### 1. Get Document

**Purpose**: Retrieves metadata about a specific Document.

**Endpoint**:

```http
GET /v1beta/{name}
```

**Path Parameters**:

- `name`: Document name (e.g., `fileSearchStores/abc123/documents/doc456`)

**Response**:

```json
{
  "name": "fileSearchStores/abc123/documents/doc456",
  "displayName": "Deep Learning Survey.pdf",
  "customMetadata": [
    {
      "key": "author",
      "stringValue": "John Doe"
    },
    {
      "key": "citations",
      "numericValue": 150
    }
  ],
  "state": "STATE_ACTIVE",
  "sizeBytes": "2097152",
  "mimeType": "application/pdf",
  "createTime": "2025-01-20T10:00:00Z",
  "updateTime": "2025-01-20T10:05:00Z"
}
```

**Document States**:

- `STATE_PENDING`: Some chunks are still being processed
- `STATE_ACTIVE`: All chunks processed, document is queryable
- `STATE_FAILED`: Processing failed

**TypeScript Example**:

```typescript
async function getDocument(documentName: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${documentName}`,
    {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get document: ${response.statusText}`);
  }

  return await response.json();
}
```

---

### 2. List Documents

**Purpose**: Lists all Documents in a File Search Store.

**Endpoint**:

```http
GET /v1beta/{parent}/documents
```

**Path Parameters**:

- `parent`: Store name (e.g., `fileSearchStores/abc123`)

**Query Parameters**:

- `pageSize` (optional): Max 20, default 10
- `pageToken` (optional): For pagination

**Response**:

```json
{
  "documents": [
    {
      "name": "fileSearchStores/abc123/documents/doc1",
      "displayName": "Paper 1.pdf",
      "state": "STATE_ACTIVE"
    }
  ],
  "nextPageToken": "next_page_token_here"
}
```

**TypeScript Example**:

```typescript
async function listDocuments(storeName: string): Promise<any[]> {
  const allDocuments = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/${storeName}/documents`
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('pageSize', '20');

    const response = await fetch(url.toString(), {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    });

    if (!response.ok) {
      throw new Error(`Failed to list documents: ${response.statusText}`);
    }

    const data = await response.json();
    allDocuments.push(...(data.documents || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allDocuments;
}
```

---

### 3. Query Documents

**Purpose**: Performs semantic search across document content.

**Endpoint**:

```http
POST /v1beta/{name}:query
```

**Path Parameters**:

- `name`: Store name (e.g., `fileSearchStores/abc123`)

**Request Body**:

```json
{
  "query": "What are the main findings about transformers?",
  "resultsCount": 5,
  "metadataFilters": [
    {
      "key": "year",
      "conditions": [
        {
          "operation": "GREATER_EQUAL",
          "numericValue": 2020
        }
      ]
    },
    {
      "key": "category",
      "conditions": [
        {
          "operation": "EQUAL",
          "stringValue": "machine-learning"
        }
      ]
    }
  ]
}
```

**Metadata Filter Operations**:

- `EQUAL`, `NOT_EQUAL`
- `LESS`, `LESS_EQUAL`
- `GREATER`, `GREATER_EQUAL`
- `INCLUDES`, `EXCLUDES` (for arrays)

**Response**:

```json
{
  "relevantChunks": [
    {
      "chunkRelevanceScore": 0.95,
      "chunk": {
        "name": "fileSearchStores/abc123/documents/doc1/chunks/chunk1",
        "data": {
          "stringValue": "Transformers have revolutionized NLP by..."
        },
        "customMetadata": [
          {
            "key": "page",
            "numericValue": 5
          }
        ]
      }
    }
  ]
}
```

**TypeScript Example**:

```typescript
interface MetadataFilter {
  key: string;
  conditions: Array<{
    operation:
      | 'EQUAL'
      | 'NOT_EQUAL'
      | 'LESS'
      | 'LESS_EQUAL'
      | 'GREATER'
      | 'GREATER_EQUAL'
      | 'INCLUDES'
      | 'EXCLUDES';
    stringValue?: string;
    numericValue?: number;
  }>;
}

async function queryDocuments(
  storeName: string,
  query: string,
  resultsCount: number = 10,
  metadataFilters: MetadataFilter[] = []
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${storeName}/documents:query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        query,
        resultsCount,
        metadataFilters,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.relevantChunks || [];
}
```

---

### 4. Delete Document

**Purpose**: Deletes a Document from a File Search Store.

**Endpoint**:

```http
DELETE /v1beta/{name}
```

**Query Parameters**:

- `force` (optional): If `true`, deletes associated chunks. Default: `false`

**Response**: Empty JSON object `{}`

**TypeScript Example**:

```typescript
async function deleteDocument(
  documentName: string,
  force: boolean = true
): Promise<void> {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/${documentName}`
  );
  if (force) url.searchParams.set('force', 'true');

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete document: ${response.statusText}`);
  }
}
```

---

## TypeScript Implementation Guide

### Complete CiteBite Integration Example

```typescript
// src/lib/gemini/file-search.ts

interface FileSearchStore {
  name: string;
  displayName: string;
  activeDocumentsCount: number;
  pendingDocumentsCount: number;
  failedDocumentsCount: number;
  sizeBytes: string;
}

interface Document {
  name: string;
  displayName: string;
  state: 'STATE_PENDING' | 'STATE_ACTIVE' | 'STATE_FAILED';
  customMetadata?: CustomMetadata[];
  sizeBytes: string;
  mimeType: string;
}

interface CustomMetadata {
  key: string;
  stringValue?: string;
  numericValue?: number;
  stringListValue?: { values: string[] };
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

class GeminiFileSearchClient {
  // Store Management
  async createStore(displayName: string): Promise<string> {
    const response = await fetch(`${BASE_URL}/fileSearchStores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({ displayName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create store: ${response.statusText}`);
    }

    const data = await response.json();
    return data.name;
  }

  async getStore(storeName: string): Promise<FileSearchStore> {
    const response = await fetch(`${BASE_URL}/${storeName}`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`Failed to get store: ${response.statusText}`);
    }

    return await response.json();
  }

  async deleteStore(storeName: string, force: boolean = true): Promise<void> {
    const url = new URL(`${BASE_URL}/${storeName}`);
    if (force) url.searchParams.set('force', 'true');

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete store: ${response.statusText}`);
    }
  }

  // Document Upload
  async uploadDocument(
    storeName: string,
    fileBuffer: Buffer,
    displayName: string,
    customMetadata: CustomMetadata[] = []
  ): Promise<string> {
    const boundary =
      '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    const metadata = {
      displayName,
      customMetadata,
      chunkingConfig: {
        chunkSize: 800,
        chunkOverlap: 100,
      },
      mimeType: 'application/pdf',
    };

    const parts = [
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/pdf',
      '',
    ];

    const header = Buffer.from(parts.join('\r\n') + '\r\n', 'utf-8');
    const footer = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
    const body = Buffer.concat([header, fileBuffer, footer]);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/${storeName}/documents:upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const operation = await response.json();
    return operation.name;
  }

  async pollOperation(operationName: string): Promise<Document> {
    const maxAttempts = 30;
    const intervalMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(`${BASE_URL}/${operationName}`, {
        headers: { 'x-goog-api-key': GEMINI_API_KEY },
      });

      if (!response.ok) {
        throw new Error(`Failed to get operation: ${response.statusText}`);
      }

      const operation = await response.json();

      if (operation.done) {
        if (operation.error) {
          throw new Error(
            `Operation failed: ${operation.error.message} (code: ${operation.error.code})`
          );
        }
        return operation.response;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Operation timed out after 60 seconds');
  }

  // Document Management
  async getDocument(documentName: string): Promise<Document> {
    const response = await fetch(`${BASE_URL}/${documentName}`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`Failed to get document: ${response.statusText}`);
    }

    return await response.json();
  }

  async listDocuments(storeName: string): Promise<Document[]> {
    const allDocuments: Document[] = [];
    let pageToken: string | null = null;

    do {
      const url = new URL(`${BASE_URL}/${storeName}/documents`);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      url.searchParams.set('pageSize', '20');

      const response = await fetch(url.toString(), {
        headers: { 'x-goog-api-key': GEMINI_API_KEY },
      });

      if (!response.ok) {
        throw new Error(`Failed to list documents: ${response.statusText}`);
      }

      const data = await response.json();
      allDocuments.push(...(data.documents || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return allDocuments;
  }

  async deleteDocument(
    documentName: string,
    force: boolean = true
  ): Promise<void> {
    const url = new URL(`${BASE_URL}/${documentName}`);
    if (force) url.searchParams.set('force', 'true');

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete document: ${response.statusText}`);
    }
  }

  // Search
  async query(storeName: string, query: string, resultsCount: number = 10) {
    const response = await fetch(`${BASE_URL}/${storeName}/documents:query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({ query, resultsCount }),
    });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.relevantChunks || [];
  }
}

export const fileSearchClient = new GeminiFileSearchClient();
```

---

## Best Practices

### 1. Chunking Configuration

**Recommended Settings**:

```json
{
  "chunkSize": 800,
  "chunkOverlap": 100
}
```

- `chunkSize`: Number of tokens per chunk
  - Too small: Loss of context
  - Too large: Lower search precision
  - 800 tokens ≈ 600 words (good for academic papers)

- `chunkOverlap`: Prevents sentences from being cut at chunk boundaries
  - 100-200 tokens recommended for overlap

### 2. Custom Metadata Strategy

**For CiteBite, use metadata to enable filtering**:

```typescript
const metadata = [
  { key: 'paperId', stringValue: 'arxiv:2024.12345' },
  { key: 'title', stringValue: 'Attention is All You Need' },
  { key: 'authors', stringListValue: { values: ['Vaswani', 'Shazeer'] } },
  { key: 'year', numericValue: 2017 },
  { key: 'citations', numericValue: 50000 },
  { key: 'venue', stringValue: 'NeurIPS' },
  { key: 'categories', stringListValue: { values: ['deep-learning', 'nlp'] } },
];
```

**Maximum 20 metadata entries per document**.

### 3. Operation Polling

**Implement exponential backoff for better efficiency**:

```typescript
async function pollWithBackoff(operationName: string): Promise<Document> {
  let delay = 1000; // Start with 1s
  const maxDelay = 10000; // Max 10s
  const maxAttempts = 30;

  for (let i = 0; i < maxAttempts; i++) {
    const operation = await getOperation(operationName);

    if (operation.done) {
      if (operation.error) throw new Error(operation.error.message);
      return operation.response;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay); // Exponential backoff
  }

  throw new Error('Operation timed out');
}
```

### 4. Batch Operations

**When uploading multiple documents, use Promise.all with concurrency limit**:

```typescript
async function uploadMultiple(
  storeName: string,
  files: Array<{ buffer: Buffer; name: string }>
) {
  const CONCURRENCY = 5; // Upload 5 at a time

  const results = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const operations = await Promise.all(
      batch.map(file => uploadDocument(storeName, file.buffer, file.name))
    );
    results.push(...operations);
  }

  return results;
}
```

### 5. Error Recovery

**Implement retry logic for transient failures**:

```typescript
async function uploadWithRetry(
  storeName: string,
  fileBuffer: Buffer,
  displayName: string,
  maxRetries: number = 3
): Promise<Document> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const operationName = await uploadDocument(
        storeName,
        fileBuffer,
        displayName
      );
      return await pollOperation(operationName);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Upload failed after retries');
}
```

---

## Error Handling

### Common Error Codes

| HTTP Code | Meaning      | Recommended Action                     |
| --------- | ------------ | -------------------------------------- |
| 400       | Bad Request  | Validate request body and parameters   |
| 401       | Unauthorized | Check API key validity                 |
| 403       | Forbidden    | Verify API key has correct permissions |
| 404       | Not Found    | Verify resource name is correct        |
| 429       | Rate Limited | Implement exponential backoff          |
| 500       | Server Error | Retry with exponential backoff         |

### Error Response Format

```json
{
  "error": {
    "code": 400,
    "message": "Invalid request body",
    "status": "INVALID_ARGUMENT",
    "details": [...]
  }
}
```

### Robust Error Handling Pattern

```typescript
async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[${context}] Error:`, error.message);

      // Check if it's a fetch error with response
      if ('response' in error) {
        const response = (error as any).response;
        if (response?.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (response?.status >= 500) {
          throw new Error('Gemini service temporarily unavailable.');
        }
      }

      throw new Error(`${context} failed: ${error.message}`);
    }
    throw error;
  }
}

// Usage
const store = await safeApiCall(
  () => createStore('My Collection'),
  'Create File Search Store'
);
```

---

## Limitations

### API Quotas

**Check official quota documentation**: https://ai.google.dev/gemini-api/docs/quota

Expected limits (subject to change):

- Free tier: 1GB vector storage
- Document size limit: 100MB per file
- Maximum metadata entries: 20 per document
- Maximum query results: 100 chunks

### Resource Limits

- **Display Name**: Max 512 characters
- **Document Name**: Max 40 characters (lowercase alphanumeric + dash)
- **Page Size**: Max 20 items for list operations
- **Custom Metadata Key**: Max length not specified in docs
- **String Metadata Value**: Max length not specified in docs

### Processing Time

- **Small PDFs (<5MB)**: 5-15 seconds
- **Large PDFs (>20MB)**: 30-60 seconds
- **Failed uploads**: Check error message for specific issue

### Best Practices for Limits

1. **Monitor store size**: Check `sizeBytes` regularly
2. **Clean up failed documents**: Use `deleteDocument(name, force=true)`
3. **Paginate list results**: Always handle `nextPageToken`
4. **Implement timeouts**: Don't poll operations forever

---

## Migration from Old Patterns

### If Your Code Uses Files API + Manual Embedding

**Old Pattern**:

```typescript
// Upload to Files API
const file = await uploadFile(buffer);

// Manually embed chunks
const chunks = splitIntoChunks(text);
const embeddings = await Promise.all(chunks.map(embed));

// Store in your own vector DB
await vectorDB.insert(embeddings);
```

**New Pattern** (File Search API):

```typescript
// Upload directly to File Search Store (automatic embedding)
const operationName = await uploadToFileSearchStore(
  storeName,
  buffer,
  displayName
);
const document = await pollOperation(operationName);

// Query using semantic search (no manual embedding needed)
const results = await queryDocuments(storeName, userQuery);
```

**Benefits**:

- No manual chunking or embedding logic
- Managed vector storage
- Built-in semantic search
- Grounding metadata for citations

---

## Reference Links

- [File Search Stores API Official Docs](https://ai.google.dev/api/file-search/file-search-stores)
- [Documents API Official Docs](https://ai.google.dev/api/file-search/documents)
- [Gemini API Quota Documentation](https://ai.google.dev/gemini-api/docs/quota)
- [Gemini API Error Reference](https://ai.google.dev/gemini-api/docs/troubleshooting)

---

**Document Version**: 1.0
**Last Verified**: 2025-01-20
**Maintainer**: CiteBite Development Team
