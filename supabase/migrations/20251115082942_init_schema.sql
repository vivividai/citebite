-- CiteBite Database Schema
-- Migration: init_schema
-- Created: 2025-11-15

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Users Table
-- =============================================
-- Links to Supabase Auth users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- Collections Table
-- =============================================
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  search_query TEXT NOT NULL,
  filters JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  file_search_store_id VARCHAR(255), -- Gemini File Search Store ID
  insight_summary JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  copy_count INT DEFAULT 0
);

-- =============================================
-- Papers Table
-- =============================================
CREATE TABLE papers (
  paper_id VARCHAR(255) PRIMARY KEY, -- Semantic Scholar Paper ID
  title TEXT NOT NULL,
  authors JSONB,
  year INT,
  abstract TEXT,
  citation_count INT,
  venue VARCHAR(255),
  open_access_pdf_url TEXT,
  pdf_source VARCHAR(20), -- 'auto' | 'manual'
  vector_status VARCHAR(20), -- 'pending' | 'completed' | 'failed'
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- Collection-Papers Junction Table (Many-to-Many)
-- =============================================
CREATE TABLE collection_papers (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  paper_id VARCHAR(255) REFERENCES papers(paper_id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, paper_id)
);

-- =============================================
-- Conversations Table
-- =============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- Messages Table
-- =============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  cited_papers JSONB, -- Array of paper IDs with citation metadata
  timestamp TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- Indexes for Performance
-- =============================================

-- Collections indexes
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_is_public ON collections(is_public);

-- Conversations indexes
CREATE INDEX idx_conversations_collection_id ON conversations(collection_id);

-- Messages indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Papers indexes (for sorting by citation count)
CREATE INDEX idx_papers_citation_count ON papers(citation_count DESC);

-- =============================================
-- Comments
-- =============================================

COMMENT ON TABLE users IS 'User profiles linked to Supabase Auth';
COMMENT ON TABLE collections IS 'Research paper collections with search criteria';
COMMENT ON TABLE papers IS 'Research papers from Semantic Scholar';
COMMENT ON TABLE collection_papers IS 'Many-to-many relationship between collections and papers';
COMMENT ON TABLE conversations IS 'AI chat conversations within a collection';
COMMENT ON TABLE messages IS 'Individual messages in a conversation with citations';

COMMENT ON COLUMN collections.file_search_store_id IS 'Gemini File Search Store ID for RAG';
COMMENT ON COLUMN collections.insight_summary IS 'Auto-generated insights (trends, top papers, gaps)';
COMMENT ON COLUMN papers.vector_status IS 'PDF indexing status: pending, completed, failed';
COMMENT ON COLUMN papers.pdf_source IS 'Source of PDF: auto (from Semantic Scholar) or manual (user upload)';
COMMENT ON COLUMN messages.cited_papers IS 'Array of cited paper IDs with grounding metadata from Gemini';
