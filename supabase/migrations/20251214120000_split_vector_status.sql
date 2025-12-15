-- Split vector_status into text_vector_status and image_vector_status
-- This migration supports the Figure Analysis Worker split

-- Add new columns
ALTER TABLE papers
ADD COLUMN text_vector_status VARCHAR(20) DEFAULT 'pending'
CHECK (text_vector_status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE papers
ADD COLUMN image_vector_status VARCHAR(20) DEFAULT 'pending'
CHECK (image_vector_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- Create indexes for efficient querying
CREATE INDEX idx_papers_text_vector_status ON papers(text_vector_status);
CREATE INDEX idx_papers_image_vector_status ON papers(image_vector_status);

-- Migrate existing data from vector_status to new columns
-- For existing completed papers: both text and image are completed
-- For existing failed papers: text failed, image skipped
-- For existing pending/processing papers: keep as is
UPDATE papers SET
  text_vector_status = CASE
    WHEN vector_status = 'completed' THEN 'completed'
    WHEN vector_status = 'failed' THEN 'failed'
    WHEN vector_status = 'processing' THEN 'processing'
    ELSE 'pending'
  END,
  image_vector_status = CASE
    WHEN vector_status = 'completed' THEN 'completed'
    WHEN vector_status = 'failed' THEN 'skipped'
    WHEN vector_status = 'processing' THEN 'pending'
    ELSE 'pending'
  END;

-- Drop the old vector_status column and its index
DROP INDEX IF EXISTS idx_papers_vector_status;
ALTER TABLE papers DROP COLUMN vector_status;
