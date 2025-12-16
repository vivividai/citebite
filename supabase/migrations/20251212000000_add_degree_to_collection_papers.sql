-- Add degree column to track expansion level
ALTER TABLE collection_papers
ADD COLUMN degree SMALLINT DEFAULT 0;

-- degree values:
-- 0 = search (initial search results)
-- 1 = 1st degree expansion (refs/cites from search results)
-- 2 = 2nd degree expansion (refs/cites from degree 1)
-- 3 = 3rd degree expansion (refs/cites from degree 2)

-- Add constraint to ensure valid degree values
ALTER TABLE collection_papers
ADD CONSTRAINT chk_degree CHECK (degree >= 0 AND degree <= 3);

-- Add index for efficient degree-based queries
CREATE INDEX idx_collection_papers_degree ON collection_papers(collection_id, degree);

-- Comment for documentation
COMMENT ON COLUMN collection_papers.degree IS 'Expansion degree: 0=search, 1-3=expansion levels from initial search results';
