/**
 * Supabase Storage Helper Functions
 * Task 1.8: Supabase Storage Setup
 *
 * Provides utilities for managing PDF files in Supabase Storage.
 * Uses admin client to bypass RLS policies for background worker operations.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';

const BUCKET_NAME = 'pdfs';
const DEFAULT_SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

/**
 * Generate storage path for a PDF file
 * Format: pdfs/{collectionId}/{paperId}.pdf
 */
export function getStoragePath(collectionId: string, paperId: string): string {
  return `${collectionId}/${paperId}.pdf`;
}

/**
 * Upload PDF to Supabase Storage
 *
 * @param collectionId - Collection UUID
 * @param paperId - Paper ID (Semantic Scholar ID)
 * @param file - PDF file as Buffer or Blob
 * @returns Storage path (e.g., "uuid/paper123.pdf")
 * @throws Error if upload fails
 */
export async function uploadPdf(
  collectionId: string,
  paperId: string,
  file: Buffer | Blob
): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getStoragePath(collectionId, paperId);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: true, // Overwrite if exists
    });

  if (error) {
    throw new Error(`Failed to upload PDF to storage: ${error.message}`);
  }

  return data.path;
}

/**
 * Get signed URL for PDF download
 *
 * @param collectionId - Collection UUID
 * @param paperId - Paper ID
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Signed URL for downloading the PDF
 * @throws Error if URL generation fails
 */
export async function getPdfUrl(
  collectionId: string,
  paperId: string,
  expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getStoragePath(collectionId, paperId);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }

  if (!data.signedUrl) {
    throw new Error('Signed URL is empty');
  }

  return data.signedUrl;
}

/**
 * Download PDF from Supabase Storage
 *
 * @param collectionId - Collection UUID
 * @param paperId - Paper ID
 * @returns PDF file as Buffer
 * @throws Error if download fails
 */
export async function downloadPdf(
  collectionId: string,
  paperId: string
): Promise<Buffer> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getStoragePath(collectionId, paperId);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    throw new Error(
      `Failed to download PDF from storage: ${error.message || JSON.stringify(error)}`
    );
  }

  if (!data) {
    throw new Error('Downloaded data is empty');
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete PDF from Supabase Storage
 *
 * @param collectionId - Collection UUID
 * @param paperId - Paper ID
 * @throws Error if deletion fails
 */
export async function deletePdf(
  collectionId: string,
  paperId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getStoragePath(collectionId, paperId);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete PDF from storage: ${error.message}`);
  }
}

/**
 * Check if PDF exists in storage
 *
 * @param collectionId - Collection UUID
 * @param paperId - Paper ID
 * @returns True if file exists, false otherwise
 */
export async function pdfExists(
  collectionId: string,
  paperId: string
): Promise<boolean> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(collectionId, {
      search: `${paperId}.pdf`,
    });

  if (error) {
    console.error('Error checking PDF existence:', error);
    return false;
  }

  return data.length > 0;
}
