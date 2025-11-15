/**
 * Queue Test API
 * POST /api/test/queue
 *
 * Test endpoint to verify BullMQ queues are working correctly
 * This is for development/testing only
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  queuePdfDownload,
  queuePdfIndexing,
  queueInsightGeneration,
  getPdfDownloadQueue,
  getPdfIndexQueue,
  getInsightQueue,
} from '@/lib/jobs/queues';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queueType } = body;

    let jobId: string | null = null;
    let queueName = '';

    // Add a test job to the specified queue
    switch (queueType) {
      case 'pdf-download':
        jobId = await queuePdfDownload({
          collectionId: 'test-collection-123',
          paperId: 'test-paper-456',
          pdfUrl: 'https://example.com/test.pdf',
        });
        queueName = 'pdf-download';
        break;

      case 'pdf-indexing':
        jobId = await queuePdfIndexing({
          collectionId: 'test-collection-123',
          paperId: 'test-paper-456',
          storageKey: 'test-storage-key',
        });
        queueName = 'pdf-indexing';
        break;

      case 'insight-generation':
        jobId = await queueInsightGeneration({
          collectionId: 'test-collection-123',
        });
        queueName = 'insight-generation';
        break;

      default:
        return NextResponse.json(
          {
            error:
              'Invalid queue type. Use: pdf-download, pdf-indexing, or insight-generation',
          },
          { status: 400 }
        );
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to queue job. Check Redis connection.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      queueName,
      message: `Test job successfully queued to ${queueName}`,
    });
  } catch (error) {
    console.error('Error queueing test job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/test/queue
 *
 * Check queue statistics
 */
export async function GET() {
  try {
    const pdfDownloadQueue = getPdfDownloadQueue();
    const pdfIndexQueue = getPdfIndexQueue();
    const insightQueue = getInsightQueue();

    if (!pdfDownloadQueue || !pdfIndexQueue || !insightQueue) {
      return NextResponse.json(
        { error: 'Queues not initialized. Check Redis connection.' },
        { status: 500 }
      );
    }

    // Get queue counts
    const [pdfDownloadCounts, pdfIndexCounts, insightCounts] =
      await Promise.all([
        pdfDownloadQueue.getJobCounts(),
        pdfIndexQueue.getJobCounts(),
        insightQueue.getJobCounts(),
      ]);

    return NextResponse.json({
      success: true,
      queues: {
        'pdf-download': pdfDownloadCounts,
        'pdf-indexing': pdfIndexCounts,
        'insight-generation': insightCounts,
      },
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
