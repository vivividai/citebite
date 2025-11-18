-- Add performance indexes for conversations and messages tables
-- These indexes optimize queries for user-specific conversations and chronological message retrieval

-- Index for querying conversations by user
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Index for sorting conversations by creation date (most recent first)
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- Index for sorting messages chronologically within a conversation (most recent first)
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);

-- Add comment to document the purpose of these indexes
COMMENT ON INDEX idx_conversations_user_id IS 'Optimizes queries for fetching all conversations belonging to a specific user';
COMMENT ON INDEX idx_conversations_created_at IS 'Optimizes sorting conversations by creation date, especially for recent conversations';
COMMENT ON INDEX idx_messages_timestamp IS 'Optimizes chronological retrieval of messages within a conversation';
