-- Add AI-assisted collection creation fields
-- This migration adds support for AI-powered collection creation with
-- Gemini keyword extraction and SPECTER2 hybrid search

-- Add new columns to collections table
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS use_ai_assistant BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS natural_language_query TEXT,
ADD COLUMN IF NOT EXISTS similarity_threshold FLOAT,
ADD COLUMN IF NOT EXISTS candidate_count INT;

-- Add comments for documentation
COMMENT ON COLUMN collections.use_ai_assistant IS 'Whether this collection was created using AI-assisted mode';
COMMENT ON COLUMN collections.natural_language_query IS 'Original natural language query from user (AI mode only)';
COMMENT ON COLUMN collections.similarity_threshold IS 'SPECTER2 similarity threshold used for filtering (0.5-0.9)';
COMMENT ON COLUMN collections.candidate_count IS 'Number of candidate papers fetched before similarity filtering';

-- Set default values for existing collections (they were all manual)
UPDATE collections
SET use_ai_assistant = FALSE
WHERE use_ai_assistant IS NULL;

-- Create index for querying AI-assisted collections
CREATE INDEX IF NOT EXISTS idx_collections_ai_assisted ON collections(use_ai_assistant);
