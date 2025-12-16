/**
 * Storage Module
 * Task 1.8: Supabase Storage Setup
 *
 * Exports all Supabase Storage helper functions for PDF management.
 */

export {
  // PDF functions
  uploadPdf,
  getPdfUrl,
  downloadPdf,
  deletePdf,
  pdfExists,
  getStoragePath,
  // Figure functions (Multimodal RAG)
  uploadFigureImage,
  getFigurePublicUrl,
  getSignedFigureUrl,
  deleteFigureImage,
  deletePaperFigures,
  getFigureStoragePath,
} from './supabaseStorage';
