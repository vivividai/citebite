-- Chunk Deduplication Migration
-- Migration: remove_chunk_collection_id
-- Created: 2025-12-16
-- Description: Remove collection_id from paper_chunks to prevent duplicate embeddings
--              for the same paper across multiple collections.

-- =============================================
-- 1. Drop existing constraints and indexes
-- =============================================
ALTER TABLE paper_chunks DROP CONSTRAINT IF EXISTS unique_chunk;
DROP INDEX IF EXISTS idx_chunks_collection;

-- =============================================
-- 2. Drop old RLS policies BEFORE dropping column
-- =============================================
-- Drop old policies that filtered by collection_id
DROP POLICY IF EXISTS "Users can read own collection chunks" ON paper_chunks;
DROP POLICY IF EXISTS "Users can read public collection chunks" ON paper_chunks;

-- =============================================
-- 3. Clear existing data (clean slate)
-- =============================================
TRUNCATE TABLE paper_chunks;

-- =============================================
-- 4. Remove collection_id column
-- =============================================
ALTER TABLE paper_chunks DROP COLUMN collection_id;

-- =============================================
-- 5. Add new unique constraint (paper-level)
-- =============================================
-- Now chunks are unique per paper, not per paper+collection
ALTER TABLE paper_chunks
ADD CONSTRAINT unique_paper_chunk UNIQUE (paper_id, chunk_index, chunk_type);

-- =============================================
-- 6. Create new RLS Policies (JOIN with collection_papers)
-- =============================================

-- Users can read chunks for papers in their collections
CREATE POLICY "Users can read chunks for their papers"
ON paper_chunks FOR SELECT TO authenticated
USING (
  paper_id IN (
    SELECT cp.paper_id FROM collection_papers cp
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Users can read chunks for papers in public collections
CREATE POLICY "Users can read chunks for public papers"
ON paper_chunks FOR SELECT TO authenticated
USING (
  paper_id IN (
    SELECT cp.paper_id FROM collection_papers cp
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.is_public = true
  )
);

-- =============================================
-- 7. Update hybrid_search function (JOIN with collection_papers)
-- =============================================
-- Drop existing function (signature changed)
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
WITH collection_paper_ids AS (
  -- Get all paper_ids that belong to this collection
  SELECT paper_id FROM collection_papers WHERE collection_id = p_collection_id
),
semantic AS (
  SELECT pc.id, pc.paper_id, pc.content, pc.chunk_index,
    pc.chunk_type, pc.figure_number, pc.figure_caption,
    pc.figure_description, pc.image_storage_path, pc.page_number,
    pc.referenced_figures, pc.mentioned_in_chunk_ids,
    1 - (pc.embedding <=> p_query_embedding) AS score,
    ROW_NUMBER() OVER (ORDER BY pc.embedding <=> p_query_embedding) AS rank
  FROM paper_chunks pc
  WHERE pc.paper_id IN (SELECT paper_id FROM collection_paper_ids)
  ORDER BY pc.embedding <=> p_query_embedding
  LIMIT p_limit * 2
),
keyword AS (
  SELECT pc.id, pc.paper_id, pc.content, pc.chunk_index,
    pc.chunk_type, pc.figure_number, pc.figure_caption,
    pc.figure_description, pc.image_storage_path, pc.page_number,
    pc.referenced_figures, pc.mentioned_in_chunk_ids,
    ts_rank_cd(pc.content_tsv, plainto_tsquery('english', p_query_text)) AS score,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(pc.content_tsv, plainto_tsquery('english', p_query_text)) DESC) AS rank
  FROM paper_chunks pc
  WHERE pc.paper_id IN (SELECT paper_id FROM collection_paper_ids)
    AND pc.content_tsv @@ plainto_tsquery('english', p_query_text)
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
-- 8. Add index for efficient collection filtering
-- =============================================
CREATE INDEX IF NOT EXISTS idx_collection_papers_paper_id
ON collection_papers(paper_id);

-- =============================================
-- 9. Reset all papers to pending status (clean slate)
-- =============================================
UPDATE papers SET text_vector_status = 'pending', image_vector_status = 'pending';

-- =============================================
-- 10. Comments
-- =============================================
COMMENT ON FUNCTION hybrid_search IS 'RRF-based hybrid search combining vector similarity (70%) and keyword search (30%). Now uses collection_papers join to filter by collection.';
COMMENT ON CONSTRAINT unique_paper_chunk ON paper_chunks IS 'Chunks are unique per paper (not per paper+collection) to prevent duplicate embeddings';
