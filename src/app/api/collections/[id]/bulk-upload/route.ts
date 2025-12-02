/**
 * Bulk PDF Upload API Route
 * POST /api/collections/[id]/bulk-upload
 *
 * Uploads multiple PDFs and matches them to failed papers by searching
 * paper DOI/title inside PDF content.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { uploadToTemp } from '@/lib/storage/supabaseStorage';
import {
  matchPdfsToPapers,
  getUnmatchedPapers,
  Paper,
} from '@/lib/pdf/matcher';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 50;
const SESSION_EXPIRY_HOURS = 24;

// Helper function to extract DOI from open_access_pdf_url
// e.g., "https://dl.acm.org/doi/pdf/10.1145/3644815.3644945" -> "10.1145/3644815.3644945"
function extractDoiFromUrl(url: string | null): string | null {
  if (!url) return null;
  // Match DOI pattern: 10.xxxx/... in the URL
  const doiMatch = url.match(/10\.\d{4,}\/[^\s]+/);
  return doiMatch ? doiMatch[0] : null;
}

interface BulkUploadResponse {
  sessionId: string;
  results: Array<{
    fileId: string;
    filename: string;
    tempStorageKey: string;
    match: {
      paperId: string | null;
      paperTitle: string | null;
      confidence: 'high' | 'medium' | 'none';
      matchMethod: string;
    };
  }>;
  unmatchedPapers: Array<{ paperId: string; title: string }>;
  errors: Array<{ filename: string; error: string }>;
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

    // 2. Verify collection ownership
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, file_search_store_id')
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .single();

    if (collectionError || !collection) {
      return NextResponse.json(
        { error: 'Collection not found or access denied' },
        { status: 404 }
      );
    }

    // 3. Get papers in collection
    const adminSupabase = createAdminSupabaseClient();
    const { data: collectionPapers, error: papersError } = await adminSupabase
      .from('collection_papers')
      .select(
        `
        paper_id,
        papers!inner (
          paper_id,
          title,
          open_access_pdf_url,
          vector_status,
          storage_path
        )
      `
      )
      .eq('collection_id', collectionId);

    if (papersError) {
      console.error('Failed to fetch collection papers:', papersError);
      return NextResponse.json(
        { error: 'Failed to fetch collection papers' },
        { status: 500 }
      );
    }

    // Transform to Paper array
    type CollectionPaperRow = {
      paper_id: string;
      papers: {
        paper_id: string;
        title: string;
        open_access_pdf_url: string | null;
        vector_status: string | null;
        storage_path: string | null;
      };
    };
    const papers: Paper[] = (
      (collectionPapers as unknown as CollectionPaperRow[]) || []
    ).map(cp => ({
      paper_id: cp.papers.paper_id,
      title: cp.papers.title,
      doi: extractDoiFromUrl(cp.papers.open_access_pdf_url),
      external_ids: null,
      vector_status: cp.papers.vector_status,
      storage_path: cp.papers.storage_path,
    }));

    // 4. Parse FormData and extract files
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed` },
        { status: 400 }
      );
    }

    // 5. Create bulk upload session
    const sessionId = uuidv4();
    const expiresAt = new Date(
      Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000
    );

    const { error: sessionError } = await adminSupabase
      .from('bulk_upload_sessions')
      .insert({
        id: sessionId,
        user_id: user.id,
        collection_id: collectionId,
        status: 'uploading',
        files: [],
        expires_at: expiresAt.toISOString(),
      });

    if (sessionError) {
      console.error('Failed to create session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create upload session' },
        { status: 500 }
      );
    }

    // 6. Process each file - upload and collect buffers
    const processedFiles: Array<{
      fileId: string;
      filename: string;
      tempStorageKey: string;
      buffer: Buffer;
    }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      const fileId = uuidv4();

      try {
        // Validate file type
        if (file.type !== 'application/pdf') {
          errors.push({ filename: file.name, error: 'Not a PDF file' });
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push({
            filename: file.name,
            error: 'File size exceeds 100MB limit',
          });
          continue;
        }

        if (file.size < 1024) {
          errors.push({
            filename: file.name,
            error: 'File too small (possibly corrupt)',
          });
          continue;
        }

        // Get buffer and upload to temp storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const tempPath = await uploadToTemp(user.id, sessionId, fileId, buffer);

        processedFiles.push({
          fileId,
          filename: file.name,
          tempStorageKey: tempPath,
          buffer,
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        errors.push({
          filename: file.name,
          error: error instanceof Error ? error.message : 'Processing failed',
        });
      }
    }

    // 7. Match PDFs to papers (searches DOI/title in PDF content)
    const matchResults = await matchPdfsToPapers(processedFiles, papers);

    // 8. Get papers that still need PDFs (not matched)
    const unmatchedPapers = getUnmatchedPapers(papers, matchResults);

    // 9. Update session with results
    const sessionFiles = matchResults.map(result => ({
      fileId: result.fileId,
      filename: result.filename,
      tempStorageKey: result.tempStorageKey,
      uploadStatus: 'uploaded',
      processingStatus: 'matched',
      matchResult: {
        paperId: result.match.paperId,
        paperTitle: result.match.paperTitle,
        confidence: result.match.confidence,
        matchMethod: result.match.matchMethod,
      },
    }));

    await adminSupabase
      .from('bulk_upload_sessions')
      .update({
        status: 'reviewing',
        files: sessionFiles as unknown as import('@/types/database.types').Json,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 10. Return results
    const response: BulkUploadResponse = {
      sessionId,
      results: matchResults.map(r => ({
        fileId: r.fileId,
        filename: r.filename,
        tempStorageKey: r.tempStorageKey,
        match: r.match,
      })),
      unmatchedPapers,
      errors,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Bulk upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
