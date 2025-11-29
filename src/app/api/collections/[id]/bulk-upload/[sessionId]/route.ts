/**
 * Bulk Upload Session Status API Route
 * GET /api/collections/[id]/bulk-upload/[sessionId]
 *
 * Returns the current status of a bulk upload session.
 * Used for polling during processing.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: collectionId, sessionId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get session
    const adminSupabase = createAdminSupabaseClient();
    const { data: session, error: sessionError } = await adminSupabase
      .from('bulk_upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('collection_id', collectionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // 3. Check if session has expired
    const isExpired = new Date(session.expires_at) < new Date();
    if (
      isExpired &&
      !['completed', 'failed', 'expired'].includes(session.status)
    ) {
      // Update status to expired
      await adminSupabase
        .from('bulk_upload_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId);

      session.status = 'expired';
    }

    // 4. Calculate progress
    const files = session.files as Array<{
      fileId: string;
      filename: string;
      uploadStatus: string;
      processingStatus: string;
      matchResult?: {
        paperId: string | null;
        confidence: string;
      };
    }>;

    const progress = {
      total: files.length,
      uploaded: files.filter(f => f.uploadStatus === 'uploaded').length,
      processing: files.filter(
        f =>
          f.processingStatus === 'extracting' ||
          f.processingStatus === 'matching'
      ).length,
      matched: files.filter(f => f.matchResult?.paperId !== null).length,
      unmatched: files.filter(
        f => f.matchResult && f.matchResult.paperId === null
      ).length,
      failed: files.filter(
        f => f.uploadStatus === 'failed' || f.processingStatus === 'failed'
      ).length,
    };

    // 5. Return session status
    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      files: files.map(f => ({
        fileId: f.fileId,
        filename: f.filename,
        uploadStatus: f.uploadStatus,
        processingStatus: f.processingStatus,
        matchResult: f.matchResult,
      })),
      progress,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
      lastActivityAt: session.last_activity_at,
    });
  } catch (error) {
    console.error('Session status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Extend session expiry (keep-alive during review)
 * POST /api/collections/[id]/bulk-upload/[sessionId]
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: collectionId, sessionId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Extend session
    const adminSupabase = createAdminSupabaseClient();
    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 hours

    const { data, error } = await adminSupabase
      .from('bulk_upload_sessions')
      .update({
        expires_at: newExpiresAt.toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('collection_id', collectionId)
      .gte('expires_at', new Date().toISOString()) // Only extend if not expired
      .select('id, expires_at')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Session not found, expired, or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: data.id,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error('Session extend error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Cancel and cleanup session
 * DELETE /api/collections/[id]/bulk-upload/[sessionId]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: collectionId, sessionId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get session to find temp files
    const adminSupabase = createAdminSupabaseClient();
    const { data: session, error: sessionError } = await adminSupabase
      .from('bulk_upload_sessions')
      .select('files')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('collection_id', collectionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // 3. Delete temp files
    const files = session.files as Array<{ tempStorageKey: string }>;
    const tempPaths = files
      .filter(f => f.tempStorageKey)
      .map(f => f.tempStorageKey);

    if (tempPaths.length > 0) {
      await adminSupabase.storage.from('pdfs').remove(tempPaths);
    }

    // 4. Delete session record
    await adminSupabase
      .from('bulk_upload_sessions')
      .delete()
      .eq('id', sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session cancelled and cleaned up',
      filesDeleted: tempPaths.length,
    });
  } catch (error) {
    console.error('Session delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
