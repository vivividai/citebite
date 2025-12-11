-- Remove insight_summary column from collections table
-- This column was planned for Phase 6 (Insights Dashboard) which is no longer being implemented

ALTER TABLE collections DROP COLUMN IF EXISTS insight_summary;
