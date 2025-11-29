-- Bulk Upload Sessions Table
-- Task 3.5.7: Tracks multi-file PDF uploads with auto-matching
-- Sessions expire after 24 hours if not confirmed

-- Create bulk_upload_sessions table
CREATE TABLE IF NOT EXISTS bulk_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'processing', 'reviewing', 'confirming', 'completed', 'failed', 'expired')),
  -- Files array stores: { fileId, filename, tempStorageKey, size, status, matchResult, etc. }
  files JSONB NOT NULL DEFAULT '[]',
  -- Error log for debugging
  error_log JSONB NOT NULL DEFAULT '[]',
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for cleanup job to find expired sessions efficiently
CREATE INDEX idx_bulk_upload_sessions_expires
ON bulk_upload_sessions(expires_at)
WHERE status NOT IN ('completed', 'failed', 'expired');

-- Index for user's sessions lookup
CREATE INDEX idx_bulk_upload_sessions_user
ON bulk_upload_sessions(user_id, created_at DESC);

-- Index for collection sessions
CREATE INDEX idx_bulk_upload_sessions_collection
ON bulk_upload_sessions(collection_id);

-- Enable Row Level Security
ALTER TABLE bulk_upload_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own sessions
CREATE POLICY "Users can view own bulk upload sessions"
ON bulk_upload_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can create sessions for their own collections
CREATE POLICY "Users can create bulk upload sessions"
ON bulk_upload_sessions FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM collections
    WHERE id = collection_id AND user_id = auth.uid()
  )
);

-- Users can update their own sessions
CREATE POLICY "Users can update own bulk upload sessions"
ON bulk_upload_sessions FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Users can delete their own sessions
CREATE POLICY "Users can delete own bulk upload sessions"
ON bulk_upload_sessions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- Storage Policies for Temp Folder
-- ============================================
-- Temp folder structure: pdfs/temp/{userId}/{sessionId}/{fileId}.pdf

-- Policy: Users can upload to their temp folder
CREATE POLICY "Users can upload to temp folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs'
  AND (storage.foldername(name))[1] = 'temp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Users can read from their temp folder
CREATE POLICY "Users can read from temp folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (storage.foldername(name))[1] = 'temp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Users can delete from their temp folder
CREATE POLICY "Users can delete from temp folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (storage.foldername(name))[1] = 'temp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- ============================================
-- Helper Function for Session Cleanup
-- ============================================

-- Function to update file status in session (used by API)
CREATE OR REPLACE FUNCTION update_bulk_upload_file(
  p_session_id UUID,
  p_file_id TEXT,
  p_update JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE bulk_upload_sessions
  SET
    files = (
      SELECT jsonb_agg(
        CASE
          WHEN (f->>'fileId') = p_file_id THEN f || p_update
          ELSE f
        END
      )
      FROM jsonb_array_elements(files) AS f
    ),
    last_activity_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_bulk_upload_file TO authenticated;
