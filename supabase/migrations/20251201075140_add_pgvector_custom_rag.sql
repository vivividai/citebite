-- Custom RAG with pgvector Migration
-- Migration: add_pgvector_custom_rag
-- Created: 2025-12-01
-- Description: Replaces Gemini File Search with custom pgvector-based RAG

-- =============================================
-- Enable pgvector Extension
-- =============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- paper_chunks Table
-- =============================================
-- Stores chunked text from PDFs with vector embeddings for RAG
CREATE TABLE paper_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id VARCHAR(255) NOT NULL REFERENCES papers(paper_id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,

  -- Chunk content
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  token_count INT NOT NULL,

  -- Vector embedding (Gemini text-embedding-004: 768 dimensions)
  embedding vector(768) NOT NULL,

  -- Full-text search (auto-generated tsvector)
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_chunk UNIQUE (paper_id, collection_id, chunk_index)
);

-- =============================================
-- Indexes for paper_chunks
-- =============================================

-- HNSW index for vector similarity (high recall, fast query)
-- m=16: max connections per node (higher = better recall, more memory)
-- ef_construction=128: search breadth during index build (higher = better quality, slower build)
CREATE INDEX idx_chunks_embedding_hnsw ON paper_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Collection filtering (most common filter)
CREATE INDEX idx_chunks_collection ON paper_chunks(collection_id);

-- Paper filtering (for deletion performance)
CREATE INDEX idx_chunks_paper ON paper_chunks(paper_id);

-- GIN index for full-text search
CREATE INDEX idx_chunks_content_tsv ON paper_chunks USING gin(content_tsv);

-- =============================================
-- Hybrid Search Function (RRF - Reciprocal Rank Fusion)
-- =============================================
-- Combines vector similarity search with keyword search
-- Weights: semantic (70%) + keyword (30%)
CREATE OR REPLACE FUNCTION hybrid_search(
  p_collection_id UUID,
  p_query_embedding vector(768),
  p_query_text TEXT,
  p_limit INT DEFAULT 20,
  p_semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id UUID,
  paper_id VARCHAR(255),
  content TEXT,
  chunk_index INT,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
WITH semantic AS (
  SELECT id, paper_id, content, chunk_index,
    1 - (embedding <=> p_query_embedding) AS score,
    ROW_NUMBER() OVER (ORDER BY embedding <=> p_query_embedding) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit * 2
),
keyword AS (
  SELECT id, paper_id, content, chunk_index,
    ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) AS score,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) DESC) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
    AND content_tsv @@ plainto_tsquery('english', p_query_text)
  LIMIT p_limit * 2
)
SELECT
  COALESCE(s.id, k.id) AS chunk_id,
  COALESCE(s.paper_id, k.paper_id) AS paper_id,
  COALESCE(s.content, k.content) AS content,
  COALESCE(s.chunk_index, k.chunk_index) AS chunk_index,
  COALESCE(s.score, 0)::FLOAT AS semantic_score,
  COALESCE(k.score, 0)::FLOAT AS keyword_score,
  -- RRF: 1/(k + rank) where k=60 is a constant
  (p_semantic_weight * COALESCE(1.0 / (60 + s.rank), 0) +
   (1 - p_semantic_weight) * COALESCE(1.0 / (60 + k.rank), 0))::FLOAT AS combined_score
FROM semantic s
FULL OUTER JOIN keyword k ON s.id = k.id
ORDER BY combined_score DESC
LIMIT p_limit;
$$ LANGUAGE SQL;

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================
ALTER TABLE paper_chunks ENABLE ROW LEVEL SECURITY;

-- Users can read chunks from their own collections
CREATE POLICY "Users can read own collection chunks"
ON paper_chunks FOR SELECT TO authenticated
USING (collection_id IN (SELECT id FROM collections WHERE user_id = auth.uid()));

-- Users can read chunks from public collections
CREATE POLICY "Users can read public collection chunks"
ON paper_chunks FOR SELECT TO authenticated
USING (collection_id IN (SELECT id FROM collections WHERE is_public = true));

-- Service role has full access (for workers)
CREATE POLICY "Service role full access"
ON paper_chunks FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- =============================================
-- Comments
-- =============================================
COMMENT ON TABLE paper_chunks IS 'Chunked PDF text with vector embeddings for custom RAG';
COMMENT ON COLUMN paper_chunks.embedding IS 'Gemini text-embedding-004 vector (768 dimensions)';
COMMENT ON COLUMN paper_chunks.content_tsv IS 'Auto-generated tsvector for full-text keyword search';
COMMENT ON COLUMN paper_chunks.chunk_index IS 'Sequential index of chunk within the paper';
COMMENT ON FUNCTION hybrid_search IS 'RRF-based hybrid search combining vector similarity (70%) and keyword search (30%)';
