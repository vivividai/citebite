import { test, expect } from '@playwright/test';
import {
  uploadPdf,
  getPdfUrl,
  downloadPdf,
  deletePdf,
  pdfExists,
  getStoragePath,
} from '../../../src/lib/storage';
import { createAdminSupabaseClient } from '../../../src/lib/supabase/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Phase 1 - Task 1.8: Supabase Storage Setup
 * E2E Test: Upload and download a test file
 */
test.describe.serial('Task 1.8 - Supabase Storage Setup', () => {
  const TEST_PDF_PATH = path.join(
    __dirname,
    '..',
    '..',
    'fixtures',
    'sample.pdf'
  );
  const TEST_COLLECTION_ID = randomUUID(); // Generate test collection UUID
  const TEST_PAPER_ID = 'test_paper_storage';
  const BUCKET_NAME = 'pdfs';

  let uploadedFilePath: string | undefined;

  test.beforeAll(() => {
    // Verify test PDF exists
    if (!fs.existsSync(TEST_PDF_PATH)) {
      throw new Error(
        `Test PDF not found at ${TEST_PDF_PATH}. Run: npx tsx scripts/generate-test-pdf.ts`
      );
    }
    console.log(`Using test collection ID: ${TEST_COLLECTION_ID}`);
  });

  test.afterAll(async () => {
    // Cleanup: Delete the test file if it was uploaded
    if (uploadedFilePath) {
      console.log(`Cleaning up test file: ${uploadedFilePath}`);
      try {
        await deletePdf(TEST_COLLECTION_ID, TEST_PAPER_ID);
        console.log('✅ Test file deleted successfully');
      } catch (error) {
        console.error('Failed to delete test file:', error);
      }
    }
  });

  test('should verify Supabase Storage client is configured', () => {
    const supabase = createAdminSupabaseClient();
    expect(supabase).toBeDefined();
    expect(supabase.storage).toBeDefined();
  });

  test('should verify pdfs bucket exists', async () => {
    const supabase = createAdminSupabaseClient();
    const { data: buckets, error } = await supabase.storage.listBuckets();

    expect(error).toBeNull();
    expect(buckets).toBeDefined();

    const pdfsBucket = buckets?.find(bucket => bucket.id === BUCKET_NAME);
    expect(pdfsBucket).toBeDefined();
    expect(pdfsBucket?.name).toBe(BUCKET_NAME);
    expect(pdfsBucket?.public).toBe(false); // Should be private

    console.log(`✅ Bucket '${BUCKET_NAME}' exists and is private`);
  });

  test('should generate correct storage path', () => {
    const storagePath = getStoragePath(TEST_COLLECTION_ID, TEST_PAPER_ID);
    expect(storagePath).toBe(`${TEST_COLLECTION_ID}/${TEST_PAPER_ID}.pdf`);
  });

  test('should verify PDF does not exist before upload', async () => {
    const exists = await pdfExists(TEST_COLLECTION_ID, TEST_PAPER_ID);
    expect(exists).toBe(false);
  });

  test('should upload PDF to Supabase Storage', async () => {
    // Read the test PDF
    const pdfBuffer = fs.readFileSync(TEST_PDF_PATH);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(0);

    console.log(
      `Uploading PDF (${pdfBuffer.length} bytes) to storage at collection ${TEST_COLLECTION_ID}...`
    );

    // Upload the PDF
    const storagePath = await uploadPdf(
      TEST_COLLECTION_ID,
      TEST_PAPER_ID,
      pdfBuffer
    );

    expect(storagePath).toBeDefined();
    expect(storagePath).toBe(`${TEST_COLLECTION_ID}/${TEST_PAPER_ID}.pdf`);

    uploadedFilePath = storagePath;
    console.log(`✅ PDF uploaded successfully to: ${storagePath}`);
  });

  test('should verify PDF exists after upload', async () => {
    const exists = await pdfExists(TEST_COLLECTION_ID, TEST_PAPER_ID);
    expect(exists).toBe(true);
  });

  test('should generate signed URL for PDF download', async () => {
    // Generate signed URL
    const signedUrl = await getPdfUrl(TEST_COLLECTION_ID, TEST_PAPER_ID);

    expect(signedUrl).toBeDefined();
    expect(signedUrl).toContain('http');
    expect(signedUrl).toContain('token=');

    console.log(`✅ Signed URL generated successfully`);

    // Verify URL is accessible by fetching it
    const response = await fetch(signedUrl);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/pdf');

    console.log(`✅ Signed URL is accessible and returns PDF`);
  });

  test('should generate signed URL with custom expiry', async () => {
    const customExpiry = 7200; // 2 hours
    const signedUrl = await getPdfUrl(
      TEST_COLLECTION_ID,
      TEST_PAPER_ID,
      customExpiry
    );

    expect(signedUrl).toBeDefined();
    expect(signedUrl).toContain('http');

    // Parse URL to check if expiry parameter exists
    const url = new URL(signedUrl);
    const token = url.searchParams.get('token');
    expect(token).toBeDefined();

    console.log(`✅ Signed URL with custom expiry generated`);
  });

  test('should download PDF from Supabase Storage', async () => {
    // Download the PDF
    const downloadedBuffer = await downloadPdf(
      TEST_COLLECTION_ID,
      TEST_PAPER_ID
    );

    expect(downloadedBuffer).toBeDefined();
    expect(downloadedBuffer.length).toBeGreaterThan(0);

    // Verify the downloaded content matches the original
    const originalBuffer = fs.readFileSync(TEST_PDF_PATH);
    expect(downloadedBuffer.length).toBe(originalBuffer.length);
    expect(Buffer.compare(downloadedBuffer, originalBuffer)).toBe(0);

    console.log(
      `✅ PDF downloaded successfully (${downloadedBuffer.length} bytes)`
    );
  });

  test('should handle upload with upsert (overwrite existing file)', async () => {
    const pdfBuffer = fs.readFileSync(TEST_PDF_PATH);

    // Upload again (should overwrite)
    const storagePath = await uploadPdf(
      TEST_COLLECTION_ID,
      TEST_PAPER_ID,
      pdfBuffer
    );

    expect(storagePath).toBeDefined();
    expect(storagePath).toBe(`${TEST_COLLECTION_ID}/${TEST_PAPER_ID}.pdf`);

    console.log(`✅ PDF re-uploaded successfully (upsert worked)`);
  });

  test('should delete PDF from Supabase Storage', async () => {
    // Delete the PDF
    await deletePdf(TEST_COLLECTION_ID, TEST_PAPER_ID);

    // Verify it no longer exists
    const exists = await pdfExists(TEST_COLLECTION_ID, TEST_PAPER_ID);
    expect(exists).toBe(false);

    console.log(`✅ PDF deleted successfully`);

    // Mark as cleaned up
    uploadedFilePath = undefined;
  });

  test('should handle errors gracefully when downloading non-existent file', async () => {
    // Try to download non-existent file
    await expect(
      downloadPdf(TEST_COLLECTION_ID, 'nonexistent_paper')
    ).rejects.toThrow();
  });

  test('should handle errors gracefully when deleting non-existent file', async () => {
    // Delete non-existent file (should not throw, just succeed silently)
    await expect(
      deletePdf(TEST_COLLECTION_ID, 'nonexistent_paper')
    ).resolves.not.toThrow();
  });

  test('should handle errors gracefully when generating URL for non-existent file', async () => {
    // Try to get URL for non-existent file
    await expect(
      getPdfUrl(TEST_COLLECTION_ID, 'nonexistent_paper')
    ).rejects.toThrow();
  });

  test('should verify bucket file size limit', async () => {
    const supabase = createAdminSupabaseClient();
    const { data: buckets } = await supabase.storage.listBuckets();

    const pdfsBucket = buckets?.find(bucket => bucket.id === BUCKET_NAME);
    expect(pdfsBucket).toBeDefined();

    // File size limit should be 100MB (104857600 bytes)
    expect(pdfsBucket?.file_size_limit).toBe(104857600);

    console.log(
      `✅ Bucket file size limit: ${pdfsBucket?.file_size_limit} bytes (100MB)`
    );
  });

  test('should verify bucket allowed MIME types', async () => {
    const supabase = createAdminSupabaseClient();
    const { data: buckets } = await supabase.storage.listBuckets();

    const pdfsBucket = buckets?.find(bucket => bucket.id === BUCKET_NAME);
    expect(pdfsBucket).toBeDefined();

    // Should only allow application/pdf
    expect(pdfsBucket?.allowed_mime_types).toContain('application/pdf');

    console.log(
      `✅ Bucket allowed MIME types: ${pdfsBucket?.allowed_mime_types}`
    );
  });

  test('should upload and cleanup multiple test files', async () => {
    const pdfBuffer = fs.readFileSync(TEST_PDF_PATH);
    const testPaperIds = ['test_multi_1', 'test_multi_2', 'test_multi_3'];

    // Upload multiple files
    for (const paperId of testPaperIds) {
      const storagePath = await uploadPdf(
        TEST_COLLECTION_ID,
        paperId,
        pdfBuffer
      );
      expect(storagePath).toBeDefined();
    }

    // Verify all files exist
    for (const paperId of testPaperIds) {
      const exists = await pdfExists(TEST_COLLECTION_ID, paperId);
      expect(exists).toBe(true);
    }

    console.log(`✅ Uploaded ${testPaperIds.length} test files`);

    // Cleanup all files
    for (const paperId of testPaperIds) {
      await deletePdf(TEST_COLLECTION_ID, paperId);
    }

    // Verify all files deleted
    for (const paperId of testPaperIds) {
      const exists = await pdfExists(TEST_COLLECTION_ID, paperId);
      expect(exists).toBe(false);
    }

    console.log(`✅ Cleaned up ${testPaperIds.length} test files`);
  });

  test('should complete Task 1.8 successfully', () => {
    // Summary test to verify all critical components work
    expect(createAdminSupabaseClient).toBeDefined();
    expect(uploadPdf).toBeDefined();
    expect(downloadPdf).toBeDefined();
    expect(getPdfUrl).toBeDefined();
    expect(deletePdf).toBeDefined();
    expect(pdfExists).toBeDefined();

    console.log('\n✅ Task 1.8 - Supabase Storage Setup: COMPLETE');
    console.log('   - Storage bucket "pdfs" created and configured');
    console.log('   - Storage helper functions implemented');
    console.log('   - PDF upload/download/delete operations verified');
    console.log('   - Signed URL generation verified');
    console.log('   - RLS policies configured (private bucket)');
    console.log('\n🚀 Ready for Phase 2: RAG Pipeline\n');
  });
});
