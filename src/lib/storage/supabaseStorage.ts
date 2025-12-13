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

/**
 * Delete all PDFs for a collection
 *
 * @param collectionId - Collection UUID
 * @returns Number of files deleted
 * @throws Error if deletion fails
 */
export async function deleteCollectionPdfs(
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  // List all files in the collection folder
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(collectionId);

  if (listError) {
    throw new Error(`Failed to list PDFs for collection: ${listError.message}`);
  }

  // If no files, return 0
  if (!files || files.length === 0) {
    return 0;
  }

  // Build full paths for all files
  const filePaths = files.map(file => `${collectionId}/${file.name}`);

  // Delete all files at once
  const { error: deleteError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(filePaths);

  if (deleteError) {
    throw new Error(
      `Failed to delete PDFs for collection: ${deleteError.message}`
    );
  }

  return files.length;
}

// ============================================
// Temporary Storage Functions (Bulk Upload)
// ============================================

/**
 * Generate temporary storage path for bulk upload
 * Format: temp/{userId}/{sessionId}/{fileId}.pdf
 */
export function getTempStoragePath(
  userId: string,
  sessionId: string,
  fileId: string
): string {
  return `temp/${userId}/${sessionId}/${fileId}.pdf`;
}

/**
 * Upload PDF to temporary storage for bulk upload
 *
 * @param userId - User UUID
 * @param sessionId - Bulk upload session UUID
 * @param fileId - Unique file identifier
 * @param file - PDF file as Buffer or Blob
 * @returns Temporary storage path
 * @throws Error if upload fails
 */
export async function uploadToTemp(
  userId: string,
  sessionId: string,
  fileId: string,
  file: Buffer | Blob
): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getTempStoragePath(userId, sessionId, fileId);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload to temp storage: ${error.message}`);
  }

  return data.path;
}

/**
 * Download PDF from temporary storage
 *
 * @param tempPath - Full temp storage path
 * @returns PDF file as Buffer
 * @throws Error if download fails
 */
export async function downloadFromTemp(tempPath: string): Promise<Buffer> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(tempPath);

  if (error) {
    throw new Error(`Failed to download from temp storage: ${error.message}`);
  }

  if (!data) {
    throw new Error('Downloaded data is empty');
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Move PDF from temporary storage to permanent storage
 * Downloads from temp, uploads to permanent, then deletes temp
 *
 * @param tempPath - Source path in temp storage
 * @param collectionId - Target collection UUID
 * @param paperId - Target paper ID
 * @returns Permanent storage path
 * @throws Error if move fails
 */
export async function moveFromTempToPermanent(
  tempPath: string,
  collectionId: string,
  paperId: string
): Promise<string> {
  const supabase = createAdminSupabaseClient();

  // 1. Download from temp
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(tempPath);

  if (downloadError || !fileData) {
    throw new Error(
      `Failed to download from temp: ${downloadError?.message || 'Empty data'}`
    );
  }

  // 2. Upload to permanent location
  const permanentPath = getStoragePath(collectionId, paperId);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(permanentPath, fileData, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `Failed to upload to permanent storage: ${uploadError.message}`
    );
  }

  // 3. Delete temp file
  const { error: deleteError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([tempPath]);

  if (deleteError) {
    // Log but don't throw - file is already in permanent storage
    console.warn(`Failed to delete temp file ${tempPath}:`, deleteError);
  }

  return permanentPath;
}

/**
 * Delete a single temp file
 *
 * @param tempPath - Path to temp file
 */
export async function deleteTempFile(tempPath: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.storage.from(BUCKET_NAME).remove([tempPath]);

  if (error) {
    throw new Error(`Failed to delete temp file: ${error.message}`);
  }
}

/**
 * Clean up all temp files for a bulk upload session
 *
 * @param userId - User UUID
 * @param sessionId - Session UUID
 * @returns Number of files deleted
 */
export async function cleanupTempSession(
  userId: string,
  sessionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();
  const folderPath = `temp/${userId}/${sessionId}`;

  // List all files in the session folder
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath);

  if (listError) {
    console.error(
      `Failed to list temp files for session ${sessionId}:`,
      listError
    );
    return 0;
  }

  if (!files || files.length === 0) {
    return 0;
  }

  // Build full paths
  const filePaths = files.map(file => `${folderPath}/${file.name}`);

  // Delete all files
  const { error: deleteError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(filePaths);

  if (deleteError) {
    console.error(
      `Failed to delete temp files for session ${sessionId}:`,
      deleteError
    );
    return 0;
  }

  return files.length;
}

/**
 * List all files in a temp session folder
 *
 * @param userId - User UUID
 * @param sessionId - Session UUID
 * @returns Array of file names
 */
export async function listTempSessionFiles(
  userId: string,
  sessionId: string
): Promise<string[]> {
  const supabase = createAdminSupabaseClient();
  const folderPath = `temp/${userId}/${sessionId}`;

  const { data: files, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath);

  if (error) {
    console.error(`Failed to list temp files:`, error);
    return [];
  }

  return files?.map(f => f.name) || [];
}

// ============================================
// Figure Storage Functions (Multimodal RAG)
// ============================================

/**
 * Generate storage path for a figure image
 * Format: figures/{paperId}/{figureNumber}.png
 */
export function getFigureStoragePath(
  paperId: string,
  figureNumber: string
): string {
  // Sanitize figure number for use as filename
  // "Figure 1" → "figure-1", "Table 2a" → "table-2a"
  const safeFigureNumber = figureNumber
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return `figures/${paperId}/${safeFigureNumber}.png`;
}

/**
 * Upload figure image to Supabase Storage
 *
 * @param imageBuffer - Figure image as PNG Buffer
 * @param paperId - Paper ID
 * @param figureNumber - Figure identifier (e.g., "Figure 1")
 * @returns Storage path
 * @throws Error if upload fails
 */
export async function uploadFigureImage(
  imageBuffer: Buffer,
  paperId: string,
  figureNumber: string
): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const storagePath = getFigureStoragePath(paperId, figureNumber);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, imageBuffer, {
      contentType: 'image/png',
      upsert: true, // Overwrite if exists
    });

  if (error) {
    throw new Error(`Failed to upload figure image: ${error.message}`);
  }

  return data.path;
}

/**
 * Get public URL for a figure image
 *
 * Note: This assumes the 'pdfs' bucket has public access enabled for the figures folder.
 * If not, use getSignedFigureUrl instead.
 *
 * @param storagePath - Full storage path of the figure
 * @returns Public URL for the figure image
 */
export function getFigurePublicUrl(storagePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }

  // Construct public URL
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${storagePath}`;
}

