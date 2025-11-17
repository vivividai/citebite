-- Migration: Setup Supabase Storage Bucket for PDFs
-- Task: 1.8 Supabase Storage Setup
-- Description: Create 'pdfs' storage bucket, add storage_path to papers table, and configure RLS policies

-- ============================================================================
-- 1. Add storage_path column to papers table
-- ============================================================================

ALTER TABLE papers ADD COLUMN storage_path TEXT;

COMMENT ON COLUMN papers.storage_path IS 'Supabase Storage path (e.g., pdfs/{collectionId}/{paperId}.pdf)';

-- Create index for faster lookups by storage_path
CREATE INDEX idx_papers_storage_path ON papers(storage_path) WHERE storage_path IS NOT NULL;

-- ============================================================================
-- 2. Create 'pdfs' storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs',
  'pdfs',
  false, -- Private bucket
  104857600, -- 100MB limit (100 * 1024 * 1024 bytes)
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. Configure Row Level Security (RLS) policies for storage.objects
-- ============================================================================

-- Note: RLS is already enabled on storage.objects by default in Supabase
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy 1: Authenticated users can upload PDFs to their collections
-- Users can only upload to paths matching their collection IDs
-- Path format: pdfs/{collectionId}/{paperId}.pdf
-- storage.foldername('pdfs/uuid/file.pdf') returns {pdfs, uuid}
-- [1] = 'pdfs', [2] = collection UUID
CREATE POLICY "Users can upload PDFs to their collections"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text FROM collections WHERE user_id = auth.uid()
  )
);

-- Policy 2: Users can read PDFs from their own collections
-- This allows users to download PDFs from collections they own
CREATE POLICY "Users can read PDFs from their collections"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text FROM collections WHERE user_id = auth.uid()
  )
);

-- Policy 3: Users can delete PDFs from their own collections
CREATE POLICY "Users can delete PDFs from their collections"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text FROM collections WHERE user_id = auth.uid()
  )
);

-- Policy 4: Service role can do everything (for background workers)
-- This allows server-side operations using service role key
CREATE POLICY "Service role has full access to PDFs"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'pdfs')
WITH CHECK (bucket_id = 'pdfs');

-- ============================================================================
-- 4. Add helpful comments
-- ============================================================================

-- Note: Cannot add comments to storage.objects as it's a system-managed table
-- COMMENT ON TABLE storage.objects IS 'Storage objects table with RLS policies for PDF access control';
