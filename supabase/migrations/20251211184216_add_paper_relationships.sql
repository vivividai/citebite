-- Add relationship tracking columns to collection_papers
-- This enables graph visualization showing how papers are connected

-- Add source_paper_id to track which paper was expanded to find this one
ALTER TABLE collection_papers
ADD COLUMN source_paper_id VARCHAR(255) REFERENCES papers(paper_id) ON DELETE SET NULL;

-- Add relationship_type to distinguish between search results and expanded papers
ALTER TABLE collection_papers
ADD COLUMN relationship_type VARCHAR(20) DEFAULT 'search';

-- Add similarity_score for cosine similarity based coloring in graph
ALTER TABLE collection_papers
ADD COLUMN similarity_score DECIMAL(10, 8);

-- Add constraint to ensure valid relationship types
ALTER TABLE collection_papers
ADD CONSTRAINT chk_relationship_type
CHECK (relationship_type IN ('search', 'reference', 'citation'));

-- Add indexes for efficient graph queries
CREATE INDEX idx_collection_papers_source ON collection_papers(collection_id, source_paper_id);
CREATE INDEX idx_collection_papers_type ON collection_papers(collection_id, relationship_type);

-- Comment on columns for documentation
COMMENT ON COLUMN collection_papers.source_paper_id IS 'Paper ID from which this paper was discovered via references/citations expansion';
COMMENT ON COLUMN collection_papers.relationship_type IS 'How paper was added: search (initial), reference (from refs), citation (from cites)';
COMMENT ON COLUMN collection_papers.similarity_score IS 'Cosine similarity to collection query for graph coloring (0-1)';
