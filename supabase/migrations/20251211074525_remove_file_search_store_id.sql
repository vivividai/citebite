-- Remove deprecated Gemini File Search Store ID column
-- This column was never used after switching to custom RAG with pgvector
-- The project now uses:
--   - Gemini text-embedding-004 for embeddings
--   - Supabase pgvector for vector storage
--   - paper_chunks table for storing chunked PDF content with embeddings

ALTER TABLE collections DROP COLUMN IF EXISTS file_search_store_id;

COMMENT ON TABLE collections IS 'User paper collections using custom RAG with pgvector';
