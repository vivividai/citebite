/**
 * PDF Upload API Route
 * POST /api/papers/[paperId]/upload?collectionId={collectionId}
 *
 * Allows users to manually upload PDFs for papers that failed automatic download.
 * This is typically used for papers behind paywalls or with restricted access.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { uploadPdf } from '@/lib/storage/supabaseStorage';
import { queuePdfIndexing } from '@/lib/jobs/queues';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Extract collectionId from query params
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collectionId');

    if (!collectionId) {
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    // 3. Verify collection ownership
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id')
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .single();

    if (collectionError || !collection) {
      return NextResponse.json(
        { error: 'Collection not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Verify paper exists in the collection
    const { data: collectionPaper, error: paperError } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', collectionId)
      .eq('paper_id', paperId)
      .single();

    if (paperError || !collectionPaper) {
      return NextResponse.json(
        { error: 'Paper not found in this collection' },
        { status: 404 }
      );
    }

    // 5. Parse FormData and extract file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 6. Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // 7. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB limit' },
        { status: 400 }
      );
    }

    // 8. Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await uploadPdf(paperId, buffer);

    // 9. Update paper record in database
    const { error: updateError } = await supabase
      .from('papers')
      .update({
        pdf_source: 'manual',
        text_vector_status: 'pending',
        image_vector_status: 'pending',
        storage_path: storagePath,
        uploaded_by: user.id,
      })
      .eq('paper_id', paperId);

    if (updateError) {
      console.error('Failed to update paper record:', updateError);
      return NextResponse.json(
        { error: 'Failed to update paper record' },
        { status: 500 }
      );
    }

    // 10. Queue PDF indexing job
    const jobId = await queuePdfIndexing({
      paperId,
      storageKey: storagePath,
    });

    if (!jobId) {
      console.warn('Failed to queue indexing job, but upload was successful');
    }

    return NextResponse.json({
      success: true,
      data: {
        paperId,
        storagePath,
        jobId,
        message: 'PDF uploaded successfully. Indexing has been queued.',
      },
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
