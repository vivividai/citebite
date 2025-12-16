-- Figures Bucket Migration
-- Migration: create_figures_bucket
-- Created: 2025-12-16
-- Description: Create separate storage bucket for figure images

-- =============================================
-- 1. Create figures bucket
-- =============================================
-- Separate bucket for figure images (extracted from PDFs)
-- Path format: {paperId}/{figureNumber}.png
INSERT INTO storage.buckets (id, name, public)
VALUES ('figures', 'figures', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. RLS Policies for figures bucket
-- =============================================

-- Allow authenticated users to read figures from papers in their collections
CREATE POLICY "Authenticated users can read figures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'figures'
  AND (storage.foldername(name))[1] IN (
    SELECT cp.paper_id FROM collection_papers cp
    JOIN collections c ON cp.collection_id = c.id
    WHERE c.user_id = auth.uid() OR c.is_public = true
  )
);

-- Service role has full access (for workers)
CREATE POLICY "Service role full access to figures"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'figures')
WITH CHECK (bucket_id = 'figures');

-- =============================================
-- 3. Comments
-- =============================================
-- Note: Cannot add comments to storage.buckets (system table)
-- Bucket documentation:
--   pdfs: PDF files stored as papers/{paperId}.pdf
--   figures: Figure images stored as {paperId}/{figureNumber}.png
