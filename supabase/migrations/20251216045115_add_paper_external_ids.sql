-- Add arxiv_id and doi columns to papers table for fallback PDF downloads
-- These external IDs enable ArXiv direct download and Unpaywall API lookup

ALTER TABLE papers
ADD COLUMN arxiv_id VARCHAR(255),
ADD COLUMN doi VARCHAR(255);

-- Create partial indexes for non-null values (more efficient for sparse columns)
CREATE INDEX idx_papers_arxiv_id ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;
CREATE INDEX idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN papers.arxiv_id IS 'ArXiv identifier for fallback PDF download (e.g., "2301.00001")';
COMMENT ON COLUMN papers.doi IS 'DOI for Unpaywall API fallback (e.g., "10.1234/example")';
