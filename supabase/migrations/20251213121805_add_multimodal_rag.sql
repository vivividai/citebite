-- Multimodal RAG Migration
-- Migration: add_multimodal_rag
-- Created: 2025-12-13
-- Description: Extends paper_chunks for Figure/Chart extraction and analysis

-- =============================================
-- 1. Add chunk_type column
-- =============================================
ALTER TABLE paper_chunks
ADD COLUMN chunk_type VARCHAR(20) NOT NULL DEFAULT 'text'
CHECK (chunk_type IN ('text', 'figure'));

-- =============================================
-- 2. Add Figure-related columns
-- =============================================
ALTER TABLE paper_chunks
ADD COLUMN figure_number VARCHAR(50),           -- "Figure 1", "Fig. 2a", "Table 1" etc.
ADD COLUMN figure_caption TEXT,                  -- Original caption text
ADD COLUMN figure_description TEXT,              -- Vision AI generated detailed description
ADD COLUMN image_storage_path VARCHAR(500),      -- Supabase Storage path
ADD COLUMN page_number INT;                      -- Page number where figure is located

-- =============================================
-- 3. Add bidirectional linking columns
-- =============================================
-- Text chunks: which figures they reference
ALTER TABLE paper_chunks
ADD COLUMN referenced_figures VARCHAR(50)[];     -- e.g., ["Figure 1", "Table 2"]

-- Figure chunks: which text chunks mention this figure
ALTER TABLE paper_chunks
ADD COLUMN mentioned_in_chunk_ids UUID[];        -- IDs of text chunks that reference this figure

-- =============================================
-- 4. Add indexes for Figure search
-- =============================================

-- Index for filtering by chunk type
CREATE INDEX idx_chunks_type ON paper_chunks(chunk_type);

-- Index for finding figures by number
CREATE INDEX idx_chunks_figure_number ON paper_chunks(figure_number)
WHERE chunk_type = 'figure';

-- GIN index for searching referenced figures in text chunks
CREATE INDEX idx_chunks_referenced_figures ON paper_chunks USING GIN(referenced_figures)
WHERE chunk_type = 'text' AND referenced_figures IS NOT NULL;

-- =============================================
-- 5. Update hybrid_search function for multimodal support
-- =============================================
-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS hybrid_search(UUID, vector(768), TEXT, INT, FLOAT);

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
  chunk_type VARCHAR(20),
  figure_number VARCHAR(50),
  figure_caption TEXT,
  figure_description TEXT,
  image_storage_path VARCHAR(500),
  page_number INT,
  referenced_figures VARCHAR(50)[],
  mentioned_in_chunk_ids UUID[],
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
WITH semantic AS (
  SELECT id, paper_id, content, chunk_index,
    chunk_type, figure_number, figure_caption,
    figure_description, image_storage_path, page_number,
    referenced_figures, mentioned_in_chunk_ids,
    1 - (embedding <=> p_query_embedding) AS score,
    ROW_NUMBER() OVER (ORDER BY embedding <=> p_query_embedding) AS rank
  FROM paper_chunks
  WHERE collection_id = p_collection_id
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit * 2
),
keyword AS (
  SELECT id, paper_id, content, chunk_index,
    chunk_type, figure_number, figure_caption,
    figure_description, image_storage_path, page_number,
    referenced_figures, mentioned_in_chunk_ids,
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
  COALESCE(s.chunk_type, k.chunk_type) AS chunk_type,
  COALESCE(s.figure_number, k.figure_number) AS figure_number,
  COALESCE(s.figure_caption, k.figure_caption) AS figure_caption,
  COALESCE(s.figure_description, k.figure_description) AS figure_description,
  COALESCE(s.image_storage_path, k.image_storage_path) AS image_storage_path,
  COALESCE(s.page_number, k.page_number) AS page_number,
  COALESCE(s.referenced_figures, k.referenced_figures) AS referenced_figures,
  COALESCE(s.mentioned_in_chunk_ids, k.mentioned_in_chunk_ids) AS mentioned_in_chunk_ids,
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
-- 6. Comments
-- =============================================
COMMENT ON COLUMN paper_chunks.chunk_type IS 'Type of chunk: text (default) or figure';
COMMENT ON COLUMN paper_chunks.figure_number IS 'Figure identifier like "Figure 1", "Table 2"';
COMMENT ON COLUMN paper_chunks.figure_caption IS 'Original caption text from the paper';
COMMENT ON COLUMN paper_chunks.figure_description IS 'AI-generated detailed description of the figure';
COMMENT ON COLUMN paper_chunks.image_storage_path IS 'Path in Supabase Storage for figure image';
COMMENT ON COLUMN paper_chunks.page_number IS 'Page number where the figure appears';
COMMENT ON COLUMN paper_chunks.referenced_figures IS 'Array of figure numbers referenced by this text chunk';
COMMENT ON COLUMN paper_chunks.mentioned_in_chunk_ids IS 'Array of text chunk IDs that mention this figure';
