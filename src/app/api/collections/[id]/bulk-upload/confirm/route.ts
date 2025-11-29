/**
 * Bulk Upload Confirm API Route
 * POST /api/collections/[id]/bulk-upload/confirm
 *
 * Confirms user-reviewed matches, moves files from temp to permanent storage,
 * updates paper records, and queues indexing jobs.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { moveFromTempToPermanent } from '@/lib/storage/supabaseStorage';
import { queuePdfIndexing } from '@/lib/jobs/queues';
import { z } from 'zod';

// Request validation schema
const ConfirmRequestSchema = z.object({
  sessionId: z.string().uuid(),
  matches: z
    .array(
      z.object({
        fileId: z.string().uuid(),
        paperId: z.string().min(1),
      })
    )
    .min(1)
    .max(50),
});

interface ConfirmResult {
  success: Array<{
    fileId: string;
    paperId: string;
    jobId: string | null;
  }>;
  failed: Array<{
    fileId: string;
    paperId: string;
    error: string;
  }>;
  skipped: Array<{
    fileId: string;
    reason: string;
  }>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const parseResult = ConfirmRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { sessionId, matches } = parseResult.data;

    // 3. Verify session exists and belongs to user
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

    // 4. Check session status
    if (session.status === 'expired') {
      return NextResponse.json(
        { error: 'Session has expired' },
        { status: 400 }
      );
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Session already completed' },
        { status: 400 }
      );
    }

    // Check if session has expired by time
    if (new Date(session.expires_at) < new Date()) {
      await adminSupabase
        .from('bulk_upload_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId);

      return NextResponse.json(
        { error: 'Session has expired' },
        { status: 400 }
      );
    }

    // 5. Update session status to confirming
    await adminSupabase
      .from('bulk_upload_sessions')
      .update({
        status: 'confirming',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 6. Build file lookup from session
    const sessionFiles = session.files as Array<{
      fileId: string;
      filename: string;
      tempStorageKey: string;
    }>;
    const fileMap = new Map(sessionFiles.map(f => [f.fileId, f]));

    // 7. Verify all papers exist in collection
    const paperIds = matches.map(m => m.paperId);
    const { data: collectionPapers, error: papersError } = await adminSupabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', collectionId)
      .in('paper_id', paperIds);

    if (papersError) {
      return NextResponse.json(
        { error: 'Failed to verify papers' },
        { status: 500 }
      );
    }

    const validPaperIds = new Set(collectionPapers?.map(p => p.paper_id) || []);

    // 8. Process each match
    const results: ConfirmResult = {
      success: [],
      failed: [],
      skipped: [],
    };

    for (const match of matches) {
      const file = fileMap.get(match.fileId);

      // Skip if file not found in session
      if (!file) {
        results.skipped.push({
          fileId: match.fileId,
          reason: 'File not found in session',
        });
        continue;
      }

      // Skip if paper not in collection
      if (!validPaperIds.has(match.paperId)) {
        results.skipped.push({
          fileId: match.fileId,
          reason: 'Paper not in collection',
        });
        continue;
      }

      try {
        // Move file from temp to permanent storage
        const permanentPath = await moveFromTempToPermanent(
          file.tempStorageKey,
          collectionId,
          match.paperId
        );

        // Update paper record
        const { error: updateError } = await adminSupabase
          .from('papers')
          .update({
            pdf_source: 'manual_bulk',
            vector_status: 'pending',
            storage_path: permanentPath,
            uploaded_by: user.id,
          })
          .eq('paper_id', match.paperId);

        if (updateError) {
          throw new Error(`Failed to update paper: ${updateError.message}`);
        }

        // Queue indexing job
        const jobId = await queuePdfIndexing({
          collectionId,
          paperId: match.paperId,
          storageKey: permanentPath,
        });

        results.success.push({
          fileId: match.fileId,
          paperId: match.paperId,
          jobId,
        });
      } catch (error) {
        console.error(`Error processing match for ${match.fileId}:`, error);
        results.failed.push({
          fileId: match.fileId,
          paperId: match.paperId,
          error: error instanceof Error ? error.message : 'Processing failed',
        });
      }
    }

    // 9. Clean up remaining temp files (unconfirmed ones)
    const confirmedFileIds = new Set(matches.map(m => m.fileId));
    const unconfirmedFiles = sessionFiles.filter(
      f => !confirmedFileIds.has(f.fileId)
    );

    // Delete unconfirmed temp files
    for (const file of unconfirmedFiles) {
      try {
        const adminSb = createAdminSupabaseClient();
        await adminSb.storage.from('pdfs').remove([file.tempStorageKey]);
      } catch (error) {
        console.warn(
          `Failed to delete temp file ${file.tempStorageKey}:`,
          error
        );
      }
    }

    // 10. Update session to completed
    const finalStatus =
      results.success.length > 0
        ? 'completed'
        : results.failed.length > 0
          ? 'failed'
          : 'completed';

    await adminSupabase
      .from('bulk_upload_sessions')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 11. Return results
    return NextResponse.json({
      success: true,
      sessionId,
      results: {
        successCount: results.success.length,
        failedCount: results.failed.length,
        skippedCount: results.skipped.length,
        details: results,
      },
    });
  } catch (error) {
    console.error('Bulk upload confirm error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