/**
 * Get signed URL for a figure image (for private access)
 *
 * @param storagePath - Full storage path of the figure
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Signed URL for the figure image
 */
export async function getSignedFigureUrl(
  storagePath: string,
  expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
): Promise<string> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(
      `Failed to generate signed URL for figure: ${error.message}`
    );
  }

  if (!data.signedUrl) {
    throw new Error('Signed URL is empty');
  }

  return data.signedUrl;
}

/**
 * Delete a figure image from storage
 *
 * @param storagePath - Full storage path of the figure
 */
export async function deleteFigureImage(storagePath: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete figure image: ${error.message}`);
  }
}

/**
 * Delete all figure images for a paper
 *
 * @param paperId - Paper ID
 * @returns Number of files deleted
 */
export async function deletePaperFigures(paperId: string): Promise<number> {
  const supabase = createAdminSupabaseClient();
  const folderPath = `figures/${paperId}`;

  // List all files in the paper's figures folder
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath);

  if (listError) {
    console.error(`Failed to list figures for paper ${paperId}:`, listError);
    return 0;
  }

  if (!files || files.length === 0) {
    return 0;
  }

  // Build full paths
  const filePaths = files.map(file => `${folderPath}/${file.name}`);

  // Delete all files
  const { error: deleteError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(filePaths);

  if (deleteError) {
    console.error(
      `Failed to delete figures for paper ${paperId}:`,
      deleteError
    );
    return 0;
  }

  return files.length;
}
